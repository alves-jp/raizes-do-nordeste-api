import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Executa um bloco de escrita em uma transação. O sql.js usa uma única conexão,
 * então as transações são enfileiradas (isolamento serializável).
 * Em PostgreSQL, o equivalente seria SELECT ... FOR UPDATE.
 */
@Injectable()
export class UnidadeDeTrabalho {
  private fila: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataSource: DataSource) {}

  executar<T>(bloco: (em: EntityManager) => Promise<T>): Promise<T> {
    const execucao = this.fila.then(() => this.dataSource.transaction(bloco));
    this.fila = execucao.catch(() => undefined);
    return execucao;
  }
}
