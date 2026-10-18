import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Unidade de Trabalho: executa um bloco de escrita dentro de UMA transação.
 *
 * O SQLite (sql.js) usa uma única conexão, então as transações são enfileiradas e
 * executadas uma de cada vez. Isso dá isolamento serializável às regras críticas
 * (ex.: dois pedidos simultâneos disputando o último item do estoque nunca deixam o
 * saldo negativo) — além do CHECK (quantidade >= 0) no banco como última barreira.
 * Em PostgreSQL, o mesmo contrato seria atendido com SELECT ... FOR UPDATE.
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
