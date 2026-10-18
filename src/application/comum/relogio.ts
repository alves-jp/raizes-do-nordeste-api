/** Abstração do relógio: permite testar regras dependentes de data (sazonalidade, campanhas). */
export abstract class Relogio {
  abstract agora(): Date;
}

export class RelogioDoSistema extends Relogio {
  agora(): Date {
    return new Date();
  }
}
