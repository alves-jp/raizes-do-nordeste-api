import { AsyncLocalStorage } from 'async_hooks';

export interface ContextoRequisicao {
  requestId: string;
  ip: string | null;
}

/**
 * Guarda requestId e IP da requisição corrente sem precisar repassá-los por
 * todos os métodos — usados na trilha de auditoria e no JSON de erro.
 */
export const armazenamentoDeContexto = new AsyncLocalStorage<ContextoRequisicao>();

export const contextoAtual = (): ContextoRequisicao | undefined => armazenamentoDeContexto.getStore();
