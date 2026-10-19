import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { DetalheErro, ErroDeDominio, NaturezaErro } from '../../domain/erros';
import { contextoAtual } from '../../infrastructure/contexto/contexto-requisicao';

const STATUS_POR_NATUREZA: Record<NaturezaErro, number> = {
  [NaturezaErro.REQUISICAO_INVALIDA]: 400,
  [NaturezaErro.NAO_AUTENTICADO]: 401,
  [NaturezaErro.PAGAMENTO_RECUSADO]: 402,
  [NaturezaErro.PROIBIDO]: 403,
  [NaturezaErro.NAO_ENCONTRADO]: 404,
  [NaturezaErro.CONFLITO]: 409,
  [NaturezaErro.VALIDACAO]: 422,
  [NaturezaErro.REGRA_DE_NEGOCIO]: 422,
  [NaturezaErro.LIMITE_EXCEDIDO]: 429,
  [NaturezaErro.DEPENDENCIA_INDISPONIVEL]: 503,
};

/** Formato ÚNICO de erro para toda a API. */
export interface CorpoDeErro {
  error: string;
  message: string;
  details: DetalheErro[];
  timestamp: string;
  path: string;
  requestId: string | null;
}

/** Filtro global. Converte exceções no JSON padrão e transforma erros internos em 500. */
@Catch()
export class FiltroDeErros implements ExceptionFilter {
  private readonly logger = new Logger('Erros');

  catch(excecao: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { status, error, message, details } = this.traduzir(excecao);

    if (status >= 500 && status !== 503) this.logger.error(`${req.method} ${req.originalUrl}`, (excecao as Error)?.stack);
    if (status === 503) res.setHeader('Retry-After', '5');

    const corpo: CorpoDeErro = {
      error,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: req.originalUrl.split('?')[0],
      requestId: contextoAtual()?.requestId ?? null,
    };
    res.status(status).json(corpo);
  }

  private traduzir(excecao: unknown): { status: number; error: string; message: string; details: DetalheErro[] } {
    if (excecao instanceof ErroDeDominio) {
      return { status: STATUS_POR_NATUREZA[excecao.natureza], error: excecao.codigo, message: excecao.message, details: excecao.detalhes };
    }
    // JSON malformado / corpo grande demais (lançados pelo body-parser do Express)
    const corpo = excecao as { type?: string; status?: number };
    if (corpo?.type === 'entity.parse.failed') {
      return { status: 400, error: 'JSON_MALFORMADO', message: 'O corpo da requisição não é um JSON válido.', details: [] };
    }
    if (corpo?.type === 'entity.too.large') {
      return { status: 413, error: 'CORPO_MUITO_GRANDE', message: 'O corpo da requisição excede o limite permitido.', details: [] };
    }
    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      if (status === HttpStatus.NOT_FOUND) {
        return { status, error: 'ROTA_NAO_ENCONTRADA', message: 'Rota não encontrada. Consulte a documentação em /docs.', details: [] };
      }
      if (status === HttpStatus.BAD_REQUEST && excecao.message?.includes('JSON')) {
        return { status, error: 'JSON_MALFORMADO', message: 'O corpo da requisição não é um JSON válido.', details: [] };
      }
      return { status, error: HttpStatus[status] ?? 'ERRO_HTTP', message: excecao.message, details: [] };
    }
    return { status: 500, error: 'ERRO_INTERNO', message: 'Ocorreu um erro inesperado. Informe o requestId ao suporte.', details: [] };
  }
}
