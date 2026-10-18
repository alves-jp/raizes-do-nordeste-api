import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AcaoAuditoria, TipoMovimentacaoEstoque } from '../../domain/enums';
import { DetalheErro, ErroDeDominio, NaturezaErro, naoEncontrado } from '../../domain/erros';
import { Estoque, MovimentacaoEstoque, Produto, Unidade } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator, garantirAcessoAUnidade } from '../comum/ator';
import { deslocamento, Pagina, paginar, Paginacao } from '../comum/paginacao';

export interface NovaMovimentacao {
  unidadeId: number;
  produtoId: number;
  tipo: TipoMovimentacaoEstoque.ENTRADA | TipoMovimentacaoEstoque.SAIDA;
  quantidade: number;
  motivo?: string;
}

@Injectable()
export class EstoqueService {
  constructor(
    @InjectRepository(Estoque) private readonly estoques: Repository<Estoque>,
    @InjectRepository(MovimentacaoEstoque) private readonly movimentacoes: Repository<MovimentacaoEstoque>,
    private readonly uow: UnidadeDeTrabalho,
    private readonly auditoria: AuditoriaService,
  ) {}

  async saldoDaUnidade(unidadeId: number, filtros: { somenteBaixo?: boolean }, paginacao: Paginacao, ator: Ator) {
    garantirAcessoAUnidade(ator, unidadeId);
    await this.garantirUnidade(unidadeId);
    const qb = this.estoques
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.produto', 'p')
      .where('e.unidade_id = :unidadeId', { unidadeId })
      .orderBy('p.nome', 'ASC');
    if (filtros.somenteBaixo) qb.andWhere('e.quantidade <= e.estoque_minimo');
    const { skip, take } = deslocamento(paginacao);
    const [itens, total] = await qb.skip(skip).take(take).getManyAndCount();
    return paginar(
      itens.map((e) => ({
        produtoId: e.produtoId,
        produto: e.produto!.nome,
        quantidade: e.quantidade,
        estoqueMinimo: e.estoqueMinimo,
        estoqueBaixo: e.quantidade <= e.estoqueMinimo,
        atualizadoEm: e.atualizadoEm,
      })),
      total,
      paginacao,
    );
  }

