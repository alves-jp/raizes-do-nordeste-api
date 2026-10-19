import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './api/controllers/auth.controller';
import { ProdutosController, UnidadesController } from './api/controllers/catalogo.controller';
import { AuditoriaController, CampanhasController, FidelidadeController, SaudeController } from './api/controllers/diversos.controller';
import { EstoqueController } from './api/controllers/estoque.controller';
import { PagamentosController } from './api/controllers/pagamentos.controller';
import { PedidosController } from './api/controllers/pedidos.controller';
import { RelatoriosController } from './api/controllers/relatorios.controller';
import { UsuariosController } from './api/controllers/usuarios.controller';
import { ContextoMiddleware } from './api/http/contexto.middleware';
import { AutenticacaoGuard } from './api/seguranca/autenticacao.guard';
import { AuditoriaService } from './application/auditoria/auditoria.service';
import { AuthService } from './application/auth/auth.service';
import { CampanhasService } from './application/campanhas/campanhas.service';
import { CatalogoService } from './application/catalogo/catalogo.service';
import { Relogio, RelogioDoSistema } from './application/comum/relogio';
import { EstoqueService } from './application/estoque/estoque.service';
import { FidelidadeService } from './application/fidelidade/fidelidade.service';
import { GatewayDePagamento } from './application/pagamentos/gateway-pagamento.port';
import { PagamentosService } from './application/pagamentos/pagamentos.service';
import { PedidosService } from './application/pedidos/pedidos.service';
import { RelatoriosService } from './application/relatorios/relatorios.service';
import { UsuariosService } from './application/usuarios/usuarios.service';
import { ambiente } from './infrastructure/config/ambiente';
import { ENTIDADES } from './infrastructure/database/entidades';
import { opcoesDoBanco } from './infrastructure/database/opcoes-banco';
import { UnidadeDeTrabalho } from './infrastructure/database/unidade-de-trabalho';
import { GatewayDePagamentoMock } from './infrastructure/pagamento/gateway-pagamento-mock';
import { HasherDeSenha } from './infrastructure/seguranca/hasher-senha';
import { LimitadorDeLogin } from './infrastructure/seguranca/limitador-de-login';

export interface OpcoesDaAplicacao {
  /** Caminho do arquivo SQLite; `null` = banco em memória (testes). */
  bancoCaminho?: string | null;
}

/**
 * Composição da aplicação (injeção de dependências):
 *   API (controllers, guard, filtros)  →  Application (casos de uso)  →  Domain (regras puras)
 *                                         ↘ Infrastructure (TypeORM, gateway mock, hash, config)
 * A porta GatewayDePagamento é ligada aqui ao adaptador mock — trocar por um PSP real
 * é mudar uma linha.
 */
@Module({})
export class AppModule implements NestModule {
  static configurar(opcoes: OpcoesDaAplicacao = {}): DynamicModule {
    const caminho = opcoes.bancoCaminho === undefined ? ambiente.bancoCaminho : opcoes.bancoCaminho;
    return {
      module: AppModule,
      imports: [
        TypeOrmModule.forRoot({ ...opcoesDoBanco(caminho), migrationsRun: caminho === null ? true : ambiente.executarMigrations }),
        TypeOrmModule.forFeature(ENTIDADES),
        JwtModule.register({ secret: ambiente.jwtSegredo, signOptions: { expiresIn: ambiente.jwtExpiraEmSegundos } }),
      ],
      controllers: [
        AuthController,
        UsuariosController,
        UnidadesController,
        ProdutosController,
        EstoqueController,
        PedidosController,
        PagamentosController,
        FidelidadeController,
        CampanhasController,
        RelatoriosController,
        AuditoriaController,
        SaudeController,
      ],
      providers: [
        // Application
        AuthService,
        UsuariosService,
        CatalogoService,
        EstoqueService,
        PedidosService,
        PagamentosService,
        FidelidadeService,
        CampanhasService,
        AuditoriaService,
        RelatoriosService,
        // Infrastructure
        UnidadeDeTrabalho,
        HasherDeSenha,
        LimitadorDeLogin,
        { provide: GatewayDePagamento, useClass: GatewayDePagamentoMock },
        { provide: Relogio, useClass: RelogioDoSistema },
        // API — autenticação/autorização em TODAS as rotas (exceto @Publico)
        { provide: APP_GUARD, useClass: AutenticacaoGuard },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextoMiddleware).forRoutes('*');
  }
}
