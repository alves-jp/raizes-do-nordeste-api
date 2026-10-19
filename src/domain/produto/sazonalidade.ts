/** Janela sazonal inclusiva (1-12), inclusive quando atravessa a virada do ano. */
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
