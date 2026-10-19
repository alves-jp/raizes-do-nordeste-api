import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { opcoesDoBanco } from './opcoes-banco';

/** DataSource da CLI do TypeORM. */
export default new DataSource(opcoesDoBanco());
