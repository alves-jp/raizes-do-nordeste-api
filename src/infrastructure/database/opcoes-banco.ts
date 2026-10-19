import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { ambiente } from '../config/ambiente';
import { ENTIDADES } from './entidades';
import { EstrategiaDeNomesSnakeCase } from './estrategia-de-nomes';

/**
 * SQLite via sql.js (WebAssembly): sem dependência nativa, roda igual em Windows,
 * macOS e Linux. Em produção, troque `type` para 'postgres' e gere as migrations.
 *
 * @param caminho caminho do arquivo. Use null para banco em memória nos testes.
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
