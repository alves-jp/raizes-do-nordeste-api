import { ErroDeDominio, NaturezaErro } from '../erros';

/** Idade mínima para usar a data de nascimento em segmentação (LGPD, art. 14: dados de crianças e adolescentes). */
export const IDADE_MINIMA_SEGMENTACAO = 18;

/** Idade completa, em anos, na data informada. `dataNascimento` no formato AAAA-MM-DD. */
export function calcularIdade(dataNascimento: string, agora: Date): number {
  const [ano, mes, dia] = dataNascimento.split('-').map(Number);
  let idade = agora.getUTCFullYear() - ano;
  const aniversarioNaoChegou = agora.getUTCMonth() + 1 < mes || (agora.getUTCMonth() + 1 === mes && agora.getUTCDate() < dia);
  if (aniversarioNaoChegou) idade -= 1;
  return idade;
}

/**
 * Valida a data de nascimento opcional: data real, no passado, titular maior de idade
 * (o programa não trata dados de menores para fins de marketing) e idade plausível.
 */
export function validarDataNascimento(dataNascimento: string, agora: Date, campo = 'dataNascimento'): void {
  const erro = (issue: string, codigo = 'DATA_NASCIMENTO_INVALIDA') =>
    new ErroDeDominio(NaturezaErro.VALIDACAO, codigo, 'Data de nascimento não aceita.', [{ field: campo, issue }]);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataNascimento);
  if (!m) throw erro('Use o formato AAAA-MM-DD');
  const data = new Date(`${dataNascimento}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dataNascimento) throw erro('Data inexistente');
  if (data > agora) throw erro('A data não pode estar no futuro');
  const idade = calcularIdade(dataNascimento, agora);
  if (idade < IDADE_MINIMA_SEGMENTACAO) {
    throw erro(`Segmentação por idade só para maiores de ${IDADE_MINIMA_SEGMENTACAO} anos (LGPD, art. 14)`, 'SEGMENTACAO_NAO_PERMITIDA_PARA_MENORES');
  }
  if (idade > 120) throw erro('Idade fora do intervalo aceito');
}
