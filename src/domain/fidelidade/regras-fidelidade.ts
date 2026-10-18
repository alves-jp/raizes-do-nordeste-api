import { ErroDeDominio, NaturezaErro } from '../erros';

/**
 * Programa "Cliente Raiz" — regras de pontuação.
 *
 * - ACÚMULO: 1 ponto a cada R$ 2,00 pagos (sobre o total final, após descontos).
 *   Só acumula quem tem consentimento FIDELIDADE vigente no momento da aprovação.
 * - RESGATE: cada ponto vale R$ 0,10; mínimo de 50 pontos por resgate;
 *   o desconto por pontos é limitado a 30% do valor restante do pedido.
 * - Pontos resgatados são debitados na criação do pedido e devolvidos se ele for cancelado.
 */
export const REGRAS_FIDELIDADE = {
  centavosPorPonto: 200,
  valorDoPontoEmCentavos: 10,
  resgateMinimo: 50,
  percentualMaximoDeDesconto: 30,
} as const;

export function calcularPontosGanhos(totalPagoCentavos: number): number {
  return Math.floor(totalPagoCentavos / REGRAS_FIDELIDADE.centavosPorPonto);
}

/** Retorna o desconto (em centavos) correspondente aos pontos, validando as regras de resgate. */
export function calcularDescontoPorPontos(pontos: number, saldo: number, valorRestanteCentavos: number): number {
  if (pontos < REGRAS_FIDELIDADE.resgateMinimo) {
    throw new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'RESGATE_ABAIXO_DO_MINIMO',
      `O resgate mínimo é de ${REGRAS_FIDELIDADE.resgateMinimo} pontos.`,
      [{ field: 'pontosResgate', issue: `Mínimo: ${REGRAS_FIDELIDADE.resgateMinimo}` }],
    );
  }
  if (pontos > saldo) {
    throw new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'SALDO_DE_PONTOS_INSUFICIENTE',
      'Saldo de pontos insuficiente para o resgate solicitado.',
      [{ field: 'pontosResgate', issue: `Saldo disponível: ${saldo}` }],
    );
  }
  const desconto = pontos * REGRAS_FIDELIDADE.valorDoPontoEmCentavos;
  const teto = Math.floor((valorRestanteCentavos * REGRAS_FIDELIDADE.percentualMaximoDeDesconto) / 100);
  if (desconto > teto) {
    const maxPontos = Math.floor(teto / REGRAS_FIDELIDADE.valorDoPontoEmCentavos);
    throw new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'RESGATE_ACIMA_DO_LIMITE',
      `O desconto por pontos não pode passar de ${REGRAS_FIDELIDADE.percentualMaximoDeDesconto}% do pedido.`,
      [{ field: 'pontosResgate', issue: `Máximo de pontos para este pedido: ${maxPontos}` }],
    );
  }
  return desconto;
}
