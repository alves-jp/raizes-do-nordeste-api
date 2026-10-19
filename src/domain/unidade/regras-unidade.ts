import { FormatoUnidade, Regiao } from '../enums';
import { ErroDeDominio, NaturezaErro } from '../erros';

const REGIOES_POR_UF: Record<Regiao, string[]> = {
  [Regiao.NORDESTE]: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  [Regiao.NORTE]: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  [Regiao.CENTRO_OESTE]: ['DF', 'GO', 'MS', 'MT'],
  [Regiao.SUDESTE]: ['ES', 'MG', 'RJ', 'SP'],
  [Regiao.SUL]: ['PR', 'RS', 'SC'],
};

/** Região IBGE da UF. */
export function regiaoDaUf(uf: string): Regiao {
  const sigla = uf.trim().toUpperCase();
  const regiao = (Object.keys(REGIOES_POR_UF) as Regiao[]).find((r) => REGIOES_POR_UF[r].includes(sigla));
  if (!regiao) throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'UF_INVALIDA', `UF desconhecida: ${uf}.`);
  return regiao;
}

/** Unidade REDUZIDA não vende produtos que exigem cozinha completa. */
export function validarProdutoNoFormato(
  produto: { nome: string; exigeCozinhaCompleta: boolean },
  unidade: { nome: string; formato: FormatoUnidade },
  campo = 'produtoId',
): void {
  if (produto.exigeCozinhaCompleta && unidade.formato === FormatoUnidade.REDUZIDA) {
    throw new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'PRODUTO_EXIGE_COZINHA_COMPLETA',
      `"${produto.nome}" exige cozinha completa e a unidade ${unidade.nome} opera em formato reduzido.`,
      [{ field: campo, issue: 'Produto incompatível com o formato da unidade (REDUZIDA)' }],
    );
  }
}
