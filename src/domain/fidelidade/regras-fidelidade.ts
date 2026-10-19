import { NivelFidelidade } from '../enums';
import { ErroDeDominio, NaturezaErro } from '../erros';

/**
 * Programa "Cliente Raiz" — regras de pontuação.
 *
 * - ACÚMULO: 1 ponto a cada R$ 2,00 pagos (sobre o total final, após descontos).
 *   Só acumula quem tem consentimento FIDELIDADE vigente no momento da aprovação.
 * - NÍVEIS (frequência de consumo): pedidos pagos nos últimos 90 dias definem o nível —
 *   BRONZE (0 a 3), PRATA (4 a 9) e OURO (10 ou mais).
 * - RESGATE com desconto PROGRESSIVO: cada ponto vale R$ 0,10 (BRONZE), R$ 0,12 (PRATA)
 *   ou R$ 0,15 (OURO); mínimo de 50 pontos por resgate;
 *   o desconto por pontos é limitado a 30% do valor restante do pedido.
 * - Pontos resgatados são debitados na criação do pedido e devolvidos se ele for cancelado.
 */
export const REGRAS_FIDELIDADE = {
  centavosPorPonto: 200,
  valorDoPontoEmCentavos: 10,
  resgateMinimo: 50,
  percentualMaximoDeDesconto: 30,
  janelaDeFrequenciaEmDias: 90,
} as const;

/** Tabela de níveis em ordem crescente: pedidos pagos mínimos na janela e valor do ponto no resgate. */
export const NIVEIS_FIDELIDADE: { nivel: NivelFidelidade; pedidosMinimos: number; valorDoPontoEmCentavos: number }[] = [
  { nivel: NivelFidelidade.BRONZE, pedidosMinimos: 0, valorDoPontoEmCentavos: 10 },
  { nivel: NivelFidelidade.PRATA, pedidosMinimos: 4, valorDoPontoEmCentavos: 12 },
  { nivel: NivelFidelidade.OURO, pedidosMinimos: 10, valorDoPontoEmCentavos: 15 },
];

/** Nível do cliente a partir da quantidade de pedidos pagos na janela de frequência. */
export function calcularNivel(pedidosPagosNaJanela: number) {
  const atual = [...NIVEIS_FIDELIDADE].reverse().find((n) => pedidosPagosNaJanela >= n.pedidosMinimos)!;
  const proximo = NIVEIS_FIDELIDADE.find((n) => n.pedidosMinimos > pedidosPagosNaJanela) ?? null;
  return {
    nivel: atual.nivel,
    valorDoPontoEmCentavos: atual.valorDoPontoEmCentavos,
    proximoNivel: proximo ? { nivel: proximo.nivel, pedidosQueFaltam: proximo.pedidosMinimos - pedidosPagosNaJanela } : null,
  };
}

/** Compara níveis: true se `nivel` é igual ou superior a `minimo`. */
export function nivelAtende(nivel: NivelFidelidade, minimo: NivelFidelidade): boolean {
  const ordem = NIVEIS_FIDELIDADE.map((n) => n.nivel);
  return ordem.indexOf(nivel) >= ordem.indexOf(minimo);
}

export function calcularPontosGanhos(totalPagoCentavos: number): number {
  return Math.floor(totalPagoCentavos / REGRAS_FIDELIDADE.centavosPorPonto);
}

/** Retorna o desconto (em centavos) correspondente aos pontos, validando as regras de resgate. */
export function calcularDescontoPorPontos(
  pontos: number,
  saldo: number,
  valorRestanteCentavos: number,
  valorDoPontoEmCentavos: number = REGRAS_FIDELIDADE.valorDoPontoEmCentavos,
): number {
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
  const desconto = pontos * valorDoPontoEmCentavos;
  const teto = Math.floor((valorRestanteCentavos * REGRAS_FIDELIDADE.percentualMaximoDeDesconto) / 100);
  if (desconto > teto) {
    const maxPontos = Math.floor(teto / valorDoPontoEmCentavos);
    throw new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'RESGATE_ACIMA_DO_LIMITE',
      `O desconto por pontos não pode passar de ${REGRAS_FIDELIDADE.percentualMaximoDeDesconto}% do pedido.`,
      [{ field: 'pontosResgate', issue: `Máximo de pontos para este pedido: ${maxPontos}` }],
    );
  }
  return desconto;
}
