import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/** Bcrypt com custo 10. */
@Injectable()
export class HasherDeSenha {
  private static readonly CUSTO = 10;
  /** Hash fixo usado para gastar o mesmo tempo quando o e-mail não existe (evita enumeração de usuários). */
  private static readonly HASH_FICTICIO = bcrypt.hashSync('senha-ficticia-para-tempo-constante', HasherDeSenha.CUSTO);

  gerar(senha: string): Promise<string> {
    return bcrypt.hash(senha, HasherDeSenha.CUSTO);
  }

  async conferir(senha: string, hash: string | null | undefined): Promise<boolean> {
    return bcrypt.compare(senha, hash ?? HasherDeSenha.HASH_FICTICIO);
  }
}
