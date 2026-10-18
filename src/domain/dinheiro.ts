/**
 * Valores monetários são armazenados e calculados em CENTAVOS (inteiros),
 * evitando erros de ponto flutuante. A API expõe reais com 2 casas decimais.
 */
export const paraReais = (centavos: number): number => Math.round(centavos) / 100;

export const paraCentavos = (reais: number): number => Math.round(reais * 100);
