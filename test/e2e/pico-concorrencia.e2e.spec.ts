import { Contexto, criarContexto, IDS, pedidoApp, USUARIOS } from './apoio';

/**
 * Riscos do horário de pico: muitos pedidos chegando ao mesmo tempo, de canais diferentes,
 * disputando o mesmo estoque, e clientes que reenviam a requisição por instabilidade de rede.
 * As requisições abaixo são disparadas em paralelo (Promise.all).
 */
describe('Horário de pico — concorrência', () => {
  let ctx: Contexto;
  let admin: string;

  beforeAll(async () => {
    ctx = await criarContexto();
    admin = await ctx.token(USUARIOS.admin);
  });
  afterAll(() => ctx.fechar());

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const saldo = async (produtoId: number) => {
    const res = await ctx.http().get(`/estoque?unidadeId=${IDS.recife}&limit=100`).set(auth(admin)).expect(200);
    return res.body.data.find((e: { produtoId: number }) => e.produtoId === produtoId).quantidade as number;
  };

  it('12 pedidos simultâneos (App, Totem e Balcão) pelo último estoque: vende exatamente 4, nunca fica negativo', async () => {
    expect(await saldo(IDS.bolodeRolo)).toBe(4);
    const [ana, totem, atendente] = await Promise.all([ctx.token(USUARIOS.ana), ctx.token(USUARIOS.totemRecife), ctx.token(USUARIOS.atendenteRecife)]);
    const canais = [
      { token: ana, canalPedido: 'APP' },
      { token: totem, canalPedido: 'TOTEM' },
      { token: atendente, canalPedido: 'BALCAO' },
    ];
    const respostas = await Promise.all(
      Array.from({ length: 12 }, (_, i) => {
        const { token, canalPedido } = canais[i % 3];
        return ctx.http().post('/pedidos').set(auth(token)).send(pedidoApp([{ produtoId: IDS.bolodeRolo, quantidade: 1 }], { canalPedido }));
      }),
    );
    const status = respostas.map((r) => r.status);
    expect(status.filter((s) => s === 201)).toHaveLength(4);
    expect(status.filter((s) => s === 409)).toHaveLength(8);
    expect(respostas.filter((r) => r.status === 409).every((r) => r.body.error === 'ESTOQUE_INSUFICIENTE')).toBe(true);
    expect(await saldo(IDS.bolodeRolo)).toBe(0);
  });

  it('5 reenvios simultâneos com a mesma Idempotency-Key criam um único pedido', async () => {
    const ana = await ctx.token(USUARIOS.ana);
    const respostas = await Promise.all(
      Array.from({ length: 5 }, () => ctx.http().post('/pedidos').set(auth(ana)).set('Idempotency-Key', 'pico-reenvio-0001').send(pedidoApp())),
    );
    const ids = new Set(respostas.map((r) => r.body.id));
    expect(ids.size).toBe(1);
    expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(respostas.filter((r) => r.status === 200 && r.headers['idempotent-replayed'] === 'true')).toHaveLength(4);
  });

  it('pagamentos simultâneos do mesmo pedido geram uma única cobrança aprovada', async () => {
    const ana = await ctx.token(USUARIOS.ana);
    const pedido = await ctx.http().post('/pedidos').set(auth(ana)).send(pedidoApp()).expect(201);
    const respostas = await Promise.all(
      Array.from({ length: 4 }, () => ctx.http().post('/pagamentos').set(auth(ana)).send({ pedidoId: pedido.body.id, tokenPagamento: 'tok_aprovado' })),
    );
    expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
    const conflitos = respostas.filter((r) => r.status === 409);
    expect(conflitos).toHaveLength(3);
    // Quem chega durante a cobrança recebe PAGAMENTO_EM_PROCESSAMENTO. Quem chega depois recebe PEDIDO_JA_PAGO.
    expect(conflitos.every((r) => ['PAGAMENTO_EM_PROCESSAMENTO', 'PEDIDO_JA_PAGO'].includes(r.body.error))).toBe(true);
    const aprovados = await ctx.dataSource.query(`SELECT COUNT(*) AS n FROM pagamentos WHERE pedido_id = ? AND status = 'APROVADO'`, [pedido.body.id]);
    expect(Number(aprovados[0].n)).toBe(1);
  });
});
