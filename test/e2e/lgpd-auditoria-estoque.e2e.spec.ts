import { Contexto, criarContexto, esperarErroPadrao, IDS, pedidoApp, USUARIOS } from './apoio';

describe('LGPD, auditoria e estoque', () => {
  let ctx: Contexto;
  let admin: string;
  beforeAll(async () => {
    ctx = await criarContexto();
    admin = await ctx.token(USUARIOS.admin);
  });
  afterAll(() => ctx.fechar());

  describe('LGPD', () => {
    const novo = {
      nome: 'Carla Menezes',
      email: 'Carla.Menezes@Email.com',
      senha: 'Cuscuz2026',
      telefone: '(71) 98888-7777',
      aceiteTermos: true,
      consentimentos: { fidelidade: true },
    };
    let token: string;
    let id: number;

    it('cadastro exige aceite dos termos (422) e nunca devolve a senha', async () => {
      await ctx.http().post('/usuarios').send({ ...novo, aceiteTermos: false }).expect(422);
      const res = await ctx.http().post('/usuarios').send(novo).expect(201);
      id = res.body.id;
      expect(res.body).toMatchObject({ nome: 'Carla Menezes', perfil: 'CLIENTE' });
      expect(JSON.stringify(res.body)).not.toMatch(/senha|hash/i);
    });

    it('e-mail duplicado (case-insensitive) → 409', async () => {
      const res = await ctx.http().post('/usuarios').send({ ...novo, email: 'carla.menezes@email.com' }).expect(409);
      esperarErroPadrao(res.body, 'EMAIL_JA_CADASTRADO');
    });

    it('senha fraca → 422', async () => {
      const res = await ctx.http().post('/usuarios').send({ ...novo, email: 'outra@email.com', senha: '12345678' }).expect(422);
      expect(res.body.details[0].field).toBe('senha');
    });

    it('consentimentos: registro inicial, revogação e histórico', async () => {
      token = (await ctx.http().post('/auth/login').send({ email: 'carla.menezes@email.com', senha: 'Cuscuz2026' }).expect(200)).body.accessToken;
      const perfil = await ctx.http().get('/usuarios/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(perfil.body.consentimentos).toEqual(
        expect.arrayContaining([expect.objectContaining({ finalidade: 'FIDELIDADE', concedido: true }), expect.objectContaining({ finalidade: 'MARKETING', concedido: false })]),
      );
      await ctx.http().put('/usuarios/me/consentimentos/FIDELIDADE').set('Authorization', `Bearer ${token}`).send({ concedido: false }).expect(200);
      const historico = await ctx.http().get('/usuarios/me/consentimentos').set('Authorization', `Bearer ${token}`).expect(200);
      expect(historico.body.filter((c: { finalidade: string }) => c.finalidade === 'FIDELIDADE')).toHaveLength(2);
    });

    it('listagem administrativa mascara e-mail e telefone; consulta completa é auditada', async () => {
      const lista = await ctx.http().get('/usuarios?perfil=CLIENTE&limit=50').set('Authorization', `Bearer ${admin}`).expect(200);
      const carla = lista.body.data.find((u: { id: number }) => u.id === id);
      expect(carla).toMatchObject({ email: 'ca***@email.com', telefone: '(**) *****-7777' });

      await ctx.http().get(`/usuarios/${id}`).set('Authorization', `Bearer ${admin}`).expect(200);
      const auditoria = await ctx.http().get(`/auditoria?acao=DADOS_PESSOAIS_ACESSADOS&entidadeId=${id}`).set('Authorization', `Bearer ${admin}`).expect(200);
      expect(auditoria.body.data[0]).toMatchObject({ acao: 'DADOS_PESSOAIS_ACESSADOS', perfil: 'ADMIN', entidadeId: id });
      expect(auditoria.body.data[0].requestId).toEqual(expect.any(String));
    });

    it('exportação dos próprios dados (portabilidade)', async () => {
      const res = await ctx.http().get('/usuarios/me/dados').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.titular).toMatchObject({ email: 'carla.menezes@email.com' });
      expect(res.body).toHaveProperty('consentimentos');
      expect(res.body).toHaveProperty('pedidos');
      expect(res.body).toHaveProperty('fidelidade');
    });

    it('anonimização: remove dados pessoais, invalida o token e mantém pedidos', async () => {
      const pedido = await ctx.http().post('/pedidos').set('Authorization', `Bearer ${token}`).send(pedidoApp()).expect(201);
      await ctx.http().delete('/usuarios/me').set('Authorization', `Bearer ${token}`).expect(204);
      await ctx.http().get('/usuarios/me').set('Authorization', `Bearer ${token}`).expect(401);
      await ctx.http().post('/auth/login').send({ email: 'carla.menezes@email.com', senha: 'Cuscuz2026' }).expect(401);

      const dados = await ctx.http().get(`/usuarios/${id}`).set('Authorization', `Bearer ${admin}`).expect(200);
      expect(dados.body).toMatchObject({ nome: 'Titular anonimizado', telefone: null, ativo: false });
      expect(dados.body.email).toMatch(/@raizes\.invalid$/);
      const mantido = await ctx.http().get(`/pedidos/${pedido.body.id}`).set('Authorization', `Bearer ${admin}`).expect(200);
      expect(mantido.body.clienteId).toBe(id);
    });
  });

  describe('Auditoria', () => {
    it('criação de pedido e mudança de status geram registro com autor, unidade e detalhes', async () => {
      const atendente = await ctx.token(USUARIOS.atendenteSalvador);
      const pedido = await ctx
        .http()
        .post('/pedidos')
        .set('Authorization', `Bearer ${atendente}`)
        .send({ unidadeId: IDS.salvador, canalPedido: 'BALCAO', formaPagamento: 'PIX', itens: [{ produtoId: IDS.cuscuzComOvo, quantidade: 1 }] })
        .expect(201);

      const gerente = await ctx.token(USUARIOS.gerenteSalvador);
      const res = await ctx.http().get(`/auditoria?acao=PEDIDO_CRIADO&entidadeId=${pedido.body.id}`).set('Authorization', `Bearer ${gerente}`).expect(200);
      expect(res.body.data[0]).toMatchObject({ acao: 'PEDIDO_CRIADO', entidade: 'Pedido', perfil: 'ATENDENTE', unidadeId: IDS.salvador, detalhes: { canalPedido: 'BALCAO' } });
    });

    it('gerente só vê auditoria da própria unidade; cliente não acessa (403)', async () => {
      const gerenteFortaleza = await ctx.token(USUARIOS.gerenteFortaleza);
      const res = await ctx.http().get('/auditoria?acao=PEDIDO_CRIADO').set('Authorization', `Bearer ${gerenteFortaleza}`).expect(200);
      expect(res.body.data.every((r: { unidadeId: number }) => r.unidadeId === IDS.fortaleza)).toBe(true);
      const ana = await ctx.token(USUARIOS.ana);
      await ctx.http().get('/auditoria').set('Authorization', `Bearer ${ana}`).expect(403);
    });

    it('login com falha é auditado com e-mail mascarado', async () => {
      await ctx.http().post('/auth/login').send({ email: 'ninguem@email.com', senha: 'qualquer123' }).expect(401);
      const res = await ctx.http().get('/auditoria?acao=LOGIN_FALHA').set('Authorization', `Bearer ${admin}`).expect(200);
      expect(res.body.data[0].detalhes).toEqual({ email: 'ni***@email.com' });
    });
  });

  describe('Estoque por unidade (Fluxo B)', () => {
    let gerente: string;
    beforeAll(async () => (gerente = await ctx.token(USUARIOS.gerenteSalvador)));

    it('entrada de mercadoria atualiza saldo e gera histórico', async () => {
      const res = await ctx
        .http()
        .post('/estoque/movimentacoes')
        .set('Authorization', `Bearer ${gerente}`)
        .send({ unidadeId: IDS.salvador, produtoId: IDS.cartola, tipo: 'ENTRADA', quantidade: 12, motivo: 'Recebimento NF 4512' })
        .expect(201);
      expect(res.body).toMatchObject({ tipo: 'ENTRADA', quantidade: 12, saldoAtual: 12 });
      const historico = await ctx.http().get(`/estoque/movimentacoes?unidadeId=${IDS.salvador}&produtoId=${IDS.cartola}`).set('Authorization', `Bearer ${gerente}`).expect(200);
      expect(historico.body.data[0]).toMatchObject({ tipo: 'ENTRADA', saldoApos: 12 });
    });

    it('saída sem motivo → 422; saída acima do saldo → 409', async () => {
      const semMotivo = await ctx.http().post('/estoque/movimentacoes').set('Authorization', `Bearer ${gerente}`).send({ unidadeId: IDS.salvador, produtoId: IDS.cartola, tipo: 'SAIDA', quantidade: 1 }).expect(422);
      esperarErroPadrao(semMotivo.body, 'MOTIVO_OBRIGATORIO');
      const acima = await ctx
        .http()
        .post('/estoque/movimentacoes')
        .set('Authorization', `Bearer ${gerente}`)
        .send({ unidadeId: IDS.salvador, produtoId: IDS.cartola, tipo: 'SAIDA', quantidade: 500, motivo: 'Perda' })
        .expect(409);
      esperarErroPadrao(acima.body, 'ESTOQUE_INSUFICIENTE');
    });

    it('consulta de saldo com filtro de estoque baixo', async () => {
      const res = await ctx.http().get(`/estoque?unidadeId=${IDS.salvador}&somenteBaixo=true`).set('Authorization', `Bearer ${gerente}`).expect(200);
      expect(res.body.data.every((e: { estoqueBaixo: boolean }) => e.estoqueBaixo)).toBe(true);
    });
  });
});
