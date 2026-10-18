import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiResponse } from '@nestjs/swagger';

export class DetalheErroDto {
  @ApiProperty({ example: 'itens[0].quantidade' })
  field: string;

  @ApiProperty({ example: 'Disponível: 1' })
  issue: string;
}

/** Padrão ÚNICO de erro da API (documentado uma vez e referenciado em todas as rotas). */
export class ErroPadraoDto {
  @ApiProperty({ example: 'ESTOQUE_INSUFICIENTE', description: 'Código estável, legível por máquina' })
  error: string;

  @ApiProperty({ example: 'Não há quantidade suficiente em estoque para um ou mais itens.' })
  message: string;

  @ApiProperty({ type: [DetalheErroDto] })
  details: DetalheErroDto[];

  @ApiProperty({ example: '2026-10-17T15:04:05.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/pedidos' })
  path: string;

  @ApiProperty({ example: '9b2f7c1e-3a4d-4b1e-9f0a-1c2d3e4f5a6b', nullable: true })
  requestId: string | null;
}

const EXEMPLOS: Record<number, { descricao: string; error: string; message: string; details?: { field: string; issue: string }[] }> = {
  400: { descricao: 'Requisição malformada (JSON inválido, parâmetro de rota inválido)', error: 'PARAMETRO_INVALIDO', message: 'O parâmetro de rota "id" deve ser um inteiro positivo.' },
  401: { descricao: 'Não autenticado (token ausente, inválido ou expirado)', error: 'TOKEN_AUSENTE', message: 'Envie o token de acesso no header Authorization: Bearer <token>.' },
  402: {
    descricao: 'Pagamento recusado pelo provedor',
    error: 'PAGAMENTO_RECUSADO',
    message: 'Pagamento recusado pelo provedor: Saldo ou limite insuficiente. Tente outro meio de pagamento.',
    details: [
      { field: 'pagamentoId', issue: '7' },
      { field: 'codigoRetorno', issue: 'SALDO_INSUFICIENTE' },
      { field: 'pedido.status', issue: 'PAGAMENTO_RECUSADO' },
    ],
  },
  403: { descricao: 'Autenticado, mas sem permissão (perfil ou unidade)', error: 'ACESSO_NEGADO', message: 'Seu perfil não tem permissão para esta operação.', details: [{ field: 'perfil', issue: 'Perfis autorizados: GERENTE, ADMIN' }] },
  404: { descricao: 'Recurso não encontrado', error: 'PEDIDO_NAO_ENCONTRADO', message: 'Pedido 999 não encontrado(a).' },
  409: { descricao: 'Conflito com o estado atual / regra de negócio', error: 'ESTOQUE_INSUFICIENTE', message: 'Não há quantidade suficiente em estoque para um ou mais itens.', details: [{ field: 'itens[0].quantidade', issue: 'Bolo de rolo (fatia): solicitado 10, disponível 4' }] },
  422: { descricao: 'Dados inválidos ou regra de negócio violada', error: 'VALIDACAO', message: 'Um ou mais campos são inválidos.', details: [{ field: 'canalPedido', issue: 'canalPedido deve ser um de: APP, TOTEM, BALCAO, PICKUP, WEB' }] },
  429: { descricao: 'Muitas tentativas', error: 'MUITAS_TENTATIVAS_DE_LOGIN', message: 'Muitas tentativas sem sucesso. Tente novamente em 15 minuto(s).' },
  503: { descricao: 'Provedor externo indisponível', error: 'GATEWAY_PAGAMENTO_INDISPONIVEL', message: 'O provedor de pagamento não respondeu. Nada foi cobrado; tente novamente em instantes.' },
};

/** Documenta as respostas de erro de uma rota usando o padrão único. */
export const ApiErros = (...codigos: number[]) =>
  applyDecorators(
    ...codigos.map((codigo) => {
      const e = EXEMPLOS[codigo];
      return ApiResponse({
        status: codigo,
        description: e.descricao,
        type: ErroPadraoDto,
        example: { error: e.error, message: e.message, details: e.details ?? [], timestamp: '2026-10-17T15:04:05.000Z', path: '/...', requestId: '9b2f7c1e-3a4d-4b1e-9f0a-1c2d3e4f5a6b' },
      });
    }),
  );
