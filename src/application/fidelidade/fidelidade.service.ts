import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';
import { FinalidadeConsentimento, StatusPedido, TipoTransacaoFidelidade } from '../../domain/enums';
import { calcularNivel, calcularPontosGanhos, NIVEIS_FIDELIDADE, REGRAS_FIDELIDADE } from '../../domain/fidelidade/regras-fidelidade';
import { paraReais } from '../../domain/dinheiro';
import { Consentimento, Pedido, TransacaoFidelidade } from '../../infrastructure/database/entidades';
import { Ator } from '../comum/ator';
import { deslocamento, Pagina, paginar, Paginacao } from '../comum/paginacao';
import { Relogio } from '../comum/relogio';

/** Status que representam um pedido efetivamente pago (contam para frequência e faturamento). */
export const STATUS_PAGOS = [StatusPedido.PAGO, StatusPedido.EM_PREPARO, StatusPedido.PRONTO, StatusPedido.ENTREGUE];

/** Programa de fidelidade "Cliente Raiz". */
@Injectable()
export class FidelidadeService {
  constructor(
    @InjectRepository(TransacaoFidelidade) private readonly transacoes: Repository<TransacaoFidelidade>,
    private readonly relogio: Relogio,
  ) {}

  /** Nível pela frequência: pedidos pagos nos últimos 90 dias. */
  async nivel(clienteId: number, em: EntityManager = this.transacoes.manager) {
    const desde = new Date(this.relogio.agora().getTime() - REGRAS_FIDELIDADE.janelaDeFrequenciaEmDias * 86_400_000);
    const pedidosPagos = await em.count(Pedido, { where: { clienteId, status: In(STATUS_PAGOS), criadoEm: MoreThanOrEqual(desde) } });
    return { ...calcularNivel(pedidosPagos), pedidosPagosNaJanela: pedidosPagos };
  }

  async saldo(clienteId: number, em: EntityManager = this.transacoes.manager): Promise<number> {
    const resultado = await em
      .createQueryBuilder(TransacaoFidelidade, 't')
      .select('COALESCE(SUM(t.pontos), 0)', 'saldo')
      .where('t.cliente_id = :clienteId', { clienteId })
      .getRawOne<{ saldo: number }>();
    return Number(resultado?.saldo ?? 0);
  }

  /** Consentimento vigente = registro mais recente para a finalidade. */
  async temConsentimento(
    usuarioId: number,
    finalidade: FinalidadeConsentimento,
    em: EntityManager = this.transacoes.manager,
  ): Promise<boolean> {
    const ultimo = await em.findOne(Consentimento, {
      where: { usuarioId, finalidade },
      order: { registradoEm: 'DESC', id: 'DESC' },
    });
    return ultimo?.concedido ?? false;
  }

  async resumo(ator: Ator) {
    const saldo = await this.saldo(ator.id);
    const nivel = await this.nivel(ator.id);
    return {
      saldo,
      saldoEmReais: paraReais(saldo * nivel.valorDoPontoEmCentavos),
      participando: await this.temConsentimento(ator.id, FinalidadeConsentimento.FIDELIDADE),
      nivel: nivel.nivel,
      pedidosPagosUltimos90Dias: nivel.pedidosPagosNaJanela,
      valorDoPonto: paraReais(nivel.valorDoPontoEmCentavos),
      proximoNivel: nivel.proximoNivel,
      regras: {
        pontosPorReal: `1 ponto a cada R$ ${(REGRAS_FIDELIDADE.centavosPorPonto / 100).toFixed(2)}`,
        niveis: NIVEIS_FIDELIDADE.map((n) => ({
          nivel: n.nivel,
          pedidosPagosEm90Dias: n.pedidosMinimos,
          valorDoPonto: paraReais(n.valorDoPontoEmCentavos),
        })),
        resgateMinimo: REGRAS_FIDELIDADE.resgateMinimo,
        descontoMaximoPercentual: REGRAS_FIDELIDADE.percentualMaximoDeDesconto,
      },
    };
  }

  async extrato(ator: Ator, paginacao: Paginacao): Promise<Pagina<Record<string, unknown>>> {
    const [itens, total] = await this.transacoes.findAndCount({
      where: { clienteId: ator.id },
      order: { id: 'DESC' },
      ...deslocamento(paginacao),
    });
    return paginar(
      itens.map((t) => ({ id: t.id, tipo: t.tipo, pontos: t.pontos, descricao: t.descricao, pedidoId: t.pedidoId, criadoEm: t.criadoEm })),
      total,
      paginacao,
    );
  }

  async debitarResgate(em: EntityManager, pedido: Pedido): Promise<void> {
    if (!pedido.clienteId || pedido.pontosResgatados <= 0) return;
    await em.insert(TransacaoFidelidade, {
      clienteId: pedido.clienteId,
      pedidoId: pedido.id,
      tipo: TipoTransacaoFidelidade.RESGATE,
      pontos: -pedido.pontosResgatados,
      descricao: `Resgate de ${pedido.pontosResgatados} pontos no pedido #${pedido.id}`,
    });
  }

  /** Credita pontos se houver consentimento FIDELIDADE e retorna o total. */
  async creditarPorPagamento(em: EntityManager, pedido: Pedido): Promise<number> {
    if (!pedido.clienteId) return 0;
    if (!(await this.temConsentimento(pedido.clienteId, FinalidadeConsentimento.FIDELIDADE, em))) return 0;
    const pontos = calcularPontosGanhos(pedido.totalCentavos);
    if (pontos <= 0) return 0;
    await em.insert(TransacaoFidelidade, {
      clienteId: pedido.clienteId,
      pedidoId: pedido.id,
      tipo: TipoTransacaoFidelidade.ACUMULO,
      pontos,
      descricao: `Pontos do pedido #${pedido.id}`,
    });
    return pontos;
  }

  async estornarPedido(em: EntityManager, pedido: Pedido): Promise<{ devolvidos: number; estornados: number }> {
    if (!pedido.clienteId) return { devolvidos: 0, estornados: 0 };
    let devolvidos = 0;
    if (pedido.pontosResgatados > 0) {
      devolvidos = pedido.pontosResgatados;
      await em.insert(TransacaoFidelidade, {
        clienteId: pedido.clienteId,
        pedidoId: pedido.id,
        tipo: TipoTransacaoFidelidade.ESTORNO_RESGATE,
        pontos: devolvidos,
        descricao: `Devolução dos pontos resgatados no pedido #${pedido.id} (cancelado)`,
      });
    }
    const acumulo = await em.findOne(TransacaoFidelidade, {
      where: { pedidoId: pedido.id, tipo: TipoTransacaoFidelidade.ACUMULO },
    });
    let estornados = 0;
    if (acumulo) {
      // O saldo nunca fica negativo: se o cliente já gastou os pontos, estorna-se o que houver.
      estornados = Math.min(acumulo.pontos, await this.saldo(pedido.clienteId, em));
      if (estornados > 0) {
        await em.insert(TransacaoFidelidade, {
          clienteId: pedido.clienteId,
          pedidoId: pedido.id,
          tipo: TipoTransacaoFidelidade.ESTORNO_ACUMULO,
          pontos: -estornados,
          descricao: `Estorno dos pontos do pedido #${pedido.id} (cancelado)`,
        });
      }
    }
    return { devolvidos, estornados };
  }
}
