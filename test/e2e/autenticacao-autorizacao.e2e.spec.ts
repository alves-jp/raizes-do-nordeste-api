import { SENHA_PADRAO_SEED } from '../../src/infrastructure/database/seeds/dados-iniciais';
import { Contexto, criarContexto, esperarErroPadrao, IDS, pedidoApp, USUARIOS } from './apoio';

describe('Autenticação e autorização', () => {
  let ctx: Contexto;
  beforeAll(async () => (ctx = await criarContexto()));
  afterAll(() => ctx.fechar());

  it('login válido devolve token Bearer e dados mínimos do usuário (sem senha)', async () => {
    const res = await ctx.http().post('/auth/login').send({ email: USUARIOS.ana, senha: SENHA_PADRAO_SEED }).expect(200);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, usuario: { id: IDS.ana, perfil: 'CLIENTE' } });
    expect(res.body.accessToken).toMatch(/^eyJ/);
    expect(JSON.stringify(res.body)).not.toMatch(/senha/i);
  });

  it('credenciais inválidas → 401 com mensagem genérica', async () => {
    const res = await ctx.http().post('/auth/login').send({ email: USUARIOS.ana, senha: 'errada123' }).expect(401);
    esperarErroPadrao(res.body, 'CREDENCIAIS_INVALIDAS');
  });

  it('rota protegida sem token → 401', async () => {
    const res = await ctx.http().get('/pedidos').expect(401);
    esperarErroPadrao(res.body, 'TOKEN_AUSENTE');
  });

  it('token adulterado → 401', async () => {
    const token = await ctx.token(USUARIOS.ana);
    const res = await ctx.http().get('/pedidos').set('Authorization', `Bearer ${token}x`).expect(401);
    esperarErroPadrao(res.body, 'TOKEN_INVALIDO');
  });

  it('perfil sem permissão → 403 (cliente tentando cadastrar produto)', async () => {
    const token = await ctx.token(USUARIOS.ana);
    const res = await ctx.http().post('/produtos').set('Authorization', `Bearer ${token}`).send({ nome: 'X', categoria: 'DOCES' }).expect(403);
    esperarErroPadrao(res.body, 'ACESSO_NEGADO');
  });

  it('gerente de Fortaleza não movimenta estoque de Recife → 403', async () => {
    const token = await ctx.token(USUARIOS.gerenteFortaleza);
    const res = await ctx
      .http()
      .post('/estoque/movimentacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ unidadeId: IDS.recife, produtoId: IDS.bolodeRolo, tipo: 'ENTRADA', quantidade: 5 })
      .expect(403);
    esperarErroPadrao(res.body, 'ACESSO_NEGADO');
  });

  it('cliente não enxerga pedido de outro cliente → 404 (não revela que existe)', async () => {
    const ana = await ctx.token(USUARIOS.ana);
    const bruno = await ctx.token(USUARIOS.bruno);
    const pedido = await ctx.http().post('/pedidos').set('Authorization', `Bearer ${ana}`).send(pedidoApp()).expect(201);
    const res = await ctx.http().get(`/pedidos/${pedido.body.id}`).set('Authorization', `Bearer ${bruno}`).expect(404);
    esperarErroPadrao(res.body, 'PEDIDO_NAO_ENCONTRADO');
  });

  it('após 5 tentativas erradas o e-mail é bloqueado temporariamente → 429', async () => {
    for (let i = 0; i < 5; i++) {
      await ctx.http().post('/auth/login').send({ email: USUARIOS.bruno, senha: 'tentativa-errada-1' }).expect(401);
    }
    const res = await ctx.http().post('/auth/login').send({ email: USUARIOS.bruno, senha: SENHA_PADRAO_SEED }).expect(429);
    esperarErroPadrao(res.body, 'MUITAS_TENTATIVAS_DE_LOGIN');
  });
});
