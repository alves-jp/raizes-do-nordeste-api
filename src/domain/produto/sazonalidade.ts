/**
 * Produtos sazonais (ex.: pamonha e milho no período junino) só podem ser vendidos
 * entre mesInicio e mesFim (1 a 12, inclusive). A janela pode atravessar a virada
 * do ano (ex.: novembro a fevereiro).
 */
export function estaEmTemporada(
  produto: { sazonal: boolean; mesInicio: number | null; mesFim: number | null },
  data: Date,
): boolean {
  if (!produto.sazonal || produto.mesInicio == null || produto.mesFim == null) return true;
  const mes = data.getMonth() + 1;
  if (produto.mesInicio <= produto.mesFim) {
    return mes >= produto.mesInicio && mes <= produto.mesFim;
  }
  return mes >= produto.mesInicio || mes <= produto.mesFim;
}
