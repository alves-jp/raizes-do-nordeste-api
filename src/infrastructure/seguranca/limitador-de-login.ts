import { Injectable } from '@nestjs/common';
import { ambiente } from '../config/ambiente';

/** Bloqueia o e-mail após N falhas. Em memória, ou Redis com múltiplas instâncias. */
@Injectable()
export class LimitadorDeLogin {
  private readonly falhas = new Map<string, { quantidade: number; desde: number }>();

  private get janelaMs() {
    return ambiente.loginBloqueioMinutos * 60_000;
  }

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
