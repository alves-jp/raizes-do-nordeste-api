import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Perfil } from '../../domain/enums';
import { AuditoriaService } from '../../application/auditoria/auditoria.service';
import { CampanhasService } from '../../application/campanhas/campanhas.service';
import { Ator } from '../../application/comum/ator';
import { FidelidadeService } from '../../application/fidelidade/fidelidade.service';
import { ApiErros } from '../documentacao/swagger';
import { PaginacaoQuery } from '../dtos/comum.dto';
import { CriarCampanhaDto, ListarAuditoriaQuery, ListarCampanhasQuery } from '../dtos/pagamentos-campanhas-auditoria.dto';
import { AtorAtual, Perfis, Publico } from '../seguranca/decoradores';

@ApiTags('Fidelidade')
@ApiBearerAuth()
@Controller('fidelidade')
export class FidelidadeController {
  constructor(private readonly fidelidade: FidelidadeService) {}

  @Get('saldo')
  @Perfis(Perfil.CLIENTE)
  @ApiOperation({ summary: 'Saldo de pontos e regras do programa "Cliente Raiz"' })
  @ApiOkResponse({
    schema: {
      example: {
        saldo: 186,
        saldoEmReais: 18.6,
        participando: true,
        regras: { pontosPorReal: '1 ponto a cada R$ 2.00', valorDoPonto: 0.1, resgateMinimo: 50, descontoMaximoPercentual: 30 },
      },
    },
  })
  @ApiErros(401, 403)
  saldo(@AtorAtual() ator: Ator) {
    return this.fidelidade.resumo(ator);
  }

  @Get('extrato')
  @Perfis(Perfil.CLIENTE)
  @ApiOperation({ summary: 'Extrato de pontos (acúmulos, resgates e estornos)' })
  @ApiErros(401, 403, 422)
  extrato(@AtorAtual() ator: Ator, @Query() q: PaginacaoQuery) {
    return this.fidelidade.extrato(ator, q.paginacao);
  }
}

@ApiTags('Campanhas')
@ApiBearerAuth()
@Controller('campanhas')
export class CampanhasController {
  constructor(private readonly campanhas: CampanhasService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Campanhas vigentes (filtráveis por unidade e canal)' })
  @ApiErros(422)
  listar(@Query() q: ListarCampanhasQuery) {
    return this.campanhas.listarVigentes({ unidadeId: q.unidadeId, canalPedido: q.canalPedido }, q.paginacao);
  }

  @Post()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({
    summary: 'Criar campanha promocional (ADMIN/matriz)',
    description: 'Desconto percentual por código, com vigência, valor mínimo e restrição opcional por unidade e/ou canal (ex.: só APP).',
  })
  @ApiCreatedResponse({
    schema: {
      example: { id: 3, codigo: 'SAOJOAO15', descricao: '15% de desconto no arraiá da rede', percentualDesconto: 15, inicio: '2026-11-01T03:00:00.000Z', fim: '2027-01-01T02:59:59.000Z', unidadeId: null, canalPedido: null, valorMinimo: 30, ativa: true },
    },
  })
  @ApiErros(401, 403, 404, 409, 422)
  criar(@Body() dto: CriarCampanhaDto, @AtorAtual() ator: Ator) {
    return this.campanhas.criar(dto, ator);
  }
}

@ApiTags('Auditoria')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @Perfis(Perfil.ADMIN, Perfil.GERENTE)
  @ApiOperation({ summary: 'Trilha de auditoria de ações sensíveis', description: 'ADMIN vê a rede inteira; GERENTE vê só a própria unidade. Ex.: ?acao=PEDIDO_CRIADO&entidadeId=1' })
  @ApiOkResponse({
    schema: {
      example: {
        data: [
          {
            id: 40,
            acao: 'PEDIDO_STATUS_ALTERADO',
            entidade: 'Pedido',
            entidadeId: 1,
            usuarioId: 4,
            perfil: 'COZINHA',
            unidadeId: 1,
            detalhes: { de: 'PAGO', para: 'EM_PREPARO' },
            ip: '::1',
            requestId: '9b2f7c1e-3a4d-4b1e-9f0a-1c2d3e4f5a6b',
            criadoEm: '2026-10-17T15:05:00.000Z',
          },
        ],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    },
  })
  @ApiErros(401, 403, 422)
  listar(@Query() q: ListarAuditoriaQuery, @AtorAtual() ator: Ator) {
    return this.auditoria.listar(
      { acao: q.acao, entidade: q.entidade, entidadeId: q.entidadeId, usuarioId: q.usuarioId, unidadeId: q.unidadeId },
      q.paginacao,
      ator,
    );
  }
}

@ApiTags('Saúde')
@Controller('health')
export class SaudeController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Verificação de saúde (API e banco)' })
  @ApiOkResponse({ schema: { example: { status: 'ok', banco: 'ok', versao: '1.0.0', uptimeSegundos: 42 } } })
  async saude() {
    let banco = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      banco = 'indisponivel';
    }
    return { status: banco === 'ok' ? 'ok' : 'degradado', banco, versao: '1.0.0', uptimeSegundos: Math.round(process.uptime()) };
  }
}
