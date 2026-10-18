import { ErroDeDominio, NaturezaErro } from '../../domain/erros';
import { REGEX_IDEMPOTENCIA } from '../dtos/pedidos.dto';

/** Valida o header opcional Idempotency-Key (8 a 80 caracteres: letras, números, _ e -). */
export function lerChaveIdempotencia(valor: string | undefined): string | undefined {
  if (valor === undefined || valor === '') return undefined;
  if (!REGEX_IDEMPOTENCIA.test(valor)) {
    throw new ErroDeDominio(NaturezaErro.REQUISICAO_INVALIDA, 'IDEMPOTENCY_KEY_INVALIDA', 'Header Idempotency-Key inválido.', [
      { field: 'Idempotency-Key', issue: 'Use de 8 a 80 caracteres (letras, números, _ ou -), ex.: um UUID' },
    ]);
  }
  return valor;
}
