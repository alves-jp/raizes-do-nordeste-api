import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configurarSwagger } from './api/documentacao/configurar-swagger';
import { configurarApp } from './api/http/configurar-app';
import { AppModule } from './app.module';
import { ambiente } from './infrastructure/config/ambiente';

async function iniciar() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.configurar(), { bodyParser: true });
  app.useBodyParser('json', { limit: '100kb' });
  app.set('trust proxy', 'loopback');
  configurarApp(app);
  configurarSwagger(app);
  app.enableShutdownHooks();

  await app.listen(ambiente.porta);
  const logger = new Logger('Raízes do Nordeste');
  logger.log(`API rodando em http://localhost:${ambiente.porta}`);
  logger.log(`Swagger em      http://localhost:${ambiente.porta}/docs`);
  if (ambiente.jwtSegredoEhPadrao) {
    logger.warn('JWT_SECRET não definido: usando segredo de desenvolvimento. Defina JWT_SECRET no .env fora do ambiente local.');
  }
}

void iniciar();
