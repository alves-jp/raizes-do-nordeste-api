import { Contexto, criarContexto, esperarErroPadrao, IDS, pedidoApp, USUARIOS } from './apoio';

describe('Validações, multicanalidade e regras de negócio', () => {
  let ctx: Contexto;
  let ana: string;
  let atendente: string;
  beforeAll(async () => {
    ctx = await criarContexto();
    ana = await ctx.token(USUARIOS.ana);
    atendente = await ctx.token(USUARIOS.atendenteSalvador);
  });
  afterAll(() => ctx.fechar());

  const criar = (token: string, corpo: object) => ctx.http().post('/pedidos').set('Authorization', `Bearer ${token}`).send(corpo);

  it('canalPedido ausente → 422 com o campo indicado', async () => {
    const { canalPedido: _omitido, ...semCanal } = pedidoApp();
    const res = await criar(ana, semCanal).expect(422);
    esperarErroPadrao(res.body, 'VALIDACAO');
    expect(res.body.details.map((d: { field: string }) => d.field)).toContain('canalPedido');
  });

  it('canalPedido inválido → 422', async () => {
    const res = await criar(ana, pedidoApp(undefined, { canalPedido: 'DRIVE_THRU' })).expect(422);
    expect(res.body.details[0].issue).toContain('APP, TOTEM, BALCAO, PICKUP, WEB');
  });

  it('quantidade negativa e campo desconhecido → 422 com cada campo', async () => {
    const res = await criar(ana, { ...pedidoApp([{ produtoId: 1, quantidade: -2 }]), precoTotal: 0.01 }).expect(422);
    const campos = res.body.details.map((d: { field: string }) => d.field);
    expect(campos).toEqual(expect.arrayContaining(['itens[0].quantidade', 'precoTotal']));
  });

  it('JSON malformado → 400', async () => {
    const res = await ctx.http().post('/pedidos').set('Authorization', `Bearer ${ana}`).set('Content-Type', 'application/json').send('{"unidadeId": 1,').expect(400);
    esperarErroPadrao(res.body, 'JSON_MALFORMADO');
  });

  it('ID de rota inválido → 400', async () => {
    const res = await ctx.http().get('/pedidos/abc').set('Authorization', `Bearer ${ana}`).expect(400);
    esperarErroPadrao(res.body, 'PARAMETRO_INVALIDO');
  });

  it('canal incompatível com o perfil (cliente usando BALCAO) → 422', async () => {
    const res = await criar(ana, pedidoApp(undefined, { canalPedido: 'BALCAO' })).expect(422);
    esperarErroPadrao(res.body, 'CANAL_INCOMPATIVEL_COM_PERFIL');
  });

  it('produto inexistente → 404', async () => {
    const res = await criar(ana, pedidoApp([{ produtoId: 999, quantidade: 1 }])).expect(404);
    esperarErroPadrao(res.body, 'PRODUTO_NAO_ENCONTRADO');
    expect(res.body.details[0].field).toBe('itens[0].produtoId');
  });

  it('unidade inexistente → 404', async () => {
    const res = await criar(ana, pedidoApp(undefined, { unidadeId: 999 })).expect(404);
    esperarErroPadrao(res.body, 'UNIDADE_NAO_ENCONTRADO');
  });

  it('produto fora do cardápio da unidade (acarajé em Fortaleza) → 422', async () => {
    const res = await criar(ana, pedidoApp([{ produtoId: IDS.acaraje, quantidade: 1 }], { unidadeId: IDS.fortaleza })).expect(422);
    esperarErroPadrao(res.body, 'PRODUTO_INDISPONIVEL_NA_UNIDADE');
  });

  it('estoque insuficiente → 409 e NADA é baixado (transação atômica)', async () => {
    const res = await criar(ana, pedidoApp([{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 1 }, { produtoId: IDS.bolodeRolo, quantidade: 10 }])).expect(409);
    esperarErroPadrao(res.body, 'ESTOQUE_INSUFICIENTE');
    expect(res.body.details).toEqual([{ field: 'itens[1].quantidade', issue: 'Bolo de rolo (fatia): solicitado 10, disponível 4' }]);

    const admin = await ctx.token(USUARIOS.admin);
    const estoque = await ctx.http().get(`/estoque?unidadeId=${IDS.salvador}&limit=100`).set('Authorization', `Bearer ${admin}`).expect(200);
    const tapioca = estoque.body.data.find((e: { produtoId: number }) => e.produtoId === IDS.tapiocaCarneDeSol);
    expect(tapioca.quantidade).toBe(60);
  });

  it('pedidos simultâneos disputando o último estoque: nunca vende além do saldo', async () => {
    const tentativas = await Promise.all(
      Array.from({ length: 6 }, () => criar(atendente, { unidadeId: IDS.salvador, canalPedido: 'BALCAO', formaPagamento: 'PIX', itens: [{ produtoId: IDS.bolodeRolo, quantidade: 1 }] })),
    );
    const status = tentativas.map((r) => r.status).sort();
    expect(status).toEqual([201, 201, 201, 201, 409, 409]);
  });

  it('produto sazonal (pamonha) fora de junho/julho → 422; em junho → 201', async () => {
    const fora = await criar(ana, pedidoApp([{ produtoId: IDS.pamonha, quantidade: 1 }])).expect(422);
    esperarErroPadrao(fora.body, 'PRODUTO_FORA_DE_TEMPORADA');

    ctx.relogio.data = new Date('2026-06-24T15:00:00Z');
    await criar(ana, pedidoApp([{ produtoId: IDS.pamonha, quantidade: 1 }])).expect(201);
    ctx.relogio.data = new Date('2026-10-17T15:00:00Z');
  });

  it('campanha restrita ao App não vale no balcão; campanha encerrada é rejeitada', async () => {
    const balcao = await criar(atendente, { unidadeId: IDS.salvador, canalPedido: 'BALCAO', formaPagamento: 'PIX', codigoCampanha: 'APPRAIZ10', itens: [{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 2 }] }).expect(422);
    expect(balcao.body.details[0].issue).toContain('APP');
    const encerrada = await criar(ana, pedidoApp([{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 2 }], { codigoCampanha: 'ARRAIA2026' })).expect(422);
    expect(encerrada.body.details[0].issue).toContain('vigência');
  });

  it('resgate sem consentimento de fidelidade → 422', async () => {
    const bruno = await ctx.token(USUARIOS.bruno);
    const res = await criar(bruno, pedidoApp([{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 2 }], { pontosResgate: 50 })).expect(422);
    esperarErroPadrao(res.body, 'CONSENTIMENTO_FIDELIDADE_AUSENTE');
  });

  it('filtro por canal: GET /pedidos?canalPedido=TOTEM retorna só pedidos do totem', async () => {
    const totem = await ctx.token(USUARIOS.totemSalvador);
    await criar(totem, { unidadeId: IDS.salvador, canalPedido: 'TOTEM', formaPagamento: 'PIX', itens: [{ produtoId: IDS.cuscuzComOvo, quantidade: 1 }] }).expect(201);
    const gerente = await ctx.token(USUARIOS.gerenteSalvador);
    const res = await ctx.http().get('/pedidos?canalPedido=TOTEM').set('Authorization', `Bearer ${gerente}`).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((p: { canalPedido: string }) => p.canalPedido === 'TOTEM')).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });

    const resumo = await ctx.http().get('/pedidos/resumo-por-canal').set('Authorization', `Bearer ${gerente}`).expect(200);
    expect(resumo.body.canais).toHaveLength(5);
    expect(resumo.body.canais.find((c: { canalPedido: string }) => c.canalPedido === 'TOTEM').pedidos).toBeGreaterThan(0);
  });

  it('cardápio mostra disponibilidade e motivo (sem estoque, fora de temporada)', async () => {
    const res = await ctx.http().get(`/unidades/${IDS.salvador}/cardapio`).expect(200);
    const porId = (id: number) => res.body.data.find((i: { produtoId: number }) => i.produtoId === id);
    expect(porId(IDS.cartola)).toMatchObject({ disponivel: false, motivoIndisponibilidade: 'SEM_ESTOQUE' });
    expect(porId(IDS.pamonha)).toMatchObject({ disponivel: false, motivoIndisponibilidade: 'FORA_DE_TEMPORADA' });
    expect(porId(IDS.tapiocaCarneDeSol)).toMatchObject({ disponivel: true, preco: 24.9 });
  });
});
