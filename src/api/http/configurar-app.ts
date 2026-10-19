import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { ambiente } from '../../infrastructure/config/ambiente';
import { FiltroDeErros } from './filtro-de-erros';
import { pipeDeValidacao } from './validacao';

/** Configuração HTTP comum à aplicação e aos testes e2e. */
export function configurarApp(app: INestApplication): void {
  app.use(
    helmet({
      // O Swagger UI usa scripts/estilos inline.
      contentSecurityPolicy: false,
    }),
  );
  app.enableCors({
    origin: ambiente.corsOrigens.includes('*') ? true : ambiente.corsOrigens,
    exposedHeaders: ['X-Request-Id', 'Location', 'Idempotent-Replayed', 'Retry-After'],
  });
  app.useGlobalPipes(pipeDeValidacao);
  app.useGlobalFilters(new FiltroDeErros());
}
