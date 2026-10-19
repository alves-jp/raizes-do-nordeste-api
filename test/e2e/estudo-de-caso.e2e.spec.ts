import { Contexto, criarContexto, esperarErroPadrao, IDS, pedidoApp, USUARIOS } from './apoio';

/**
 * Aderência ao estudo de caso oficial (rev. 0.3): diferenças entre unidades, receitas regionais,
 * relatórios da matriz, fidelidade progressiva por frequência e campanhas segmentadas com LGPD.
 */
describe('Estudo de caso — unidades, relatórios, fidelidade e segmentação', () => {
  let ctx: Contexto;
  let admin: string;
  let ana: string;

  beforeAll(async () => {
    ctx = await criarContexto();
    admin = await ctx.token(USUARIOS.admin);
    ana = await ctx.token(USUARIOS.ana);
  });
  afterAll(() => ctx.fechar());

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Cria um pedido da Ana no App e paga com o token aprovado. */
  const pedidoPago = async (itens = [{ produtoId: IDS.tapiocaCarneDeSol, quantidade: 1 }], extra: Record<string, unknown> = {}) => {
    const pedido = await ctx.http().post('/pedidos').set(auth(ana)).send(pedidoApp(itens, extra)).expect(201);
    await ctx.http().post('/pagamentos').set(auth(ana)).send({ pedidoId: pedido.body.id, tokenPagamento: 'tok_aprovado' }).expect(201);
    return pedido.body;
  };

  describe('Unidades diferentes sem quebrar o padrão da franquia', () => {
    it('unidades expõem região e formato; a primeira é Recife (origem da rede) e BH opera em formato reduzido', async () => {
      const res = await ctx.http().get('/unidades').expect(200);
      expect(res.body.data[0]).toMatchObject({ id: IDS.recife, cidade: 'Recife', uf: 'PE', regiao: 'NORDESTE', formato: 'COMPLETA' });
      expect(res.body.data.find((u: { id: number }) => u.id === IDS.bh)).toMatchObject({ regiao: 'SUDESTE', formato: 'REDUZIDA' });
      expect(res.body.data[0].metaMensalCentavos).toBeUndefined(); // meta é interna (só nos relatórios)
    });

    it('cardápio mostra a variação regional da receita', async () => {
      const fortaleza = await ctx.http().get(`/unidades/${IDS.fortaleza}/cardapio`).expect(200);
      const cuscuz = fortaleza.body.data.find((i: { produtoId: number }) => i.produtoId === IDS.cuscuzComOvo);
      expect(cuscuz.variacaoRegional).toMatch(/cearense/);
      expect(fortaleza.body.unidade.formato).toBe('COMPLETA');
    });

    it('produto que exige cozinha completa não entra no cardápio de unidade REDUZIDA (422)', async () => {
      const res = await ctx.http().put(`/unidades/${IDS.bh}/cardapio/${IDS.baiaoDeDois}`).set(auth(admin)).send({ preco: 36.9 }).expect(422);
      esperarErroPadrao(res.body, 'PRODUTO_EXIGE_COZINHA_COMPLETA');
    });

    it('gerente define a variação regional ao incluir/atualizar o item (auditado)', async () => {
      const gerente = await ctx.token(USUARIOS.gerenteFortaleza);
      const res = await ctx
        .http()
        .put(`/unidades/${IDS.fortaleza}/cardapio/${IDS.bolodeMacaxeira}`)
        .set(auth(gerente))
        .send({ preco: 9.9, variacaoRegional: 'Com coco queimado, receita da casa de Fortaleza' })
        .expect(200);
      expect(res.body).toMatchObject({ preco: 9.9, variacaoRegional: 'Com coco queimado, receita da casa de Fortaleza' });
    });

    it('não marca como "exige cozinha completa" um produto vendido em unidade REDUZIDA (409)', async () => {
      const res = await ctx.http().patch(`/produtos/${IDS.tapiocaCarneDeSol}`).set(auth(admin)).send({ exigeCozinhaCompleta: true }).expect(409);
      esperarErroPadrao(res.body, 'PRODUTO_EM_UNIDADE_REDUZIDA');
    });
  });

  describe('Fidelidade progressiva e campanhas segmentadas', () => {
    it('cliente começa no nível BRONZE (ponto vale R$ 0,10)', async () => {
      const res = await ctx.http().get('/fidelidade/saldo').set(auth(ana)).expect(200);
      expect(res.body).toMatchObject({ nivel: 'BRONZE', pedidosPagosUltimos90Dias: 0, valorDoPonto: 0.1, proximoNivel: { nivel: 'PRATA', pedidosQueFaltam: 4 } });
    });

    it('campanha por nível rejeita cliente BRONZE (422)', async () => {
      const res = await ctx.http().post('/pedidos').set(auth(ana)).send(pedidoApp(undefined, { codigoCampanha: 'RAIZPRATA12' })).expect(422);
      esperarErroPadrao(res.body, 'CAMPANHA_NAO_APLICAVEL');
      expect(res.body.details[0].issue).toMatch(/nível PRATA/);
    });

    it('após 4 pedidos pagos em 90 dias o cliente sobe para PRATA e o ponto passa a valer R$ 0,12', async () => {
      for (let i = 0; i < 4; i++) await pedidoPago();
      const res = await ctx.http().get('/fidelidade/saldo').set(auth(ana)).expect(200);
      expect(res.body).toMatchObject({ nivel: 'PRATA', pedidosPagosUltimos90Dias: 4, valorDoPonto: 0.12 });
    });

    it('resgate de 50 pontos no nível PRATA dá R$ 6,00 de desconto (desconto progressivo)', async () => {
      const res = await ctx
        .http()
        .post('/pedidos')
        .set(auth(ana))
        .send(pedidoApp([{ produtoId: IDS.cafeDaManhaCompleto, quantidade: 1 }], { pontosResgate: 50 }))
        .expect(201);
      expect(res.body).toMatchObject({ subtotal: 34.9, descontoPontos: 6, total: 28.9 });
    });

    it('campanha por nível aceita o cliente PRATA', async () => {
      const res = await ctx.http().post('/pedidos').set(auth(ana)).send(pedidoApp(undefined, { codigoCampanha: 'RAIZPRATA12' })).expect(201);
      expect(res.body).toMatchObject({ subtotal: 24.9, descontoCampanha: 2.98, codigoCampanha: 'RAIZPRATA12' });
    });

    it('campanha por faixa etária vale para a Ana (23 anos, consentiu MARKETING)', async () => {
      const res = await ctx.http().post('/pedidos').set(auth(ana)).send(pedidoApp(undefined, { codigoCampanha: 'UNIRAIZES' })).expect(201);
      expect(res.body.descontoCampanha).toBe(2.49);
      const log = await ctx.http().get(`/auditoria?acao=PEDIDO_CRIADO&entidadeId=${res.body.id}`).set(auth(admin)).expect(200);
      expect(log.body.data[0].detalhes).toMatchObject({ campanha: 'UNIRAIZES', campanhaSegmentada: true });
      expect(JSON.stringify(log.body.data[0].detalhes)).not.toMatch(/2003|"idade"|nascimento/i);
    });

    it('campanha segmentada exige consentimento MARKETING (Bruno não consentiu → 422)', async () => {
      const bruno = await ctx.token(USUARIOS.bruno);
      const res = await ctx.http().post('/pedidos').set(auth(bruno)).send(pedidoApp(undefined, { codigoCampanha: 'UNIRAIZES' })).expect(422);
      expect(res.body.details[0].issue).toMatch(/MARKETING/);
    });

    it('campanha segmentada não vale para pedido sem cliente identificado (totem anônimo → 422)', async () => {
      const totem = await ctx.token(USUARIOS.totemRecife);
      const res = await ctx.http().post('/pedidos').set(auth(totem)).send(pedidoApp(undefined, { canalPedido: 'TOTEM', codigoCampanha: 'RAIZPRATA12' })).expect(422);
      expect(res.body.details[0].issue).toMatch(/clientes identificados/);
    });

    it('ADMIN cria campanha segmentada; faixa etária abaixo de 18 anos é rejeitada', async () => {
      const base = { descricao: 'Teste', percentualDesconto: 5, inicio: '2026-11-01T00:00:00-03:00', fim: '2026-12-31T23:59:59-03:00' };
      const ok = await ctx.http().post('/campanhas').set(auth(admin)).send({ ...base, codigo: 'OUROVIP5', nivelMinimoFidelidade: 'OURO' }).expect(201);
      expect(ok.body.segmentacao).toMatchObject({ nivelMinimoFidelidade: 'OURO', exigeConsentimentoMarketing: true });
      const menor = await ctx.http().post('/campanhas').set(auth(admin)).send({ ...base, codigo: 'TEEN10', idadeMinima: 15 }).expect(422);
      esperarErroPadrao(menor.body, 'SEGMENTACAO_NAO_PERMITIDA_PARA_MENORES');
    });
  });

  describe('Data de nascimento opcional com consentimento (LGPD)', () => {
    const cadastro = (extra: Record<string, unknown>) => ({
      nome: 'Teste Segmentação',
      senha: 'Cuscuz2026',
      aceiteTermos: true,
      ...extra,
    });

    it('cadastro com data de nascimento sem consentimento MARKETING → 422', async () => {
      const res = await ctx.http().post('/usuarios').send(cadastro({ email: 'seg1@email.com', dataNascimento: '1998-04-23' })).expect(422);
      esperarErroPadrao(res.body, 'CONSENTIMENTO_MARKETING_AUSENTE');
    });

    it('cadastro de menor de 18 anos com data de nascimento → 422', async () => {
      const res = await ctx
        .http()
        .post('/usuarios')
        .send(cadastro({ email: 'seg2@email.com', dataNascimento: '2012-01-10', consentimentos: { marketing: true } }))
        .expect(422);
      esperarErroPadrao(res.body, 'SEGMENTACAO_NAO_PERMITIDA_PARA_MENORES');
    });

    it('cliente com MARKETING mas sem data de nascimento não usa campanha por faixa etária', async () => {
      await ctx.http().post('/usuarios').send(cadastro({ email: 'seg3@email.com', consentimentos: { marketing: true } })).expect(201);
      const login = await ctx.http().post('/auth/login').send({ email: 'seg3@email.com', senha: 'Cuscuz2026' }).expect(200);
      const token = login.body.accessToken;
      const res = await ctx.http().post('/pedidos').set(auth(token)).send(pedidoApp(undefined, { codigoCampanha: 'UNIRAIZES' })).expect(422);
      expect(res.body.details[0].issue).toMatch(/data de nascimento/);

      const perfil = await ctx.http().patch('/usuarios/me').set(auth(token)).send({ dataNascimento: '2002-08-30' }).expect(200);
      expect(perfil.body.dataNascimento).toBe('2002-08-30');
      await ctx.http().post('/pedidos').set(auth(token)).send(pedidoApp(undefined, { codigoCampanha: 'UNIRAIZES' })).expect(201);

      const log = await ctx.http().get('/auditoria?acao=DADOS_PESSOAIS_ATUALIZADOS').set(auth(admin)).expect(200);
      expect(log.body.data[0].detalhes).toEqual({ campos: ['dataNascimento'] });
    });

    it('revogar MARKETING apaga a data de nascimento (fim da finalidade)', async () => {
      await ctx.http().put('/usuarios/me/consentimentos/MARKETING').set(auth(ana)).send({ concedido: false }).expect(200);
      const perfil = await ctx.http().get('/usuarios/me').set(auth(ana)).expect(200);
      expect(perfil.body.dataNascimento).toBeNull();
      const exportacao = await ctx.http().get('/usuarios/me/dados').set(auth(ana)).expect(200);
      expect(exportacao.body.titular).toHaveProperty('dataNascimento', null);
    });

    it('listagem administrativa nunca expõe a data de nascimento', async () => {
      const res = await ctx.http().get('/usuarios?perfil=CLIENTE').set(auth(admin)).expect(200);
      expect(res.body.data.every((u: Record<string, unknown>) => !('dataNascimento' in u))).toBe(true);
    });
  });

  describe('Relatórios da matriz', () => {
    beforeAll(async () => {
      // Venda em Fortaleza (franquia) para haver duas regiões/unidades com movimento.
      const pedido = await ctx.http().post('/pedidos').set(auth(ana)).send(pedidoApp([{ produtoId: IDS.sucoDeCaja, quantidade: 2 }], { unidadeId: IDS.fortaleza })).expect(201);
      await ctx.http().post('/pagamentos').set(auth(ana)).send({ pedidoId: pedido.body.id }).expect(201);
    });

    it('ADMIN: vendas por unidade com financeiro, meta e consolidado da rede', async () => {
      const res = await ctx.http().get('/relatorios/vendas').set(auth(admin)).expect(200);
      expect(res.body).toMatchObject({ agruparPor: 'UNIDADE', escopo: 'REDE' });
      expect(res.body.grupos).toHaveLength(3);
      const recife = res.body.grupos.find((g: { id: number }) => g.id === IDS.recife);
      expect(recife).toMatchObject({ regiao: 'NORDESTE', pedidosPagos: 4, faturamentoBruto: 99.6, faturamentoLiquido: 99.6, ticketMedio: 24.9, metaMensal: 90000 });
      expect(recife.percentualDaMeta).toBeCloseTo(0.1, 1);
      const fortaleza = res.body.grupos.find((g: { id: number }) => g.id === IDS.fortaleza);
      expect(fortaleza).toMatchObject({ pedidosPagos: 1, faturamentoLiquido: 19 });
      expect(res.body.consolidado).toMatchObject({ pedidosPagos: 5, faturamentoLiquido: 118.6 });
    });

    it('ADMIN: vendas por região (IBGE)', async () => {
      const res = await ctx.http().get('/relatorios/vendas?agruparPor=REGIAO').set(auth(admin)).expect(200);
      const nordeste = res.body.grupos.find((g: { regiao: string }) => g.regiao === 'NORDESTE');
      expect(nordeste).toMatchObject({ unidades: 2, pedidosPagos: 5, metaMensal: 160000 });
      expect(res.body.grupos.find((g: { regiao: string }) => g.regiao === 'SUDESTE')).toMatchObject({ unidades: 1, pedidosPagos: 0 });
    });

    it('produtos mais vendidos em ranking', async () => {
      const res = await ctx.http().get('/relatorios/produtos-mais-vendidos?limite=3').set(auth(admin)).expect(200);
      expect(res.body.produtos[0]).toMatchObject({ posicao: 1, produtoId: IDS.tapiocaCarneDeSol, quantidade: 4 });
      expect(res.body.produtos[1]).toMatchObject({ produtoId: IDS.sucoDeCaja, quantidade: 2 });
    });

    it('GERENTE vê só a própria unidade; pedir outra unidade → 403', async () => {
      const gerente = await ctx.token(USUARIOS.gerenteRecife);
      const res = await ctx.http().get('/relatorios/vendas').set(auth(gerente)).expect(200);
      expect(res.body.escopo).toEqual({ unidadeId: IDS.recife });
      expect(res.body.grupos).toHaveLength(1);
      await ctx.http().get(`/relatorios/vendas?unidadeId=${IDS.fortaleza}`).set(auth(gerente)).expect(403);
    });

    it('CLIENTE não acessa relatórios (403) e período invertido → 422', async () => {
      await ctx.http().get('/relatorios/vendas').set(auth(ana)).expect(403);
      const res = await ctx.http().get('/relatorios/vendas?de=2026-10-31&ate=2026-10-01').set(auth(admin)).expect(422);
      esperarErroPadrao(res.body, 'PERIODO_INVALIDO');
    });

    it('a consulta de relatórios é auditada', async () => {
      const res = await ctx.http().get('/auditoria?acao=RELATORIO_CONSULTADO').set(auth(admin)).expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
