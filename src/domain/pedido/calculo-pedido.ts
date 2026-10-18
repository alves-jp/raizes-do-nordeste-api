import { ErroDeDominio, NaturezaErro } from '../erros';

export interface ItemCalculavel {
  produtoId: number;
  quantidade: number;
  precoUnitarioCentavos: number;
}

/** Limites de um pedido, para evitar abuso e erros de digitação no totem/app. */
export const LIMITES_PEDIDO = {
  maxItensDistintos: 20,
  maxQuantidadePorItem: 20,
} as const;

/** Valida a lista de itens (itens repetidos são somados antes desta etapa). */
export function validarItens(itens: { produtoId: number; quantidade: number }[]): void {
  if (itens.length > LIMITES_PEDIDO.maxItensDistintos) {
    throw new ErroDeDominio(
      NaturezaErro.VALIDACAO,
      'PEDIDO_COM_ITENS_DEMAIS',
      `Um pedido aceita no máximo ${LIMITES_PEDIDO.maxItensDistintos} produtos distintos.`,
      [{ field: 'itens', issue: `Máximo: ${LIMITES_PEDIDO.maxItensDistintos}` }],
    );
  }
  itens.forEach((item, i) => {
    if (item.quantidade > LIMITES_PEDIDO.maxQuantidadePorItem) {
      throw new ErroDeDominio(
        NaturezaErro.VALIDACAO,
        'QUANTIDADE_ACIMA_DO_LIMITE',
        `A quantidade máxima por produto é ${LIMITES_PEDIDO.maxQuantidadePorItem}.`,
        [{ field: `itens[${i}].quantidade`, issue: `Máximo: ${LIMITES_PEDIDO.maxQuantidadePorItem}` }],
      );
    }
  });
}

/** Junta linhas do mesmo produto (ex.: o totem enviou o mesmo item duas vezes). */
export function consolidarItens<T extends { produtoId: number; quantidade: number }>(itens: T[]): { produtoId: number; quantidade: number }[] {
  const mapa = new Map<number, number>();
  for (const item of itens) mapa.set(item.produtoId, (mapa.get(item.produtoId) ?? 0) + item.quantidade);
  return [...mapa.entries()].map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
}

export function calcularSubtotal(itens: ItemCalculavel[]): number {
  return itens.reduce((soma, i) => soma + i.precoUnitarioCentavos * i.quantidade, 0);
}
