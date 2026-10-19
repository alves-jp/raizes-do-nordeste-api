import { NivelFidelidade } from '../enums';
import { ErroDeDominio, NaturezaErro } from '../erros';

/**
 * Programa "Cliente Raiz". Cada R$ 2,00 pagos valem 1 ponto. Os níveis consideram
 * pedidos pagos nos últimos 90 dias: BRONZE de 0 a 3, PRATA de 4 a 9 e OURO a partir de 10.
 * O resgate mínimo é de 50 pontos, com desconto progressivo de R$ 0,10, R$ 0,12 ou R$ 0,15
 * por ponto e teto de 30% do pedido.
 */
export const REGRAS_FIDELIDADE = {
  centavosPorPonto: 200,
  valorDoPontoEmCentavos: 10,
  resgateMinimo: 50,
  percentualMaximoDeDesconto: 30,
  janelaDeFrequenciaEmDias: 90,
} as const;

/** Níveis em ordem crescente e valor do ponto no resgate. */
export const NIVEIS_FIDELIDADE: { nivel: NivelFidelidade; pedidosMinimos: number; valorDoPontoEmCentavos: number }[] = [
  { nivel: NivelFidelidade.BRONZE, pedidosMinimos: 0, valorDoPontoEmCentavos: 10 },
  { nivel: NivelFidelidade.PRATA, pedidosMinimos: 4, valorDoPontoEmCentavos: 12 },
  { nivel: NivelFidelidade.OURO, pedidosMinimos: 10, valorDoPontoEmCentavos: 15 },
];

/** Nível, valor do ponto e próximo nível para a quantidade de pedidos pagos. */
export function calcularNivel(pedidosPagosNaJanela: number) {
  const atual = [...NIVEIS_FIDELIDADE].reverse().find((n) => pedidosPagosNaJanela >= n.pedidosMinimos)!;
  const proximo = NIVEIS_FIDELIDADE.find((n) => n.pedidosMinimos > pedidosPagosNaJanela) ?? null;
  return {
    nivel: atual.nivel,
    valorDoPontoEmCentavos: atual.valorDoPontoEmCentavos,
    proximoNivel: proximo ? { nivel: proximo.nivel, pedidosQueFaltam: proximo.pedidosMinimos - pedidosPagosNaJanela } : null,
  };
}

export function nivelAtende(nivel: NivelFidelidade, minimo: NivelFidelidade): boolean {
  const ordem = NIVEIS_FIDELIDADE.map((n) => n.nivel);
  return ordem.indexOf(nivel) >= ordem.indexOf(minimo);
}

export function calcularPontosGanhos(totalPagoCentavos: number): number {
  return Math.floor(totalPagoCentavos / REGRAS_FIDELIDADE.centavosPorPonto);
}

/** Desconto em centavos, validando mínimo, saldo e teto de 30%. */
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
