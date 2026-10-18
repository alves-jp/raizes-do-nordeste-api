import { Injectable } from '@nestjs/common';
import { ambiente } from '../config/ambiente';

/**
 * Proteção contra força bruta no login: após N falhas para o mesmo e-mail dentro da
 * janela, o e-mail fica bloqueado por alguns minutos (HTTP 429).
 * Mantido em memória — suficiente para uma instância; com várias instâncias,
 * o mesmo contrato iria para um Redis.
 */
@Injectable()
export class LimitadorDeLogin {
  private readonly falhas = new Map<string, { quantidade: number; desde: number }>();

  private get janelaMs() {
    return ambiente.loginBloqueioMinutos * 60_000;
  }

  /** Retorna os segundos restantes de bloqueio, ou 0 se liberado. */
  segundosDeBloqueio(email: string, agora = Date.now()): number {
    const registro = this.falhas.get(email);
    if (!registro) return 0;
    if (agora - registro.desde > this.janelaMs) {
      this.falhas.delete(email);
      return 0;
    }
    if (registro.quantidade < ambiente.loginMaxTentativas) return 0;
    return Math.ceil((registro.desde + this.janelaMs - agora) / 1000);
  }

  registrarFalha(email: string, agora = Date.now()): void {
    const registro = this.falhas.get(email);
    if (!registro || agora - registro.desde > this.janelaMs) {
      this.falhas.set(email, { quantidade: 1, desde: agora });
    } else {
      registro.quantidade += 1;
    }
  }

  limpar(email: string): void {
    this.falhas.delete(email);
  }
}
