import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Perfil } from '../../domain/enums';
import { Ator } from '../../application/comum/ator';
import { PagamentosService } from '../../application/pagamentos/pagamentos.service';
import { PedidosService } from '../../application/pedidos/pedidos.service';
import { ApiErros } from '../documentacao/swagger';
import { AtualizarStatusDto, CancelarPedidoDto, CriarPedidoDto, ListarPedidosQuery, ResumoPorCanalQuery } from '../dtos/pedidos.dto';
import { lerChaveIdempotencia } from '../http/idempotencia';
import { IdPipe } from '../http/validacao';
import { AtorAtual, Perfis } from '../seguranca/decoradores';

export const EXEMPLO_PEDIDO = {
  id: 1,
  unidadeId: 1,
  clienteId: 7,
  criadoPorId: 7,
  canalPedido: 'APP',
  status: 'AGUARDANDO_PAGAMENTO',
  formaPagamento: 'PIX',
  itens: [
    { produtoId: 1, nome: 'Tapioca de carne de sol com queijo coalho', quantidade: 2, precoUnitario: 24.9, subtotal: 49.8 },
    { produtoId: 9, nome: 'Suco de cajá (500 ml)', quantidade: 1, precoUnitario: 10, subtotal: 10 },
  ],
  subtotal: 59.8,
  descontoCampanha: 5.98,
  descontoPontos: 0,
  total: 53.82,
  codigoCampanha: 'APPRAIZ10',
  pontosResgatados: 0,
  observacao: null,
  motivoCancelamento: null,
  criadoEm: '2026-10-17T15:00:00.000Z',
  atualizadoEm: '2026-10-17T15:00:00.000Z',
};

const HEADER_IDEMPOTENCIA = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Opcional. Reenviar a mesma chave devolve o recurso já criado (200 + header Idempotent-Replayed: true) em vez de duplicar.',
  example: '3f1c2a9e-7b4d-4c1a-9e2f-0a1b2c3d4e5f',
};

@ApiTags('Pedidos')
@ApiBearerAuth()
@Controller('pedidos')
export class PedidosController {
  constructor(
    private readonly pedidos: PedidosService,
    private readonly pagamentos: PagamentosService,
  ) {}

