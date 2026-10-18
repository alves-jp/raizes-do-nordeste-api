import { Body, Controller, Get, Headers, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Perfil } from '../../domain/enums';
import { Ator } from '../../application/comum/ator';
import { PagamentosService } from '../../application/pagamentos/pagamentos.service';
import { ApiErros } from '../documentacao/swagger';
import { SolicitarPagamentoDto } from '../dtos/pagamentos-campanhas-auditoria.dto';
import { lerChaveIdempotencia } from '../http/idempotencia';
import { IdPipe } from '../http/validacao';
import { AtorAtual, Perfis } from '../seguranca/decoradores';

const EXEMPLO_PAGAMENTO = {
  pagamento: {
    id: 1,
    pedidoId: 1,
    valor: 53.82,
    forma: 'PIX',
    status: 'APROVADO',
    transacaoExternaId: 'rpay_tx_4f9c0a1b2c3d4e5f6a7b',
    codigoRetorno: 'APROVADO',
    mensagemRetorno: 'Pagamento aprovado.',
    respostaGateway: {
      id: 'rpay_tx_4f9c0a1b2c3d4e5f6a7b',
      provider: 'raizespay-sandbox',
      reference: 'pedido-1-pagamento-1',
      amount: 5382,
      currency: 'BRL',
      payment_method: 'pix',
      status: 'approved',
      authorization_code: '482913',
      decline_code: null,
      created_at: '2026-10-17T15:00:01.000Z',
    },
    criadoEm: '2026-10-17T15:00:01.000Z',
    atualizadoEm: '2026-10-17T15:00:01.000Z',
  },
  pedido: { id: 1, status: 'PAGO', total: 53.82 },
  pontosCreditados: 26,
};

@ApiTags('Pagamentos (mock)')
@ApiBearerAuth()
@Controller('pagamentos')
export class PagamentosController {
  constructor(private readonly pagamentos: PagamentosService) {}

  @Post()
  @Perfis(Perfil.CLIENTE, Perfil.TOTEM, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Recomendado. Reenviar a mesma chave não cobra de novo: devolve o resultado original (200 + Idempotent-Replayed: true).',
    example: 'pag-7b4d-4c1a-9e2f',
  })
  @ApiOperation({
    summary: 'Solicitar pagamento do pedido ao provedor externo (simulado)',
    description:
      'Envia a cobrança ao RaizesPay Sandbox e devolve o retorno (status + payload do provedor). ' +
      'APROVADO → 201 e pedido PAGO (+ pontos de fidelidade). RECUSADO → 402 e pedido PAGAMENTO_RECUSADO (pode tentar de novo). ' +
      'Provedor sem resposta (timeout, já com 1 nova tentativa automática) → 503 e pedido inalterado. ' +
      'Tokens de teste: tok_aprovado, tok_recusado_saldo, tok_recusado_antifraude, tok_gateway_instavel, tok_gateway_indisponivel.',
  })
  @ApiCreatedResponse({ description: 'Pagamento aprovado', schema: { example: EXEMPLO_PAGAMENTO } })
  @ApiErros(400, 401, 402, 403, 404, 409, 422, 503)
  async solicitar(
    @Body() dto: SolicitarPagamentoDto,
    @AtorAtual() ator: Ator,
    @Headers('idempotency-key') chave: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resultado = await this.pagamentos.solicitar(dto, ator, lerChaveIdempotencia(chave));
    res.status(resultado.repetido ? 200 : 201);
    if (resultado.repetido) res.setHeader('Idempotent-Replayed', 'true');
    const { repetido: _repetido, ...corpo } = resultado;
    return corpo;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar tentativa de pagamento' })
  @ApiErros(400, 401, 403, 404)
  obter(@Param('id', IdPipe) id: number, @AtorAtual() ator: Ator) {
    return this.pagamentos.obter(id, ator);
  }
}
