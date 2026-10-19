import { Contexto, criarContexto, esperarErroPadrao, IDS, pedidoApp, USUARIOS } from './apoio';

/**
 * Fluxo crítico de ponta a ponta (Fluxo A do roteiro):
 * Pedido → Pagamento mock (recusado e aprovado) → Status (cozinha → pronto → entregue),
 * com estoque, fidelidade, idempotência e cancelamento com estorno.
 */
describe('Fluxo A — Pedido → Pagamento mock → Status', () => {
  let ctx: Contexto;
  let ana: string;
  let cozinha: string;
  let atendente: string;

  beforeAll(async () => {
    ctx = await criarContexto();
    ana = await ctx.token(USUARIOS.ana);
    cozinha = await ctx.token(USUARIOS.cozinhaRecife);
    atendente = await ctx.token(USUARIOS.atendenteRecife);
  });
  afterAll(() => ctx.fechar());

  const saldoTapioca = async () => {
    const admin = await ctx.token(USUARIOS.admin);
    const res = await ctx.http().get(`/estoque?unidadeId=${IDS.recife}&limit=100`).set('Authorization', `Bearer ${admin}`).expect(200);
    return res.body.data.find((e: { produtoId: number }) => e.produtoId === IDS.tapiocaCarneDeSol).quantidade as number;
  };

  let pedidoId: number;

  it('cria pedido com campanha e resgate de pontos, baixando o estoque (201)', async () => {
    const estoqueAntes = await saldoTapioca();
    const res = await ctx
      .http()
      .post('/pedidos')
      .set('Authorization', `Bearer ${ana}`)
      .set('Idempotency-Key', 'pedido-ana-0001')
      .send(pedidoApp([{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 2 }, { produtoId: IDS.sucoDeCaja, quantidade: 1 }], { codigoCampanha: 'appraiz10', pontosResgate: 50 }))
      .expect(201);

    pedidoId = res.body.id;
    expect(res.headers.location).toBe(`/pedidos/${pedidoId}`);
    expect(res.body).toMatchObject({
      canalPedido: 'APP',
      status: 'AGUARDANDO_PAGAMENTO',
      clienteId: IDS.ana,
      subtotal: 59.8,
      descontoCampanha: 5.98,
      descontoPontos: 5,
      total: 48.82,
      codigoCampanha: 'APPRAIZ10',
      pontosResgatados: 50,
    });
    expect(await saldoTapioca()).toBe(estoqueAntes - 2);
  });

  it('reenvio com a mesma Idempotency-Key não duplica o pedido (200 + Idempotent-Replayed)', async () => {
    const res = await ctx
      .http()
      .post('/pedidos')
      .set('Authorization', `Bearer ${ana}`)
      .set('Idempotency-Key', 'pedido-ana-0001')
      .send(pedidoApp())
      .expect(200);
    expect(res.headers['idempotent-replayed']).toBe('true');
    expect(res.body.id).toBe(pedidoId);
  });

  it('cozinha não consegue preparar pedido não pago (409)', async () => {
    const res = await ctx.http().patch(`/pedidos/${pedidoId}/status`).set('Authorization', `Bearer ${cozinha}`).send({ status: 'EM_PREPARO' }).expect(409);
    esperarErroPadrao(res.body, 'TRANSICAO_DE_STATUS_INVALIDA');
  });

  it('pagamento recusado → 402 e pedido PAGAMENTO_RECUSADO', async () => {
    const res = await ctx.http().post('/pagamentos').set('Authorization', `Bearer ${ana}`).send({ pedidoId, tokenPagamento: 'tok_recusado_saldo' }).expect(402);
    esperarErroPadrao(res.body, 'PAGAMENTO_RECUSADO');
    expect(res.body.details).toEqual(expect.arrayContaining([{ field: 'codigoRetorno', issue: 'SALDO_INSUFICIENTE' }]));

    const pedido = await ctx.http().get(`/pedidos/${pedidoId}`).set('Authorization', `Bearer ${ana}`).expect(200);
    expect(pedido.body.status).toBe('PAGAMENTO_RECUSADO');
  });

  it('provedor indisponível → 503, nada é cobrado e o pedido não muda', async () => {
    const res = await ctx.http().post('/pagamentos').set('Authorization', `Bearer ${ana}`).send({ pedidoId, tokenPagamento: 'tok_gateway_indisponivel' }).expect(503);
    esperarErroPadrao(res.body, 'GATEWAY_PAGAMENTO_INDISPONIVEL');
    expect(res.headers['retry-after']).toBe('5');
    const pedido = await ctx.http().get(`/pedidos/${pedidoId}`).set('Authorization', `Bearer ${ana}`).expect(200);
    expect(pedido.body.status).toBe('PAGAMENTO_RECUSADO');
  });

  it('nova tentativa aprovada (com falha transitória absorvida pelo retry) → 201, pedido PAGO e pontos creditados', async () => {
    const res = await ctx
      .http()
      .post('/pagamentos')
      .set('Authorization', `Bearer ${ana}`)
      .set('Idempotency-Key', 'pagamento-ana-0001')
      .send({ pedidoId, tokenPagamento: 'tok_gateway_instavel' })
      .expect(201);
    expect(res.body.pagamento).toMatchObject({ status: 'APROVADO', valor: 48.82, forma: 'PIX', codigoRetorno: 'APROVADO' });
    expect(res.body.pagamento.respostaGateway).toMatchObject({ provider: 'raizespay-sandbox', status: 'approved', amount: 4882 });
    expect(res.body.pedido).toEqual({ id: pedidoId, status: 'PAGO', total: 48.82 });
    expect(res.body.pontosCreditados).toBe(24);

    const saldo = await ctx.http().get('/fidelidade/saldo').set('Authorization', `Bearer ${ana}`).expect(200);
    expect(saldo.body.saldo).toBe(120 - 50 + 24);
  });

  it('repetir o pagamento com a mesma chave não cobra de novo (200 + Idempotent-Replayed)', async () => {
    const res = await ctx
      .http()
      .post('/pagamentos')
      .set('Authorization', `Bearer ${ana}`)
      .set('Idempotency-Key', 'pagamento-ana-0001')
      .send({ pedidoId, tokenPagamento: 'tok_gateway_instavel' })
      .expect(200);
    expect(res.headers['idempotent-replayed']).toBe('true');
    const tentativas = await ctx.http().get(`/pedidos/${pedidoId}/pagamentos`).set('Authorization', `Bearer ${ana}`).expect(200);
    expect(tentativas.body.map((p: { status: string }) => p.status)).toEqual(['RECUSADO', 'FALHA_COMUNICACAO', 'APROVADO']);
  });

  it('pagar pedido já pago → 409 PEDIDO_JA_PAGO', async () => {
    const res = await ctx.http().post('/pagamentos').set('Authorization', `Bearer ${ana}`).send({ pedidoId }).expect(409);
    esperarErroPadrao(res.body, 'PEDIDO_JA_PAGO');
  });

  it('cozinha → EM_PREPARO → PRONTO; atendente → ENTREGUE', async () => {
    await ctx.http().patch(`/pedidos/${pedidoId}/status`).set('Authorization', `Bearer ${cozinha}`).send({ status: 'EM_PREPARO' }).expect(200);
    const pronto = await ctx.http().patch(`/pedidos/${pedidoId}/status`).set('Authorization', `Bearer ${cozinha}`).send({ status: 'PRONTO' }).expect(200);
    expect(pronto.body.status).toBe('PRONTO');

    const negado = await ctx.http().patch(`/pedidos/${pedidoId}/status`).set('Authorization', `Bearer ${cozinha}`).send({ status: 'ENTREGUE' }).expect(403);
    esperarErroPadrao(negado.body, 'ACESSO_NEGADO');

    const entregue = await ctx.http().patch(`/pedidos/${pedidoId}/status`).set('Authorization', `Bearer ${atendente}`).send({ status: 'ENTREGUE' }).expect(200);
    expect(entregue.body.status).toBe('ENTREGUE');
  });

  it('status PAGO não pode ser definido manualmente (422)', async () => {
    const res = await ctx.http().patch(`/pedidos/${pedidoId}/status`).set('Authorization', `Bearer ${cozinha}`).send({ status: 'PAGO' }).expect(422);
    esperarErroPadrao(res.body, 'VALIDACAO');
  });

  it('cancelamento de pedido pago (atendente): estorna, devolve estoque e desfaz pontos', async () => {
    const estoqueAntes = await saldoTapioca();
    const criado = await ctx
      .http()
      .post('/pedidos')
      .set('Authorization', `Bearer ${atendente}`)
      .send({ unidadeId: IDS.recife, canalPedido: 'BALCAO', formaPagamento: 'CARTAO_DEBITO', clienteId: IDS.ana, itens: [{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 3 }] })
      .expect(201);
    expect(criado.body.canalPedido).toBe('BALCAO');
    const pago = await ctx.http().post('/pagamentos').set('Authorization', `Bearer ${atendente}`).send({ pedidoId: criado.body.id }).expect(201);
    expect(pago.body.pontosCreditados).toBe(37); // R$ 74,70 → 37 pontos
    const saldoAntes = (await ctx.http().get('/fidelidade/saldo').set('Authorization', `Bearer ${ana}`)).body.saldo;

    const cancelado = await ctx
      .http()
      .post(`/pedidos/${criado.body.id}/cancelamento`)
      .set('Authorization', `Bearer ${atendente}`)
      .send({ motivo: 'Cliente desistiu antes do preparo' })
      .expect(200);
    expect(cancelado.body).toMatchObject({ status: 'CANCELADO', motivoCancelamento: 'Cliente desistiu antes do preparo' });

    const tentativas = await ctx.http().get(`/pedidos/${criado.body.id}/pagamentos`).set('Authorization', `Bearer ${atendente}`).expect(200);
    expect(tentativas.body[0].status).toBe('ESTORNADO');
    expect(tentativas.body[0].respostaGateway.refund.status).toBe('refunded');
    expect(await saldoTapioca()).toBe(estoqueAntes);
    const saldoDepois = (await ctx.http().get('/fidelidade/saldo').set('Authorization', `Bearer ${ana}`)).body.saldo;
    expect(saldoDepois).toBe(saldoAntes - 37);
  });

  it('cliente não cancela pedido já pago (409)', async () => {
    const criado = await ctx.http().post('/pedidos').set('Authorization', `Bearer ${ana}`).send(pedidoApp()).expect(201);
    await ctx.http().post('/pagamentos').set('Authorization', `Bearer ${ana}`).send({ pedidoId: criado.body.id }).expect(201);
    const res = await ctx.http().post(`/pedidos/${criado.body.id}/cancelamento`).set('Authorization', `Bearer ${ana}`).send({ motivo: 'Mudei de ideia' }).expect(409);
    esperarErroPadrao(res.body, 'PEDIDO_NAO_CANCELAVEL');
  });

  it('pedido do totem: canal TOTEM, cliente opcional e acúmulo só com consentimento', async () => {
    const totem = await ctx.token(USUARIOS.totemRecife);
    const criado = await ctx
      .http()
      .post('/pedidos')
      .set('Authorization', `Bearer ${totem}`)
      .send({ unidadeId: IDS.recife, canalPedido: 'TOTEM', formaPagamento: 'CARTAO_CREDITO', clienteId: IDS.bruno, itens: [{ produtoId: IDS.cuscuzComOvo, quantidade: 2 }] })
      .expect(201);
    const pago = await ctx.http().post('/pagamentos').set('Authorization', `Bearer ${totem}`).send({ pedidoId: criado.body.id }).expect(201);
    expect(pago.body.pontosCreditados).toBe(0); // Bruno não consentiu com o programa
  });
});
