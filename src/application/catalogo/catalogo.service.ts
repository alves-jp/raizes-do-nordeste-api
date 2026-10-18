import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcaoAuditoria, CategoriaProduto } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro, naoEncontrado } from '../../domain/erros';
import { paraCentavos, paraReais } from '../../domain/dinheiro';
import { estaEmTemporada } from '../../domain/produto/sazonalidade';
import { Estoque, ItemCardapio, Produto, Unidade } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator, garantirAcessoAUnidade } from '../comum/ator';
import { deslocamento, Pagina, paginar, Paginacao } from '../comum/paginacao';
import { Relogio } from '../comum/relogio';

export interface DadosProduto {
  nome: string;
  descricao?: string | null;
  categoria: CategoriaProduto;
  sazonal?: boolean;
  mesInicio?: number | null;
  mesFim?: number | null;
  ativo?: boolean;
}

export type MotivoIndisponibilidade = 'PAUSADO_PELA_UNIDADE' | 'PRODUTO_INATIVO' | 'FORA_DE_TEMPORADA' | 'SEM_ESTOQUE';

@Injectable()
export class CatalogoService {
  constructor(
    @InjectRepository(Unidade) private readonly unidades: Repository<Unidade>,
    @InjectRepository(Produto) private readonly produtos: Repository<Produto>,
    @InjectRepository(ItemCardapio) private readonly cardapio: Repository<ItemCardapio>,
    private readonly uow: UnidadeDeTrabalho,
    private readonly auditoria: AuditoriaService,
    private readonly relogio: Relogio,
  ) {}

  // ------------------------------- Unidades -------------------------------

  async listarUnidades(paginacao: Paginacao): Promise<Pagina<Unidade>> {
    const [itens, total] = await this.unidades.findAndCount({ where: { ativa: true }, order: { id: 'ASC' }, ...deslocamento(paginacao) });
    return paginar(itens, total, paginacao);
  }

  async obterUnidade(id: number): Promise<Unidade> {
    const unidade = await this.unidades.findOne({ where: { id } });
    if (!unidade) throw naoEncontrado('Unidade', id);
    return unidade;
  }

  /**
   * Cardápio da unidade com disponibilidade calculada em tempo real:
   * item pausado, produto inativo, fora de temporada ou sem estoque aparece como indisponível.
   */
  async cardapioDaUnidade(unidadeId: number, filtros: { categoria?: CategoriaProduto; somenteDisponiveis?: boolean }, paginacao: Paginacao) {
    const unidade = await this.obterUnidade(unidadeId);
    const qb = this.cardapio
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.produto', 'p')
      .leftJoin(Estoque, 'e', 'e.unidade_id = c.unidade_id AND e.produto_id = c.produto_id')
      .addSelect('COALESCE(e.quantidade, 0)', 'quantidade_estoque')
      .where('c.unidade_id = :unidadeId', { unidadeId })
      .orderBy('p.categoria', 'ASC')
      .addOrderBy('p.nome', 'ASC');
    if (filtros.categoria) qb.andWhere('p.categoria = :categoria', { categoria: filtros.categoria });

    const { entities, raw } = await qb.getRawAndEntities();
    const agora = this.relogio.agora();
    let itens = entities.map((item, i) => {
      const quantidade = Number(raw[i].quantidade_estoque);
      const motivo = this.motivoIndisponibilidade(item, quantidade, agora);
      return {
        produtoId: item.produtoId,
        nome: item.produto!.nome,
        descricao: item.produto!.descricao,
        categoria: item.produto!.categoria,
        preco: paraReais(item.precoCentavos),
        sazonal: item.produto!.sazonal,
        disponivel: motivo === null,
        motivoIndisponibilidade: motivo,
      };
    });
    if (filtros.somenteDisponiveis) itens = itens.filter((i) => i.disponivel);
    const { skip, take } = deslocamento(paginacao);
    return {
      unidade: { id: unidade.id, nome: unidade.nome, cidade: unidade.cidade, uf: unidade.uf },
      ...paginar(itens.slice(skip, skip + take), itens.length, paginacao),
    };
  }

  motivoIndisponibilidade(item: ItemCardapio, estoque: number, agora: Date): MotivoIndisponibilidade | null {
    if (!item.disponivel) return 'PAUSADO_PELA_UNIDADE';
    if (!item.produto!.ativo) return 'PRODUTO_INATIVO';
    if (!estaEmTemporada(item.produto!, agora)) return 'FORA_DE_TEMPORADA';
    if (estoque <= 0) return 'SEM_ESTOQUE';
    return null;
  }

