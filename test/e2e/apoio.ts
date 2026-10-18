import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { configurarApp } from '../../src/api/http/configurar-app';
import { Relogio } from '../../src/application/comum/relogio';
import { AppModule } from '../../src/app.module';
import { semearDadosIniciais, SENHA_PADRAO_SEED } from '../../src/infrastructure/database/seeds/dados-iniciais';

/** Relógio controlável: permite testar sazonalidade e vigência de campanhas em qualquer data. */
export class RelogioFalso extends Relogio {
  constructor(public data = new Date('2026-10-17T15:00:00Z')) {
    super();
  }
  agora() {
    return new Date(this.data);
  }
}

export const USUARIOS = {
  admin: 'admin@raizesdonordeste.com.br',
  gerenteSalvador: 'gerente.salvador@raizesdonordeste.com.br',
  atendenteSalvador: 'atendente.salvador@raizesdonordeste.com.br',
  cozinhaSalvador: 'cozinha.salvador@raizesdonordeste.com.br',
  totemSalvador: 'totem01.salvador@raizesdonordeste.com.br',
  gerenteFortaleza: 'gerente.fortaleza@raizesdonordeste.com.br',
  ana: 'ana.souza@email.com',
  bruno: 'bruno.costa@email.com',
} as const;

/** IDs do seed (ver src/infrastructure/database/seeds/dados-iniciais.ts). */
export const IDS = {
  salvador: 1,
  fortaleza: 2,
  bh: 3,
  tapiocaCarneDeSol: 1,
  cuscuzComOvo: 3,
  bolodeRolo: 6, // estoque 4 em Salvador
  cartola: 7, // estoque 0 em Salvador
  acaraje: 8, // só no cardápio de Salvador
  sucoDeCaja: 9,
  pamonha: 12, // sazonal: junho e julho
  ana: 7,
  bruno: 8,
};

export interface Contexto {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  relogio: RelogioFalso;
  dataSource: DataSource;
  token: (email: string) => Promise<string>;
  fechar: () => Promise<void>;
}

/** Sobe a aplicação completa com banco SQLite EM MEMÓRIA, migrations e seed — isolada por arquivo de teste. */
export async function criarContexto(): Promise<Contexto> {
  Logger.overrideLogger(false);
  const relogio = new RelogioFalso();
  const modulo = await Test.createTestingModule({ imports: [AppModule.configurar({ bancoCaminho: null })] })
    .overrideProvider(Relogio)
    .useValue(relogio)
    .compile();
  const app = modulo.createNestApplication();
  configurarApp(app);
  await app.init();
  const dataSource = app.get(DataSource);
  await semearDadosIniciais(dataSource);

  const cache = new Map<string, string>();
  const http = () => request(app.getHttpServer());
  const token = async (email: string) => {
    if (!cache.has(email)) {
      const res = await http().post('/auth/login').send({ email, senha: SENHA_PADRAO_SEED }).expect(200);
      cache.set(email, res.body.accessToken);
    }
    return cache.get(email)!;
  };
  return { app, http, relogio, dataSource, token, fechar: () => app.close() };
}

/** Garante o padrão único de erro em toda resposta de falha. */
export function esperarErroPadrao(corpo: Record<string, unknown>, codigo: string) {
  expect(corpo).toEqual(
    expect.objectContaining({
      error: codigo,
      message: expect.any(String),
      details: expect.any(Array),
      timestamp: expect.any(String),
      path: expect.any(String),
    }),
  );
}

export const pedidoApp = (itens = [{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 1 }], extra: Record<string, unknown> = {}) => ({
  unidadeId: IDS.salvador,
  canalPedido: 'APP',
  formaPagamento: 'PIX',
  itens,
  ...extra,
});
