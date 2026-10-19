import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paraReais } from '../../domain/dinheiro';
import { AcaoAuditoria, Perfil, Regiao, StatusPagamento, StatusPedido } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro } from '../../domain/erros';
import { regiaoDaUf } from '../../domain/unidade/regras-unidade';
import { Pagamento, Pedido, Unidade } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator, garantirAcessoAUnidade } from '../comum/ator';
import { Relogio } from '../comum/relogio';
import { STATUS_PAGOS } from '../fidelidade/fidelidade.service';

export type Agrupamento = 'UNIDADE' | 'REGIAO';

export interface FiltrosRelatorio {
  de?: Date;
  ate?: Date;
  unidadeId?: number;
}

interface Totais {
  pedidosPagos: number;
  pedidosCancelados: number;
  brutoCentavos: number;
  descontoCampanhaCentavos: number;
  descontoFidelidadeCentavos: number;
  liquidoCentavos: number;
  estornadoCentavos: number;
}

const zerado = (): Totais => ({
  pedidosPagos: 0,
  pedidosCancelados: 0,
  brutoCentavos: 0,
  descontoCampanhaCentavos: 0,
  descontoFidelidadeCentavos: 0,
  liquidoCentavos: 0,
  estornadoCentavos: 0,
});

const somar = (a: Totais, b: Totais): Totais => ({
  pedidosPagos: a.pedidosPagos + b.pedidosPagos,
  pedidosCancelados: a.pedidosCancelados + b.pedidosCancelados,
  brutoCentavos: a.brutoCentavos + b.brutoCentavos,
  descontoCampanhaCentavos: a.descontoCampanhaCentavos + b.descontoCampanhaCentavos,
  descontoFidelidadeCentavos: a.descontoFidelidadeCentavos + b.descontoFidelidadeCentavos,
  liquidoCentavos: a.liquidoCentavos + b.liquidoCentavos,
  estornadoCentavos: a.estornadoCentavos + b.estornadoCentavos,
});

/** Converte os totais para reais. */
const financeiro = (t: Totais) => ({
  pedidosPagos: t.pedidosPagos,
  pedidosCancelados: t.pedidosCancelados,
  faturamentoBruto: paraReais(t.brutoCentavos),
  descontosCampanhas: paraReais(t.descontoCampanhaCentavos),
  descontosFidelidade: paraReais(t.descontoFidelidadeCentavos),
  faturamentoLiquido: paraReais(t.liquidoCentavos),
  ticketMedio: t.pedidosPagos ? paraReais(Math.round(t.liquidoCentavos / t.pedidosPagos)) : 0,
  valorEstornado: paraReais(t.estornadoCentavos),
});

/**
 * Relatórios da matriz por unidade ou região. GERENTE vê a própria unidade. ADMIN vê a rede.
 * Em produção, as consultas agregadas iriam para uma réplica de leitura.
 */
