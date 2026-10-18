import { Perfil } from '../../domain/enums';
import { proibido } from '../../domain/erros';

/** Usuário autenticado que executa um caso de uso (extraído do JWT). */
export interface Ator {
  id: number;
  perfil: Perfil;
  unidadeId: number | null;
}

/**
 * Escopo por unidade: funcionários e totens só operam a própria unidade;
 * ADMIN (matriz) opera todas.
 */
export function garantirAcessoAUnidade(ator: Ator, unidadeId: number): void {
  if (ator.perfil === Perfil.ADMIN) return;
  if (ator.unidadeId !== unidadeId) {
    throw proibido(`Seu usuário está vinculado à unidade ${ator.unidadeId ?? '-'} e não pode operar a unidade ${unidadeId}.`);
  }
}
