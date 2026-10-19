import { paraReais } from '../../domain/dinheiro';
import { Pagamento, Pedido } from '../../infrastructure/database/entidades';

/** Representação do pedido devolvida pela API (valores em reais). */
export function visaoDoPedido(p: Pedido) {
  return {
    id: p.id,
    unidadeId: p.unidadeId,
    clienteId: p.clienteId,
    criadoPorId: p.criadoPorId,
    canalPedido: p.canalPedido,
    status: p.status,
    formaPagamento: p.formaPagamento,
    itens: (p.itens ?? []).map((i) => ({
      produtoId: i.produtoId,
      nome: i.nomeProduto,
      quantidade: i.quantidade,
      precoUnitario: paraReais(i.precoUnitarioCentavos),
      subtotal: paraReais(i.subtotalCentavos),
    })),
    subtotal: paraReais(p.subtotalCentavos),
    descontoCampanha: paraReais(p.descontoCampanhaCentavos),
    descontoPontos: paraReais(p.descontoPontosCentavos),
    total: paraReais(p.totalCentavos),
    codigoCampanha: p.campanha?.codigo ?? null,
    pontosResgatados: p.pontosResgatados,
    observacao: p.observacao,
    motivoCancelamento: p.motivoCancelamento,
    criadoEm: p.criadoEm,
    atualizadoEm: p.atualizadoEm,
  };
}

export function resumoDoPedido(p: Pedido) {
  return {
    id: p.id,
    unidadeId: p.unidadeId,
    clienteId: p.clienteId,
    canalPedido: p.canalPedido,
    status: p.status,
    total: paraReais(p.totalCentavos),
    quantidadeItens: (p.itens ?? []).reduce((s, i) => s + i.quantidade, 0),
    criadoEm: p.criadoEm,
  };
}

export function visaoDoPagamento(pg: Pagamento) {
  return {
    id: pg.id,
    pedidoId: pg.pedidoId,
    valor: paraReais(pg.valorCentavos),
    forma: pg.forma,
    status: pg.status,
    transacaoExternaId: pg.transacaoExternaId,
    codigoRetorno: pg.codigoRetorno,
    mensagemRetorno: pg.mensagemRetorno,
    respostaGateway: pg.respostaGateway ? JSON.parse(pg.respostaGateway) : null,
    criadoEm: pg.criadoEm,
    atualizadoEm: pg.atualizadoEm,
  };
}
