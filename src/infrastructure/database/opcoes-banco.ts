import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { ambiente } from '../config/ambiente';
import { ENTIDADES } from './entidades';
import { EstrategiaDeNomesSnakeCase } from './estrategia-de-nomes';

/**
 * SQLite executado via sql.js (WebAssembly): nenhuma dependência nativa, roda igual em
 * Windows, macOS e Linux só com `npm install`. O banco é persistido no arquivo
 * DATABASE_PATH após cada escrita (autoSave). Para produção, basta trocar `type` para
 * 'postgres' e gerar as migrations para esse SGBD — entidades e serviços não mudam.
 *
 * @param caminho caminho do arquivo; `null` usa banco somente em memória (testes).
 */
export function opcoesDoBanco(caminho: string | null = ambiente.bancoCaminho): DataSourceOptions {
  if (caminho) mkdirSync(dirname(caminho), { recursive: true });
  return {
    type: 'sqljs',
    location: caminho ?? undefined,
    autoSave: Boolean(caminho),
    entities: ENTIDADES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    namingStrategy: new EstrategiaDeNomesSnakeCase(),
    synchronize: false,
    logging: ['error'],
  };
}
