import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '../../domain/enums';
import { Ator } from '../../application/comum/ator';
import { EstoqueService } from '../../application/estoque/estoque.service';
import { ApiErros } from '../documentacao/swagger';
import { MovimentacaoEstoqueDto, MovimentacoesQuery, SaldoEstoqueQuery } from '../dtos/estoque.dto';
import { AtorAtual, Perfis } from '../seguranca/decoradores';

@ApiTags('Estoque')
@ApiBearerAuth()
@Controller('estoque')
export class EstoqueController {
  constructor(private readonly estoque: EstoqueService) {}

  @Get()
  @Perfis(Perfil.GERENTE, Perfil.ATENDENTE, Perfil.COZINHA, Perfil.ADMIN)
  @ApiOperation({ summary: 'Saldo de estoque por unidade', description: 'Funcionários veem apenas a própria unidade; ADMIN vê qualquer uma.' })
  @ApiOkResponse({
    schema: {
      example: {
        data: [{ produtoId: 6, produto: 'Bolo de rolo (fatia)', quantidade: 4, estoqueMinimo: 5, estoqueBaixo: true, atualizadoEm: '2026-10-17T15:00:00.000Z' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    },
  })
  @ApiErros(401, 403, 404, 422)
  saldo(@Query() q: SaldoEstoqueQuery, @AtorAtual() ator: Ator) {
    return this.estoque.saldoDaUnidade(q.unidadeId, { somenteBaixo: q.somenteBaixo }, q.paginacao, ator);
  }

  @Post('movimentacoes')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Registrar entrada ou saída manual de estoque (GERENTE da unidade ou ADMIN)',
    description: 'ENTRADA = recebimento; SAIDA = perda/descarte (exige motivo). Saída maior que o saldo → 409. Toda movimentação é auditada.',
  })
  @ApiCreatedResponse({
    schema: {
      example: { movimentacaoId: 31, unidadeId: 1, produtoId: 6, produto: 'Bolo de rolo (fatia)', tipo: 'ENTRADA', quantidade: 20, saldoAtual: 24, motivo: 'Recebimento do fornecedor — NF 4512', criadoEm: '2026-10-17T15:00:00.000Z' },
    },
  })
  @ApiErros(401, 403, 404, 409, 422)
  movimentar(@Body() dto: MovimentacaoEstoqueDto, @AtorAtual() ator: Ator) {
    return this.estoque.movimentar(dto, ator);
  }

  @Get('movimentacoes')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Histórico de movimentações da unidade (entradas, saídas, reservas e estornos de pedidos)' })
  @ApiErros(401, 403, 422)
  movimentacoes(@Query() q: MovimentacoesQuery, @AtorAtual() ator: Ator) {
    return this.estoque.listarMovimentacoes(q.unidadeId, { produtoId: q.produtoId, tipo: q.tipo }, q.paginacao, ator);
  }
}
