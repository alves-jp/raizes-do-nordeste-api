import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcaoAuditoria, CategoriaProduto, FormatoUnidade } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro, naoEncontrado } from '../../domain/erros';
import { paraCentavos, paraReais } from '../../domain/dinheiro';
import { estaEmTemporada } from '../../domain/produto/sazonalidade';
import { regiaoDaUf, validarProdutoNoFormato } from '../../domain/unidade/regras-unidade';
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
  exigeCozinhaCompleta?: boolean;
  ativo?: boolean;
}

/** Visão pública da unidade (a meta mensal é interna). */
export function visaoDaUnidade(u: Unidade) {
  return {
    id: u.id,
    nome: u.nome,
    cidade: u.cidade,
    uf: u.uf,
    regiao: regiaoDaUf(u.uf),
    tipo: u.tipo,
    formato: u.formato,
    horarioFuncionamento: u.horarioFuncionamento,
    ativa: u.ativa,
  };
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

  async listarUnidades(paginacao: Paginacao): Promise<Pagina<ReturnType<typeof visaoDaUnidade>>> {
    const [itens, total] = await this.unidades.findAndCount({ where: { ativa: true }, order: { id: 'ASC' }, ...deslocamento(paginacao) });
    return paginar(itens.map(visaoDaUnidade), total, paginacao);
  }

  async detalharUnidade(id: number) {
    return visaoDaUnidade(await this.obterUnidade(id));
  }

  async obterUnidade(id: number): Promise<Unidade> {
    const unidade = await this.unidades.findOne({ where: { id } });
    if (!unidade) throw naoEncontrado('Unidade', id);
    return unidade;
  }

  /** Cardápio com disponibilidade calculada (pausa, inatividade, temporada e estoque). */
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
        variacaoRegional: item.variacaoRegional,
        sazonal: item.produto!.sazonal,
        disponivel: motivo === null,
        motivoIndisponibilidade: motivo,
      };
    });
    if (filtros.somenteDisponiveis) itens = itens.filter((i) => i.disponivel);
    const { skip, take } = deslocamento(paginacao);
    return {
      unidade: { id: unidade.id, nome: unidade.nome, cidade: unidade.cidade, uf: unidade.uf, formato: unidade.formato },
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

  /** Inclui/atualiza item do cardápio (GERENTE da unidade ou ADMIN). */
  async definirItemDoCardapio(
    unidadeId: number,
    produtoId: number,
    dados: { preco: number; disponivel?: boolean; variacaoRegional?: string | null },
    ator: Ator,
  ) {
    garantirAcessoAUnidade(ator, unidadeId);
    const unidade = await this.obterUnidade(unidadeId);
    const produto = await this.obterProduto(produtoId);
    validarProdutoNoFormato(produto, unidade);
    return this.uow.executar(async (em) => {
      const existente = await em.findOne(ItemCardapio, { where: { unidadeId, produtoId } });
      const item = await em.save(
        ItemCardapio,
        em.merge(ItemCardapio, existente ?? em.create(ItemCardapio, { unidadeId, produtoId }), {
          precoCentavos: paraCentavos(dados.preco),
          disponivel: dados.disponivel ?? existente?.disponivel ?? true,
          variacaoRegional: dados.variacaoRegional !== undefined ? dados.variacaoRegional?.trim() || null : (existente?.variacaoRegional ?? null),
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
          variacaoRegional: item.variacaoRegional,
        },
      });
      return {
        unidadeId,
        produtoId,
        nome: produto.nome,
        preco: paraReais(item.precoCentavos),
        disponivel: item.disponivel,
        variacaoRegional: item.variacaoRegional,
      };
    });
  }

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
          exigeCozinhaCompleta: dados.exigeCozinhaCompleta ?? false,
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
      if (dados.exigeCozinhaCompleta && !atual.exigeCozinhaCompleta) {
        const emUnidadesReduzidas = await em
          .createQueryBuilder(ItemCardapio, 'c')
          .innerJoin(Unidade, 'u', 'u.id = c.unidade_id')
          .where('c.produto_id = :id AND u.formato = :formato', { id, formato: FormatoUnidade.REDUZIDA })
          .getCount();
        if (emUnidadesReduzidas > 0) {
          throw new ErroDeDominio(
            NaturezaErro.CONFLITO,
            'PRODUTO_EM_UNIDADE_REDUZIDA',
            `O produto está no cardápio de ${emUnidadesReduzidas} unidade(s) em formato reduzido; retire-o desses cardápios antes de exigir cozinha completa.`,
            [{ field: 'exigeCozinhaCompleta', issue: 'Conflita com cardápios de unidades REDUZIDA' }],
          );
        }
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
