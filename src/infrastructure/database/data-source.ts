import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { opcoesDoBanco } from './opcoes-banco';

/** DataSource usado pela CLI do TypeORM (migration:run, migration:generate, migration:revert). */
export default new DataSource(opcoesDoBanco());