  /** Gerente (da própria unidade) ou ADMIN inclui/atualiza um produto no cardápio da unidade. */
  async definirItemDoCardapio(unidadeId: number, produtoId: number, dados: { preco: number; disponivel?: boolean }, ator: Ator) {
    garantirAcessoAUnidade(ator, unidadeId);
    await this.obterUnidade(unidadeId);
    const produto = await this.obterProduto(produtoId);
    return this.uow.executar(async (em) => {
      const existente = await em.findOne(ItemCardapio, { where: { unidadeId, produtoId } });
      const item = await em.save(
        ItemCardapio,
        em.merge(ItemCardapio, existente ?? em.create(ItemCardapio, { unidadeId, produtoId }), {
          precoCentavos: paraCentavos(dados.preco),
          disponivel: dados.disponivel ?? existente?.disponivel ?? true,
        }),
      );
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.CARDAPIO_ATUALIZADO,
        entidade: 'ItemCardapio',
        entidadeId: item.id,
        ator,
        unidadeId,
        detalhes: {
          produtoId,
          precoAnterior: existente ? paraReais(existente.precoCentavos) : null,
          precoNovo: paraReais(item.precoCentavos),
          disponivel: item.disponivel,
        },
      });
      return { unidadeId, produtoId, nome: produto.nome, preco: paraReais(item.precoCentavos), disponivel: item.disponivel };
    });
  }

  // ------------------------------- Produtos -------------------------------

  async listarProdutos(filtros: { categoria?: CategoriaProduto }, paginacao: Paginacao): Promise<Pagina<Produto>> {
    const where = filtros.categoria ? { categoria: filtros.categoria } : {};
    const [itens, total] = await this.produtos.findAndCount({ where, order: { id: 'ASC' }, ...deslocamento(paginacao) });
    return paginar(itens, total, paginacao);
  }

  async obterProduto(id: number): Promise<Produto> {
    const produto = await this.produtos.findOne({ where: { id } });
    if (!produto) throw naoEncontrado('Produto', id);
    return produto;
  }

  async criarProduto(dados: DadosProduto, ator: Ator): Promise<Produto> {
    this.validarSazonalidade(dados);
    return this.uow.executar(async (em) => {
      if (await em.exists(Produto, { where: { nome: dados.nome.trim() } })) {
        throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PRODUTO_JA_EXISTE', `Já existe um produto chamado "${dados.nome}".`, [
          { field: 'nome', issue: 'Nome já utilizado' },
        ]);
      }
      const produto = await em.save(
        em.create(Produto, {
          nome: dados.nome.trim(),
          descricao: dados.descricao ?? null,
          categoria: dados.categoria,
          sazonal: dados.sazonal ?? false,
          mesInicio: dados.sazonal ? dados.mesInicio! : null,
          mesFim: dados.sazonal ? dados.mesFim! : null,
          ativo: dados.ativo ?? true,
        }),
      );
      await this.auditoria.registrar(em, { acao: AcaoAuditoria.PRODUTO_CRIADO, entidade: 'Produto', entidadeId: produto.id, ator, detalhes: { nome: produto.nome } });
      return produto;
    });
  }

  async atualizarProduto(id: number, dados: Partial<DadosProduto>, ator: Ator): Promise<Produto> {
    const atual = await this.obterProduto(id);
    const combinado = { ...atual, ...dados };
    this.validarSazonalidade(combinado);
    return this.uow.executar(async (em) => {
      if (dados.nome && dados.nome.trim() !== atual.nome && (await em.exists(Produto, { where: { nome: dados.nome.trim() } }))) {
        throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PRODUTO_JA_EXISTE', `Já existe um produto chamado "${dados.nome}".`);
      }
      const produto = await em.save(
        Produto,
        em.merge(Produto, atual, {
          ...dados,
          nome: dados.nome?.trim() ?? atual.nome,
          mesInicio: combinado.sazonal ? combinado.mesInicio : null,
          mesFim: combinado.sazonal ? combinado.mesFim : null,
        }),
      );
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.PRODUTO_ATUALIZADO,
        entidade: 'Produto',
        entidadeId: id,
        ator,
        detalhes: { camposAlterados: Object.keys(dados) },
      });
      return produto;
    });
  }

  private validarSazonalidade(dados: Partial<DadosProduto>) {
    if (dados.sazonal && (dados.mesInicio == null || dados.mesFim == null)) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'SAZONALIDADE_INCOMPLETA', 'Produto sazonal precisa de mesInicio e mesFim (1 a 12).', [
        { field: 'mesInicio', issue: 'Obrigatório quando sazonal = true' },
        { field: 'mesFim', issue: 'Obrigatório quando sazonal = true' },
      ]);
    }
  }
}
