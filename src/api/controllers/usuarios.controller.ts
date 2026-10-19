import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FinalidadeConsentimento, Perfil } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro } from '../../domain/erros';
import { Ator } from '../../application/comum/ator';
import { UsuariosService } from '../../application/usuarios/usuarios.service';
import { ApiErros } from '../documentacao/swagger';
import { AtualizarPerfilDto, CadastroClienteDto, CadastroFuncionarioDto, ConsentimentoDto, ListarUsuariosQuery } from '../dtos/usuarios.dto';
import { IdPipe } from '../http/validacao';
import { AtorAtual, Perfis, Publico } from '../seguranca/decoradores';

const EXEMPLO_USUARIO = { id: 9, nome: 'Carla Menezes', perfil: 'CLIENTE', unidadeId: null, criadoEm: '2026-10-17T15:00:00.000Z' };

@ApiTags('Usuários e LGPD')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Post()
  @Publico()
  @ApiOperation({
    summary: 'Cadastro de cliente (público)',
    description:
      'Cria uma conta CLIENTE. Exige aceite dos Termos/Política de Privacidade. Consentimentos de FIDELIDADE e MARKETING são opcionais, ' +
      'independentes e registrados com versão do termo (prova do consentimento). Não coletamos CPF nem endereço. ' +
      'A data de nascimento é opcional e só é aceita com consentimento MARKETING (campanhas por faixa etária; maiores de 18 anos).',
  })
  @ApiCreatedResponse({ schema: { example: EXEMPLO_USUARIO } })
  @ApiErros(409, 422)
  cadastrar(@Body() dto: CadastroClienteDto) {
    return this.usuarios.cadastrarCliente(dto);
  }

  @Post('funcionarios')
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastro de funcionário ou totem (ADMIN)', description: 'Perfis de unidade (ATENDENTE, COZINHA, GERENTE, TOTEM) exigem unidadeId.' })
  @ApiCreatedResponse({ schema: { example: { id: 12, nome: 'Rafael Lima', perfil: 'ATENDENTE', unidadeId: 1, criadoEm: '2026-10-17T15:00:00.000Z' } } })
  @ApiErros(401, 403, 404, 409, 422)
  cadastrarFuncionario(@Body() dto: CadastroFuncionarioDto, @AtorAtual() ator: Ator) {
    return this.usuarios.cadastrarFuncionario(dto, ator);
  }

  @Get()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Listar usuários (ADMIN)', description: 'E-mail e telefone vêm MASCARADOS (minimização). Para dados completos use GET /usuarios/{id}, que é auditado.' })
  @ApiOkResponse({
    schema: {
      example: {
        data: [{ id: 7, nome: 'Ana Souza', perfil: 'CLIENTE', unidadeId: null, email: 'an***@email.com', telefone: '(**) *****-1234', ativo: true, anonimizado: false }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    },
  })
  @ApiErros(401, 403, 422)
  listar(@Query() q: ListarUsuariosQuery) {
    return this.usuarios.listar({ perfil: q.perfil, unidadeId: q.unidadeId }, q.paginacao);
  }

  @Get('me')
  @ApiOperation({ summary: 'Meu perfil (com consentimentos vigentes)' })
  @ApiOkResponse({
    schema: {
      example: {
        ...EXEMPLO_USUARIO,
        email: 'carla.menezes@email.com',
        telefone: null,
        dataNascimento: null,
        versaoTermosAceita: 'v1.0',
        consentimentos: [
          { finalidade: 'FIDELIDADE', concedido: true, versaoTermo: 'v1.0', registradoEm: '2026-10-17T15:00:00.000Z' },
          { finalidade: 'MARKETING', concedido: false, versaoTermo: 'v1.0', registradoEm: '2026-10-17T15:00:00.000Z' },
        ],
      },
    },
  })
  @ApiErros(401)
  meuPerfil(@AtorAtual() ator: Ator) {
    return this.usuarios.meuPerfil(ator);
  }

  @Patch('me')
  @Perfis(Perfil.CLIENTE)
  @ApiOperation({
    summary: 'Atualizar meus dados opcionais (telefone e data de nascimento)',
    description:
      'Correção de dados pelo titular (LGPD art. 18, III). dataNascimento exige consentimento MARKETING vigente e é usada só para ' +
      'campanhas por faixa etária; revogar o MARKETING apaga a data automaticamente. A alteração é auditada sem registrar o valor.',
  })
  @ApiErros(401, 403, 422)
  atualizarPerfil(@Body() dto: AtualizarPerfilDto, @AtorAtual() ator: Ator) {
    return this.usuarios.atualizarMeuPerfil(ator, dto);
  }

  @Get('me/consentimentos')
  @Perfis(Perfil.CLIENTE)
  @ApiOperation({ summary: 'Histórico completo dos meus consentimentos (concessões e revogações)' })
  @ApiErros(401, 403)
  historicoConsentimentos(@AtorAtual() ator: Ator) {
    return this.usuarios.historicoDeConsentimentos(ator);
  }

  @Put('me/consentimentos/:finalidade')
  @Perfis(Perfil.CLIENTE)
  @ApiParam({ name: 'finalidade', enum: FinalidadeConsentimento })
  @ApiOperation({
    summary: 'Conceder ou revogar um consentimento',
    description:
      'Revogar FIDELIDADE interrompe o acúmulo de pontos; revogar MARKETING encerra a segmentação e apaga a data de nascimento. O histórico é preservado.',
  })
  @ApiErros(401, 403, 422)
  registrarConsentimento(
    @Param(
      'finalidade',
      new ParseEnumPipe(FinalidadeConsentimento, {
        exceptionFactory: () =>
          new ErroDeDominio(NaturezaErro.REQUISICAO_INVALIDA, 'PARAMETRO_INVALIDO', 'Finalidade inválida.', [
            { field: 'finalidade', issue: `Use: ${Object.values(FinalidadeConsentimento).join(', ')}` },
          ]),
      }),
    )
    finalidade: FinalidadeConsentimento,
    @Body() dto: ConsentimentoDto,
    @AtorAtual() ator: Ator,
  ) {
    return this.usuarios.registrarConsentimento(ator, finalidade, dto.concedido);
  }

  @Get('me/dados')
  @Perfis(Perfil.CLIENTE)
  @ApiOperation({ summary: 'Exportar meus dados (LGPD art. 18 — acesso e portabilidade)', description: 'Retorna cadastro, consentimentos, pedidos e extrato de pontos em JSON. A exportação é auditada.' })
  @ApiErros(401, 403)
  exportar(@AtorAtual() ator: Ator) {
    return this.usuarios.exportarMeusDados(ator);
  }

  @Delete('me')
  @Perfis(Perfil.CLIENTE)
  @HttpCode(204)
  @ApiOperation({
    summary: 'Excluir minha conta (anonimização — LGPD art. 18, VI)',
    description: 'Apaga nome, e-mail, telefone e data de nascimento de forma irreversível e revoga consentimentos. Pedidos são mantidos sem identificação (obrigação fiscal). O token deixa de valer.',
  })
  @ApiNoContentResponse({ description: 'Conta anonimizada' })
  @ApiErros(401, 403, 409)
  async anonimizar(@AtorAtual() ator: Ator) {
    await this.usuarios.anonimizar(ator);
  }

  @Get(':id')
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Dados pessoais completos de um usuário (ADMIN, auditado)' })
  @ApiErros(400, 401, 403, 404)
  obter(@Param('id', IdPipe) id: number, @AtorAtual() ator: Ator) {
    return this.usuarios.obterDadosPessoais(id, ator);
  }
}