  @Post()
  @Perfis(Perfil.CLIENTE, Perfil.TOTEM, Perfil.ATENDENTE, Perfil.GERENTE)
  @ApiHeader(HEADER_IDEMPOTENCIA)
  @ApiOperation({
    summary: 'Criar pedido (fluxo crítico)',
    description:
      'canalPedido é OBRIGATÓRIO e deve ser compatível com o perfil (CLIENTE: APP/WEB/PICKUP · TOTEM: TOTEM · ATENDENTE/GERENTE: BALCAO). ' +
      'Valida cardápio da unidade e temporada, calcula subtotal, aplica campanha e resgate de pontos e BAIXA O ESTOQUE na mesma transação. ' +
      'O pedido nasce AGUARDANDO_PAGAMENTO; o próximo passo é POST /pagamentos.',
  })
  @ApiCreatedResponse({ description: 'Pedido criado', schema: { example: EXEMPLO_PEDIDO } })
  @ApiOkResponse({ description: 'Reenvio com a mesma Idempotency-Key (pedido já existente)' })
  @ApiErros(400, 401, 403, 404, 409, 422)
  async criar(
    @Body() dto: CriarPedidoDto,
    @AtorAtual() ator: Ator,
    @Headers('idempotency-key') chave: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pedido, repetido } = await this.pedidos.criar(dto, ator, lerChaveIdempotencia(chave));
    res.status(repetido ? 200 : 201);
    if (repetido) res.setHeader('Idempotent-Replayed', 'true');
    res.setHeader('Location', `/pedidos/${pedido.id}`);
    return pedido;
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pedidos com filtros (canalPedido, status, unidade, período)',
    description: 'Escopo automático: CLIENTE vê os próprios pedidos; equipe e totem veem a própria unidade; ADMIN vê a rede. Ex.: GET /pedidos?canalPedido=TOTEM&status=PAGO',
  })
  @ApiOkResponse({
    schema: {
      example: {
        data: [{ id: 1, unidadeId: 1, clienteId: 7, canalPedido: 'APP', status: 'PAGO', total: 53.82, quantidadeItens: 3, criadoEm: '2026-10-17T15:00:00.000Z' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    },
  })
  @ApiErros(401, 403, 422)
  listar(@Query() q: ListarPedidosQuery, @AtorAtual() ator: Ator) {
    return this.pedidos.listar(
      { canalPedido: q.canalPedido, status: q.status, unidadeId: q.unidadeId, dataInicio: q.dataInicio, dataFim: q.dataFim },
      q.paginacao,
      ator,
    );
  }

  @Get('resumo-por-canal')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Consolidação por canal (GERENTE da unidade ou ADMIN da rede)', description: 'Quantidade de pedidos, pagos, cancelados, faturamento e ticket médio de cada canal.' })
  @ApiOkResponse({
    schema: {
      example: {
        unidadeId: 1,
        periodo: { inicio: null, fim: null },
        canais: [
          { canalPedido: 'APP', pedidos: 12, pedidosPagos: 10, pedidosCancelados: 1, faturamento: 512.4, ticketMedio: 51.24 },
          { canalPedido: 'TOTEM', pedidos: 8, pedidosPagos: 8, pedidosCancelados: 0, faturamento: 301.6, ticketMedio: 37.7 },
        ],
      },
    },
  })
  @ApiErros(401, 403, 422)
  resumoPorCanal(@Query() q: ResumoPorCanalQuery, @AtorAtual() ator: Ator) {
    return this.pedidos.resumoPorCanal(q, ator);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar pedido', description: 'Pedido de outro cliente responde 404 (não revela que o ID existe); de outra unidade responde 403.' })
  @ApiOkResponse({ schema: { example: EXEMPLO_PEDIDO } })
  @ApiErros(400, 401, 403, 404)
  obter(@Param('id', IdPipe) id: number, @AtorAtual() ator: Ator) {
    return this.pedidos.obter(id, ator);
  }

  @Patch(':id/status')
  @Perfis(Perfil.COZINHA, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Atualizar status operacional (cozinha → pronto → entregue)',
    description: 'PAGO → EM_PREPARO e EM_PREPARO → PRONTO: COZINHA/GERENTE/ADMIN. PRONTO → ENTREGUE: ATENDENTE/GERENTE/ADMIN. Transição inválida → 409. Auditado.',
  })
  @ApiOkResponse({ schema: { example: { ...EXEMPLO_PEDIDO, status: 'EM_PREPARO' } } })
  @ApiErros(400, 401, 403, 404, 409, 422)
  atualizarStatus(@Param('id', IdPipe) id: number, @Body() dto: AtualizarStatusDto, @AtorAtual() ator: Ator) {
    return this.pedidos.atualizarStatus(id, dto.status, ator);
  }

  @Post(':id/cancelamento')
  @HttpCode(200)
  @Perfis(Perfil.CLIENTE, Perfil.TOTEM, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Cancelar pedido (com estorno e devolução de estoque)',
    description:
      'CLIENTE/TOTEM: antes do pagamento. ATENDENTE: até PAGO. GERENTE/ADMIN: até PRONTO. ' +
      'Se já pago, estorna no provedor, devolve o estoque e desfaz pontos. Motivo obrigatório; auditado.',
  })
  @ApiOkResponse({ schema: { example: { ...EXEMPLO_PEDIDO, status: 'CANCELADO', motivoCancelamento: 'Cliente desistiu da compra' } } })
  @ApiErros(400, 401, 403, 404, 409, 422, 503)
  cancelar(@Param('id', IdPipe) id: number, @Body() dto: CancelarPedidoDto, @AtorAtual() ator: Ator) {
    return this.pedidos.cancelar(id, dto.motivo, ator);
  }

  @Get(':id/pagamentos')
  @ApiOperation({ summary: 'Tentativas de pagamento do pedido (histórico)' })
  @ApiErros(400, 401, 403, 404)
  pagamentosDoPedido(@Param('id', IdPipe) id: number, @AtorAtual() ator: Ator) {
    return this.pagamentos.listarDoPedido(id, ator);
  }
}
