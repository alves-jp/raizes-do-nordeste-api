/** Cálculos em centavos para evitar erro de ponto flutuante. A API expõe reais. */
export const paraReais = (centavos: number): number => Math.round(centavos) / 100;

export const paraCentavos = (reais: number): number => Math.round(reais * 100);
