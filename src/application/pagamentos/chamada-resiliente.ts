import { Logger } from '@nestjs/common';
import { GatewayIndisponivelError } from './gateway-pagamento.port';

const logger = new Logger('ChamadaResiliente');

/** Timeout + retry com backoff apenas em falhas transitórias (nunca em recusa). */
export async function chamarComResiliencia<T>(
  operacao: () => Promise<T>,
  opcoes: { timeoutMs: number; tentativasExtras: number; descricao: string },
): Promise<T> {
  let ultimaFalha: unknown;
  for (let tentativa = 0; tentativa <= opcoes.tentativasExtras; tentativa++) {
    if (tentativa > 0) {
      const espera = 200 * 2 ** (tentativa - 1);
      logger.warn(`${opcoes.descricao}: nova tentativa ${tentativa}/${opcoes.tentativasExtras} em ${espera}ms`);
      await new Promise((r) => setTimeout(r, espera));
    }
    try {
      return await comTimeout(operacao(), opcoes.timeoutMs);
    } catch (erro) {
      if (!(erro instanceof GatewayIndisponivelError)) throw erro;
      ultimaFalha = erro;
    }
  }
  throw ultimaFalha;
}

function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout;
  const limite = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new GatewayIndisponivelError(`Sem resposta do provedor em ${ms}ms.`)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador));
}
