import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '../../domain/enums';
import { CatalogoService } from '../../application/catalogo/catalogo.service';
import { Ator } from '../../application/comum/ator';
import { ApiErros } from '../documentacao/swagger';
import { PaginacaoQuery } from '../dtos/comum.dto';
import { AtualizarProdutoDto, CardapioQuery, CriarProdutoDto, ItemCardapioDto, ListarProdutosQuery } from '../dtos/catalogo.dto';
import { IdPipe } from '../http/validacao';
import { AtorAtual, Perfis, Publico } from '../seguranca/decoradores';

const EXEMPLO_UNIDADE = {
  id: 1,
  nome: 'Raízes do Nordeste — Recife (Casa Amarela)',
  cidade: 'Recife',
  uf: 'PE',
  regiao: 'NORDESTE',
  tipo: 'PROPRIA',
  formato: 'COMPLETA',
  horarioFuncionamento: '07:00-22:00',
  ativa: true,
};

@ApiTags('Unidades e Cardápio')
@ApiBearerAuth()
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Listar unidades da rede' })
  @ApiOkResponse({ schema: { example: { data: [EXEMPLO_UNIDADE], meta: { page: 1, limit: 10, total: 3, totalPages: 1 } } } })
  @ApiErros(422)
  listar(@Query() q: PaginacaoQuery) {
    return this.catalogo.listarUnidades(q.paginacao);
  }

  @Get(':id')
  @Publico()
  @ApiOperation({ summary: 'Detalhar unidade' })
  @ApiOkResponse({ schema: { example: EXEMPLO_UNIDADE } })
  @ApiErros(400, 404)
  obter(@Param('id', IdPipe) id: number) {
    return this.catalogo.detalharUnidade(id);
  }

  @Get(':id/cardapio')
  @Publico()
  @ApiOperation({
    summary: 'Cardápio da unidade (App, Totem, Web e Balcão)',
    description:
      'Preço local e disponibilidade em tempo real. Um item aparece indisponível quando: pausado pela unidade, produto inativo, ' +
      'fora de temporada (itens sazonais/juninos) ou sem estoque — o motivo vem em motivoIndisponibilidade. ' +
      'variacaoRegional descreve como a receita é feita naquela unidade (o produto continua padronizado pela matriz).',
  })
  @ApiOkResponse({
    schema: {
      example: {
        unidade: { id: 1, nome: 'Raízes do Nordeste — Recife (Casa Amarela)', cidade: 'Recife', uf: 'PE', formato: 'COMPLETA' },
        data: [
          {
            produtoId: 3,
            nome: 'Cuscuz nordestino com ovo',
            descricao: '...',
            categoria: 'CUSCUZ',
            preco: 18.5,
            variacaoRegional: 'Receita original da casa: manteiga de garrafa e ovo estrelado',
            sazonal: false,
            disponivel: true,
            motivoIndisponibilidade: null,
          },
          { produtoId: 12, nome: 'Pamonha doce', descricao: '...', categoria: 'DOCES', preco: 9.5, variacaoRegional: null, sazonal: true, disponivel: false, motivoIndisponibilidade: 'FORA_DE_TEMPORADA' },
        ],
        meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
      },
    },
  })
  @ApiErros(400, 404, 422)
  cardapio(@Param('id', IdPipe) id: number, @Query() q: CardapioQuery) {
    return this.catalogo.cardapioDaUnidade(id, { categoria: q.categoria, somenteDisponiveis: q.somenteDisponiveis }, q.paginacao);
  }

  @Put(':id/cardapio/:produtoId')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Incluir/atualizar item no cardápio da unidade (GERENTE da unidade ou ADMIN)',
    description:
      'Define preço local, variação regional da receita e pausa/reativa o item. Operação idempotente e auditada. ' +
      'Produto que exige cozinha completa não entra no cardápio de unidade em formato REDUZIDA (422 PRODUTO_EXIGE_COZINHA_COMPLETA).',
  })
  @ApiOkResponse({
    schema: { example: { unidadeId: 1, produtoId: 1, nome: 'Tapioca de carne de sol com queijo coalho', preco: 25.9, disponivel: true, variacaoRegional: null } },
  })
  @ApiErros(400, 401, 403, 404, 422)
  definirItem(@Param('id', IdPipe) id: number, @Param('produtoId', IdPipe) produtoId: number, @Body() dto: ItemCardapioDto, @AtorAtual() ator: Ator) {
    return this.catalogo.definirItemDoCardapio(id, produtoId, dto, ator);
  }
}

@ApiTags('Produtos')
@ApiBearerAuth()
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Catálogo central da rede (todos os produtos)' })
  @ApiErros(422)
  listar(@Query() q: ListarProdutosQuery) {
    return this.catalogo.listarProdutos({ categoria: q.categoria }, q.paginacao);
  }

  @Get(':id')
  @Publico()
  @ApiOperation({ summary: 'Detalhar produto' })
  @ApiErros(400, 404)
  obter(@Param('id', IdPipe) id: number) {
    return this.catalogo.obterProduto(id);
  }

  @Post()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Criar produto no catálogo central (ADMIN/matriz)' })
  @ApiCreatedResponse({
    schema: {
      example: { id: 16, nome: 'Escondidinho de charque', descricao: '...', categoria: 'PRATOS', sazonal: false, mesInicio: null, mesFim: null, exigeCozinhaCompleta: true, ativo: true },
    },
  })
  @ApiErros(401, 403, 409, 422)
  criar(@Body() dto: CriarProdutoDto, @AtorAtual() ator: Ator) {
    return this.catalogo.criarProduto(dto, ator);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN)
  @ApiOperation({
    summary: 'Atualizar produto (ADMIN/matriz)',
    description: 'Marcar exigeCozinhaCompleta = true falha com 409 se o produto estiver no cardápio de alguma unidade em formato REDUZIDA.',
  })
  @ApiErros(400, 401, 403, 404, 409, 422)
  atualizar(@Param('id', IdPipe) id: number, @Body() dto: AtualizarProdutoDto, @AtorAtual() ator: Ator) {
    return this.catalogo.atualizarProduto(id, dto, ator);
  }
}