@Injectable()
export class RelatoriosService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidos: Repository<Pedido>,
    private readonly uow: UnidadeDeTrabalho,
    private readonly auditoria: AuditoriaService,
    private readonly relogio: Relogio,
  ) {}

  async vendas(filtros: FiltrosRelatorio, agruparPor: Agrupamento, ator: Ator) {
    const { de, ate, unidadeId } = this.normalizar(filtros, ator);
    const unidades = await this.pedidos.manager.find(Unidade, { where: unidadeId ? { id: unidadeId } : {}, order: { id: 'ASC' } });
    const porUnidade = await this.totaisPorUnidade(de, ate, unidadeId);

    const linhasUnidade = unidades.map((u) => {
      const t = porUnidade.get(u.id) ?? zerado();
      return {
        unidade: { id: u.id, nome: u.nome, cidade: u.cidade, uf: u.uf, regiao: regiaoDaUf(u.uf), formato: u.formato },
        totais: t,
        meta: u.metaMensalCentavos,
      };
    });

    let grupos: Record<string, unknown>[];
    if (agruparPor === 'REGIAO') {
      const regioes = new Map<Regiao, { unidades: number; totais: Totais; metaCentavos: number }>();
      for (const l of linhasUnidade) {
        const atual = regioes.get(l.unidade.regiao) ?? { unidades: 0, totais: zerado(), metaCentavos: 0 };
        regioes.set(l.unidade.regiao, {
          unidades: atual.unidades + 1,
          totais: somar(atual.totais, l.totais),
          metaCentavos: atual.metaCentavos + (l.meta ?? 0),
        });
      }
      grupos = [...regioes.entries()].map(([regiao, r]) => ({
        regiao,
        unidades: r.unidades,
        ...financeiro(r.totais),
        ...this.indicadorDeMeta(r.totais.liquidoCentavos, r.metaCentavos || null),
      }));
    } else {
      grupos = linhasUnidade.map((l) => ({
        ...l.unidade,
        ...financeiro(l.totais),
        ...this.indicadorDeMeta(l.totais.liquidoCentavos, l.meta),
      }));
    }
    const rede = linhasUnidade.reduce((acc, l) => somar(acc, l.totais), zerado());
    await this.registrarConsulta(ator, 'vendas', { agruparPor, unidadeId: unidadeId ?? null });
    return { periodo: { de, ate }, agruparPor, escopo: unidadeId ? { unidadeId } : 'REDE', grupos, consolidado: financeiro(rede) };
  }

  async produtosMaisVendidos(filtros: FiltrosRelatorio & { limite?: number }, ator: Ator) {
    const { de, ate, unidadeId } = this.normalizar(filtros, ator);
    const limite = filtros.limite ?? 10;
    const qb = this.pedidos
      .createQueryBuilder('p')
      .innerJoin('p.itens', 'i')
      .select('i.produto_id', 'produtoId')
      .addSelect('MAX(i.nome_produto)', 'nome')
      .addSelect('SUM(i.quantidade)', 'quantidade')
      .addSelect('SUM(i.subtotal_centavos)', 'faturamento')
      .addSelect('COUNT(DISTINCT p.id)', 'pedidos')
      .where('p.status IN (:...pagos)', { pagos: STATUS_PAGOS })
      .andWhere('p.criado_em >= :de AND p.criado_em <= :ate', { de, ate })
      .groupBy('i.produto_id')
      .orderBy('quantidade', 'DESC')
      .addOrderBy('faturamento', 'DESC')
      .limit(limite);
    if (unidadeId) qb.andWhere('p.unidade_id = :unidadeId', { unidadeId });
    const linhas = await qb.getRawMany<{ produtoId: number; nome: string; quantidade: number; faturamento: number; pedidos: number }>();
    const totalItens = linhas.reduce((s, l) => s + Number(l.quantidade), 0);
    await this.registrarConsulta(ator, 'produtos-mais-vendidos', { unidadeId: unidadeId ?? null, limite });
    return {
      periodo: { de, ate },
      escopo: unidadeId ? { unidadeId } : 'REDE',
      produtos: linhas.map((l, i) => ({
        posicao: i + 1,
        produtoId: Number(l.produtoId),
        nome: l.nome,
        quantidade: Number(l.quantidade),
        pedidos: Number(l.pedidos),
        faturamento: paraReais(Number(l.faturamento)),
        participacaoPercentual: totalItens ? Math.round((Number(l.quantidade) / totalItens) * 1000) / 10 : 0,
      })),
    };
  }

  /** Período padrão: mês corrente. GERENTE sempre restrito à unidade. */
  private normalizar(filtros: FiltrosRelatorio, ator: Ator) {
    const agora = this.relogio.agora();
    const de = filtros.de ?? new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const ate = filtros.ate ?? agora;
    if (de > ate) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'PERIODO_INVALIDO', 'A data inicial deve ser anterior à final.', [
        { field: 'de', issue: 'Deve ser menor ou igual a ate' },
      ]);
    }
    let unidadeId = filtros.unidadeId;
    if (ator.perfil !== Perfil.ADMIN) {
      if (unidadeId) garantirAcessoAUnidade(ator, unidadeId);
      unidadeId = ator.unidadeId!;
    }
    return { de, ate, unidadeId };
  }

  private async totaisPorUnidade(de: Date, ate: Date, unidadeId?: number): Promise<Map<number, Totais>> {
    const pagos = STATUS_PAGOS.map((s) => `'${s}'`).join(',');
    const qb = this.pedidos
      .createQueryBuilder('p')
      .select('p.unidade_id', 'unidadeId')
      .addSelect(`SUM(CASE WHEN p.status IN (${pagos}) THEN 1 ELSE 0 END)`, 'pagos')
      .addSelect(`SUM(CASE WHEN p.status = '${StatusPedido.CANCELADO}' THEN 1 ELSE 0 END)`, 'cancelados')
      .addSelect(`SUM(CASE WHEN p.status IN (${pagos}) THEN p.subtotal_centavos ELSE 0 END)`, 'bruto')
      .addSelect(`SUM(CASE WHEN p.status IN (${pagos}) THEN p.desconto_campanha_centavos ELSE 0 END)`, 'campanha')
      .addSelect(`SUM(CASE WHEN p.status IN (${pagos}) THEN p.desconto_pontos_centavos ELSE 0 END)`, 'fidelidade')
      .addSelect(`SUM(CASE WHEN p.status IN (${pagos}) THEN p.total_centavos ELSE 0 END)`, 'liquido')
      .where('p.criado_em >= :de AND p.criado_em <= :ate', { de, ate })
      .groupBy('p.unidade_id');
    if (unidadeId) qb.andWhere('p.unidade_id = :unidadeId', { unidadeId });
    const linhas = await qb.getRawMany<Record<string, number>>();

    const estornos = this.pedidos.manager
      .createQueryBuilder(Pagamento, 'pg')
      .innerJoin(Pedido, 'p', 'p.id = pg.pedido_id')
      .select('p.unidade_id', 'unidadeId')
      .addSelect('SUM(pg.valor_centavos)', 'estornado')
      .where('pg.status = :estornado', { estornado: StatusPagamento.ESTORNADO })
      .andWhere('p.criado_em >= :de AND p.criado_em <= :ate', { de, ate })
      .groupBy('p.unidade_id');
    if (unidadeId) estornos.andWhere('p.unidade_id = :unidadeId', { unidadeId });
    const linhasEstorno = await estornos.getRawMany<{ unidadeId: number; estornado: number }>();

    const mapa = new Map<number, Totais>();
    for (const l of linhas) {
      mapa.set(Number(l.unidadeId), {
        pedidosPagos: Number(l.pagos),
        pedidosCancelados: Number(l.cancelados),
        brutoCentavos: Number(l.bruto),
        descontoCampanhaCentavos: Number(l.campanha),
        descontoFidelidadeCentavos: Number(l.fidelidade),
        liquidoCentavos: Number(l.liquido),
        estornadoCentavos: 0,
      });
    }
    for (const e of linhasEstorno) {
      const t = mapa.get(Number(e.unidadeId)) ?? zerado();
      t.estornadoCentavos = Number(e.estornado);
      mapa.set(Number(e.unidadeId), t);
    }
    return mapa;
  }

  /** Percentual da meta mensal de faturamento líquido. */
  private indicadorDeMeta(liquidoCentavos: number, metaCentavos: number | null) {
    return {
      metaMensal: metaCentavos != null ? paraReais(metaCentavos) : null,
      percentualDaMeta: metaCentavos ? Math.round((liquidoCentavos / metaCentavos) * 1000) / 10 : null,
    };
  }

  private registrarConsulta(ator: Ator, relatorio: string, parametros: Record<string, unknown>) {
    return this.uow.executar((em) =>
      this.auditoria.registrar(em, {
        acao: AcaoAuditoria.RELATORIO_CONSULTADO,
        entidade: 'Relatorio',
        ator,
        unidadeId: ator.unidadeId,
        detalhes: { relatorio, ...parametros },
      }),
    );
  }
}
