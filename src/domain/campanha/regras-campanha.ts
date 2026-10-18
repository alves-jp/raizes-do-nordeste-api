import { CanalPedido } from '../enums';
import { ErroDeDominio, NaturezaErro } from '../erros';

export interface CampanhaAvaliavel {
  codigo: string;
  ativa: boolean;
  percentualDesconto: number;
  inicio: Date;
  fim: Date;
  unidadeId: number | null;
  canalPedido: CanalPedido | null;
  valorMinimoCentavos: number;
}

export interface ContextoDoPedido {
  unidadeId: number;
  canalPedido: CanalPedido;
  subtotalCentavos: number;
  agora: Date;
}

/**
 * Promoções/campanhas da matriz: desconto percentual aplicado por código promocional.
 * Uma campanha pode ser restrita a uma unidade, a um canal (ex.: só APP — estímulo
 * à migração de canal) e a um valor mínimo de pedido. Uma campanha por pedido.
 */
export function calcularDescontoDeCampanha(campanha: CampanhaAvaliavel, ctx: ContextoDoPedido): number {
  const rejeitar = (issue: string) =>
    new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'CAMPANHA_NAO_APLICAVEL',
      `A campanha ${campanha.codigo} não pode ser aplicada a este pedido.`,
      [{ field: 'codigoCampanha', issue }],
    );

  if (!campanha.ativa) throw rejeitar('Campanha inativa.');
  if (ctx.agora < campanha.inicio || ctx.agora > campanha.fim) throw rejeitar('Campanha fora do período de vigência.');
  if (campanha.unidadeId != null && campanha.unidadeId !== ctx.unidadeId) {
    throw rejeitar(`Campanha válida apenas na unidade ${campanha.unidadeId}.`);
  }
  if (campanha.canalPedido != null && campanha.canalPedido !== ctx.canalPedido) {
    throw rejeitar(`Campanha válida apenas no canal ${campanha.canalPedido}.`);
  }
  if (ctx.subtotalCentavos < campanha.valorMinimoCentavos) {
    throw rejeitar(`Valor mínimo do pedido: R$ ${(campanha.valorMinimoCentavos / 100).toFixed(2)}.`);
  }
  return Math.floor((ctx.subtotalCentavos * campanha.percentualDesconto) / 100);
}