  /** Entrada (recebimento) ou saída manual (perda/descarte) — sempre com rastro. */
  async movimentar(dados: NovaMovimentacao, ator: Ator) {
    garantirAcessoAUnidade(ator, dados.unidadeId);
    if (dados.tipo === TipoMovimentacaoEstoque.SAIDA && !dados.motivo?.trim()) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'MOTIVO_OBRIGATORIO', 'Saídas manuais de estoque exigem motivo (ex.: perda, validade).', [
        { field: 'motivo', issue: 'Obrigatório para tipo SAIDA' },
      ]);
    }
    await this.garantirUnidade(dados.unidadeId);
    return this.uow.executar(async (em) => {
      const produto = await em.findOne(Produto, { where: { id: dados.produtoId } });
      if (!produto) throw naoEncontrado('Produto', dados.produtoId);

      let estoque = await em.findOne(Estoque, { where: { unidadeId: dados.unidadeId, produtoId: dados.produtoId } });
      if (!estoque) {
        if (dados.tipo === TipoMovimentacaoEstoque.SAIDA) {
          throw this.erroEstoqueInsuficiente([{ field: 'quantidade', issue: 'Disponível: 0' }]);
        }
        estoque = em.create(Estoque, { unidadeId: dados.unidadeId, produtoId: dados.produtoId, quantidade: 0 });
      }
      const delta = dados.tipo === TipoMovimentacaoEstoque.ENTRADA ? dados.quantidade : -dados.quantidade;
      if (estoque.quantidade + delta < 0) {
        throw this.erroEstoqueInsuficiente([{ field: 'quantidade', issue: `Disponível: ${estoque.quantidade}` }]);
      }
      estoque.quantidade += delta;
      estoque = await em.save(estoque);

      const mov = await em.save(
        em.create(MovimentacaoEstoque, {
          unidadeId: dados.unidadeId,
          produtoId: dados.produtoId,
          tipo: dados.tipo,
          quantidade: dados.quantidade,
          saldoApos: estoque.quantidade,
          motivo: dados.motivo?.trim() || null,
          usuarioId: ator.id,
        }),
      );
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.ESTOQUE_MOVIMENTADO,
        entidade: 'Estoque',
        entidadeId: estoque.id,
        ator,
        unidadeId: dados.unidadeId,
        detalhes: { produtoId: dados.produtoId, tipo: dados.tipo, quantidade: dados.quantidade, saldoApos: estoque.quantidade },
      });
      return {
        movimentacaoId: mov.id,
        unidadeId: dados.unidadeId,
        produtoId: dados.produtoId,
        produto: produto.nome,
        tipo: mov.tipo,
        quantidade: mov.quantidade,
        saldoAtual: estoque.quantidade,
        motivo: mov.motivo,
        criadoEm: mov.criadoEm,
      };
    });
  }

  async listarMovimentacoes(
    unidadeId: number,
    filtros: { produtoId?: number; tipo?: TipoMovimentacaoEstoque },
    paginacao: Paginacao,
    ator: Ator,
  ): Promise<Pagina<Record<string, unknown>>> {
    garantirAcessoAUnidade(ator, unidadeId);
    const where: Record<string, unknown> = { unidadeId };
    if (filtros.produtoId) where.produtoId = filtros.produtoId;
    if (filtros.tipo) where.tipo = filtros.tipo;
    const [itens, total] = await this.movimentacoes.findAndCount({
      where,
      relations: { produto: true },
      order: { id: 'DESC' },
      ...deslocamento(paginacao),
    });
    return paginar(
      itens.map((m) => ({
        id: m.id,
        produtoId: m.produtoId,
        produto: m.produto?.nome,
        tipo: m.tipo,
        quantidade: m.quantidade,
        saldoApos: m.saldoApos,
        motivo: m.motivo,
        pedidoId: m.pedidoId,
        usuarioId: m.usuarioId,
        criadoEm: m.criadoEm,
      })),
      total,
      paginacao,
    );
  }

  // ---- Usados pelo fluxo de pedidos, dentro da transação do pedido ----

  /**
   * Baixa o estoque de todos os itens do pedido. Se QUALQUER item não tiver saldo,
   * nada é baixado (a transação inteira é desfeita) e todos os itens faltantes são informados.
   */
  async reservarParaPedido(em: EntityManager, unidadeId: number, pedidoId: number, itens: { produtoId: number; quantidade: number; nome: string }[], ator: Ator) {
    const estoques = await em.find(Estoque, { where: { unidadeId, produtoId: In(itens.map((i) => i.produtoId)) } });
    const faltas: DetalheErro[] = [];
    itens.forEach((item, indice) => {
      const disponivel = estoques.find((e) => e.produtoId === item.produtoId)?.quantidade ?? 0;
      if (disponivel < item.quantidade) {
        faltas.push({ field: `itens[${indice}].quantidade`, issue: `${item.nome}: solicitado ${item.quantidade}, disponível ${disponivel}` });
      }
    });
    if (faltas.length) throw this.erroEstoqueInsuficiente(faltas);

    for (const item of itens) {
      const estoque = estoques.find((e) => e.produtoId === item.produtoId)!;
      estoque.quantidade -= item.quantidade;
      await em.update(Estoque, estoque.id, { quantidade: estoque.quantidade });
      await em.insert(MovimentacaoEstoque, {
        unidadeId,
        produtoId: item.produtoId,
        tipo: TipoMovimentacaoEstoque.RESERVA_PEDIDO,
        quantidade: item.quantidade,
        saldoApos: estoque.quantidade,
        pedidoId,
        usuarioId: ator.id,
      });
    }
  }

  async devolverDoPedido(em: EntityManager, unidadeId: number, pedidoId: number, itens: { produtoId: number; quantidade: number }[], ator: Ator) {
    for (const item of itens) {
      const estoque = await em.findOne(Estoque, { where: { unidadeId, produtoId: item.produtoId } });
      if (!estoque) continue;
      estoque.quantidade += item.quantidade;
      await em.update(Estoque, estoque.id, { quantidade: estoque.quantidade });
      await em.insert(MovimentacaoEstoque, {
        unidadeId,
        produtoId: item.produtoId,
        tipo: TipoMovimentacaoEstoque.ESTORNO_PEDIDO,
        quantidade: item.quantidade,
        saldoApos: estoque.quantidade,
        motivo: 'Cancelamento do pedido',
        pedidoId,
        usuarioId: ator.id,
      });
    }
  }

  private erroEstoqueInsuficiente(detalhes: DetalheErro[]) {
    return new ErroDeDominio(NaturezaErro.CONFLITO, 'ESTOQUE_INSUFICIENTE', 'Não há quantidade suficiente em estoque para um ou mais itens.', detalhes);
  }

  private async garantirUnidade(unidadeId: number) {
    if (!(await this.estoques.manager.exists(Unidade, { where: { id: unidadeId } }))) throw naoEncontrado('Unidade', unidadeId);
  }
}
