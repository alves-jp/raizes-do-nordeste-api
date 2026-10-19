import { FormaPagamento } from '../../domain/enums';

/** Contrato do provedor externo. A implementação concreta fica na infraestrutura. */
export interface SolicitacaoDeCobranca {
  /** Referência única no nosso sistema. */
  referencia: string;
  valorCentavos: number;
  forma: FormaPagamento;
  /** Token gerado no cliente. O back-end nunca recebe dados de cartão. */
  tokenPagamento: string;
}

export interface RespostaDeCobranca {
  aprovado: boolean;
  transacaoId: string;
  codigo: string;
  mensagem: string;
  /** Payload bruto do provedor, para conciliação. */
  payload: Record<string, unknown>;
}

export interface RespostaDeEstorno {
  estornoId: string;
  payload: Record<string, unknown>;
}

/** Falha de comunicação (timeout, 5xx): nada foi cobrado e a operação pode ser repetida. */
export class GatewayIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'GatewayIndisponivelError';
  }
}

export abstract class GatewayDePagamento {
  abstract cobrar(solicitacao: SolicitacaoDeCobranca): Promise<RespostaDeCobranca>;
  abstract estornar(transacaoId: string, valorCentavos: number): Promise<RespostaDeEstorno>;
}
