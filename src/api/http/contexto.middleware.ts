import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { armazenamentoDeContexto } from '../../infrastructure/contexto/contexto-requisicao';

/**
 * Atribui um requestId a cada requisição (ou reaproveita X-Request-Id enviado pelo cliente),
 * devolve-o no header de resposta e o disponibiliza para auditoria e erros — permitindo
 * rastrear uma chamada de ponta a ponta (App/Totem → API → auditoria).
 */
@Injectable()
export class ContextoMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const recebido = req.header('x-request-id');
    const requestId = recebido && /^[\w-]{8,64}$/.test(recebido) ? recebido : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    armazenamentoDeContexto.run({ requestId, ip: req.ip ?? null }, () => next());
  }
}
