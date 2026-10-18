/**
 * Gera docs/openapi.json a partir do código (o mesmo contrato servido em /docs).
 * Usado pela página estática docs/swagger/index.html, publicável no GitHub Pages.
 *   npm run openapi:export
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { gerarDocumentoOpenApi } from '../src/api/documentacao/configurar-swagger';
import { AppModule } from '../src/app.module';

async function exportar() {
  Logger.overrideLogger(['error']);
  const app = await NestFactory.create(AppModule.configurar({ bancoCaminho: null }), { logger: ['error'] });
  await app.init();
  const documento = gerarDocumentoOpenApi(app);
  const destino = join(__dirname, '..', 'docs', 'openapi.json');
  writeFileSync(destino, JSON.stringify(documento, null, 2) + '\n');
  await app.close();
  console.log(`✔ OpenAPI exportado: ${destino} (${Object.keys(documento.paths).length} rotas)`);
}

void exportar();
