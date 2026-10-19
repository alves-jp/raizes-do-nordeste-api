import { ArgumentMetadata, Injectable, PipeTransform, ValidationError, ValidationPipe } from '@nestjs/common';
import { DetalheErro, ErroDeDominio, NaturezaErro } from '../../domain/erros';

/** Converte a árvore de erros do class-validator em [{ field: "itens[0].quantidade", issue }]. */
function achatar(erros: ValidationError[], prefixo = ''): DetalheErro[] {
  return erros.flatMap((e) => {
    const campo = /^\d+$/.test(e.property) ? `${prefixo}[${e.property}]` : prefixo ? `${prefixo}.${e.property}` : e.property;
    const proprios = Object.values(e.constraints ?? {}).map((issue) => ({ field: campo, issue }));
    return [...proprios, ...achatar(e.children ?? [], campo)];
  });
}

/** Validação global: rejeita campos desconhecidos e converte tipos. */
export const pipeDeValidacao = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  stopAtFirstError: true,
  exceptionFactory: (erros) =>
    new ErroDeDominio(NaturezaErro.VALIDACAO, 'VALIDACAO', 'Um ou mais campos são inválidos.', achatar(erros).map((d) => ({
      field: d.field,
      issue: d.issue.replace(/^property (\S+) should not exist$/, 'campo não permitido'),
    }))),
});

/** IDs no path precisam ser inteiros positivos. Caso contrário, 400. */
@Injectable()
export class IdPipe implements PipeTransform<string, number> {
  transform(valor: string, meta: ArgumentMetadata): number {
    const id = Number(valor);
    if (!/^\d+$/.test(valor) || !Number.isSafeInteger(id) || id <= 0) {
      throw new ErroDeDominio(NaturezaErro.REQUISICAO_INVALIDA, 'PARAMETRO_INVALIDO', `O parâmetro de rota "${meta.data}" deve ser um inteiro positivo.`, [
        { field: meta.data ?? 'id', issue: `Valor recebido: "${valor}"` },
      ]);
    }
    return id;
  }
}
