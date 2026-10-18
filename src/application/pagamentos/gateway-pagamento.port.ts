import { FormaPagamento } from '../../domain/enums';

/**
 * Porta (contrato) do provedor externo de pagamentos.
 * A aplicação depende apenas desta abstração; a implementação concreta
 * (hoje um mock, amanhã um PSP real) fica na camada de infraestrutura.
 */
export interface SolicitacaoDeCobranca {
  /** Referência única no nosso sistema (ex.: "pedido-12-pagamento-5"). */
  referencia: string;
  valorCentavos: number;
  forma: FormaPagamento;
  /**
   * Token de pagamento gerado pelo SDK do provedor no cliente (App/Totem/Web).
   * O back-end nunca recebe nem armazena número de cartão (escopo PCI-DSS fora do sistema).
   */
  tokenPagamento: string;
}

export interface RespostaDeCobranca {
  aprovado: boolean;
  transacaoId: string;
  codigo: string;
  mensagem: string;
  /** Payload bruto devolvido pelo provedor (para conciliação). */
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
