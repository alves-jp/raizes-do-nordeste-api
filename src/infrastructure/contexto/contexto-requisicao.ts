import { AsyncLocalStorage } from 'async_hooks';

export interface ContextoRequisicao {
  requestId: string;
  ip: string | null;
}

/** requestId e IP da requisição corrente para auditoria e erros. */
export const armazenamentoDeContexto = new AsyncLocalStorage<ContextoRequisicao>();

export const contextoAtual = (): ContextoRequisicao | undefined => armazenamentoDeContexto.getStore();
