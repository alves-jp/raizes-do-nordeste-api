import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FormaPagamento } from '../../domain/enums';
import {
  GatewayDePagamento,
  GatewayIndisponivelError,
  RespostaDeCobranca,
  RespostaDeEstorno,
  SolicitacaoDeCobranca,
} from '../../application/pagamentos/gateway-pagamento.port';
import { ambiente } from '../config/ambiente';

/**
 * Provedor simulado. O token define o resultado: tok_aprovado, tok_recusado_saldo,
 * tok_recusado_antifraude, tok_gateway_instavel (falha 1x e depois aprova) e
 * tok_gateway_indisponivel (timeout). Qualquer outro token é recusado.
 */
export const TOKENS_DE_TESTE = {
  aprovado: 'tok_aprovado',
  recusadoSaldo: 'tok_recusado_saldo',
  recusadoAntifraude: 'tok_recusado_antifraude',
  instavel: 'tok_gateway_instavel',
  indisponivel: 'tok_gateway_indisponivel',
} as const;

@Injectable()
export class GatewayDePagamentoMock extends GatewayDePagamento {
  private readonly logger = new Logger('RaizesPaySandbox');
  /** Referências que já falharam uma vez (para simular instabilidade transitória). */
  private readonly instaveis = new Set<string>();

  async cobrar(s: SolicitacaoDeCobranca): Promise<RespostaDeCobranca> {
    await this.latencia();
    this.logger.log(`cobrança ${s.referencia} valor=${s.valorCentavos} forma=${s.forma}`);

    if (s.tokenPagamento === TOKENS_DE_TESTE.indisponivel) {
      // Demora mais que o timeout configurado: quem chama desiste antes da resposta.
      await new Promise((r) => setTimeout(r, ambiente.gatewayTimeoutMs + 500));
      throw new GatewayIndisponivelError('Sem resposta do provedor de pagamento.');
    }
    if (s.tokenPagamento === TOKENS_DE_TESTE.instavel && !this.instaveis.has(s.referencia)) {
      this.instaveis.add(s.referencia);
      throw new GatewayIndisponivelError('Provedor respondeu 503 Service Unavailable.');
    }

    const transacaoId = `rpay_tx_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const recusa = this.motivoDeRecusa(s.tokenPagamento);
    const payload: Record<string, unknown> = {
      id: transacaoId,
      provider: 'raizespay-sandbox',
      reference: s.referencia,
      amount: s.valorCentavos,
      currency: 'BRL',
      payment_method: s.forma.toLowerCase(),
      status: recusa ? 'declined' : 'approved',
      authorization_code: recusa ? null : String(Math.floor(100000 + Math.random() * 900000)),
      decline_code: recusa?.codigo ?? null,
      created_at: new Date().toISOString(),
    };
    if (s.forma === FormaPagamento.PIX && !recusa) {
      // No sandbox o PIX é confirmado na hora. Num PSP real chegaria depois via webhook.
      payload.pix = { end_to_end_id: `E${Date.now()}RAIZES`, paid_at: new Date().toISOString() };
    }
    return {
      aprovado: !recusa,
      transacaoId,
      codigo: recusa?.codigo ?? 'APROVADO',
      mensagem: recusa?.mensagem ?? 'Pagamento aprovado.',
      payload,
    };
  }

  async estornar(transacaoId: string, valorCentavos: number): Promise<RespostaDeEstorno> {
    await this.latencia();
    const estornoId = `rpay_rf_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    this.logger.log(`estorno ${transacaoId} valor=${valorCentavos}`);
    return {
      estornoId,
      payload: { id: estornoId, transaction_id: transacaoId, amount: valorCentavos, status: 'refunded', created_at: new Date().toISOString() },
    };
  }

  private motivoDeRecusa(token: string): { codigo: string; mensagem: string } | null {
    switch (token) {
      case TOKENS_DE_TESTE.aprovado:
      case TOKENS_DE_TESTE.instavel:
        return null;
      case TOKENS_DE_TESTE.recusadoSaldo:
        return { codigo: 'SALDO_INSUFICIENTE', mensagem: 'Saldo ou limite insuficiente.' };
      case TOKENS_DE_TESTE.recusadoAntifraude:
        return { codigo: 'SUSPEITA_DE_FRAUDE', mensagem: 'Transação bloqueada pela análise antifraude.' };
      default:
        return { codigo: 'TOKEN_INVALIDO', mensagem: 'Token de pagamento inválido ou expirado.' };
    }
  }

  private latencia() {
    return new Promise((r) => setTimeout(r, ambiente.gatewayLatenciaMs));
  }
}
