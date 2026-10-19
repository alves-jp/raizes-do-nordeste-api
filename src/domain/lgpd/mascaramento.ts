/**
 * Mascaramento de dados pessoais para logs, auditoria e listagens (LGPD — minimização).
 * Ex.: "ana.souza@email.com" → "an***@email.com"; "(81) 99876-5432" → "(**) *****-5432".
 */
export function mascararEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [usuario, dominio] = email.split('@');
  if (!dominio) return '***';
  return `${usuario.slice(0, 2)}***@${dominio}`;
}

export function mascararTelefone(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, '');
  return `(**) *****-${digitos.slice(-4)}`;
}
