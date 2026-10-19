import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Ator } from '../../application/comum/ator';
import { RelatoriosService } from '../../application/relatorios/relatorios.service';
import { Perfil } from '../../domain/enums';
import { ApiErros } from '../documentacao/swagger';
import { ProdutosMaisVendidosQuery, RelatorioVendasQuery } from '../dtos/relatorios.dto';
import { AtorAtual, Perfis } from '../seguranca/decoradores';

const FINANCEIRO_EXEMPLO = {
  pedidosPagos: 3,
  pedidosCancelados: 1,
  faturamentoBruto: 132.7,
  descontosCampanhas: 5.98,
  descontosFidelidade: 5,
  faturamentoLiquido: 121.72,
  ticketMedio: 40.57,
  valorEstornado: 24.9,
};

@ApiTags('Relatórios (matriz)')
@ApiBearerAuth()
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  @Get('vendas')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Vendas e financeiro por unidade ou por região (GERENTE: própria unidade · ADMIN: rede)',
    description:
      'Pedidos pagos e cancelados, faturamento bruto, descontos de campanhas e de fidelidade, faturamento líquido, ticket médio, ' +
      'valor estornado e percentual da meta mensal da unidade. agruparPor=REGIAO consolida as unidades pelas regiões do IBGE. ' +
      'Período padrão: mês corrente. A consulta é registrada na auditoria.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        periodo: { de: '2026-10-01T00:00:00.000Z', ate: '2026-10-17T15:00:00.000Z' },
        agruparPor: 'UNIDADE',
        escopo: 'REDE',
        grupos: [
          {
            id: 1,
            nome: 'Raízes do Nordeste — Recife (Casa Amarela)',
            cidade: 'Recife',
            uf: 'PE',
            regiao: 'NORDESTE',
            formato: 'COMPLETA',
            ...FINANCEIRO_EXEMPLO,
            metaMensal: 90000,
            percentualDaMeta: 0.1,
          },
        ],
        consolidado: FINANCEIRO_EXEMPLO,
      },
    },
  })
  @ApiErros(401, 403, 422)
  vendas(@Query() q: RelatorioVendasQuery, @AtorAtual() ator: Ator) {
    return this.relatorios.vendas({ de: q.de, ate: q.ate, unidadeId: q.unidadeId }, q.agruparPor, ator);
  }

  @Get('produtos-mais-vendidos')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Ranking de produtos mais consumidos (GERENTE: própria unidade · ADMIN: rede ou unidade)',
    description: 'Quantidade vendida, número de pedidos, faturamento e participação de cada produto nos pedidos pagos do período.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        periodo: { de: '2026-10-01T00:00:00.000Z', ate: '2026-10-17T15:00:00.000Z' },
        escopo: 'REDE',
        produtos: [
          { posicao: 1, produtoId: 1, nome: 'Tapioca de carne de sol com queijo coalho', quantidade: 5, pedidos: 3, faturamento: 124.5, participacaoPercentual: 45.5 },
          { posicao: 2, produtoId: 9, nome: 'Suco de cajá (500 ml)', quantidade: 3, pedidos: 3, faturamento: 30, participacaoPercentual: 27.3 },
        ],
      },
    },
  })
  @ApiErros(401, 403, 422)
  produtosMaisVendidos(@Query() q: ProdutosMaisVendidosQuery, @AtorAtual() ator: Ator) {
    return this.relatorios.produtosMaisVendidos({ de: q.de, ate: q.ate, unidadeId: q.unidadeId, limite: q.limite }, ator);
  }
}
