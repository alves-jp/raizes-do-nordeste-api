import { CanalPedido, Perfil, StatusPedido } from '../../src/domain/enums';
import { ErroDeDominio, NaturezaErro } from '../../src/domain/erros';
import { calcularSubtotal, consolidarItens, validarItens } from '../../src/domain/pedido/calculo-pedido';
import { validarCanalDoPerfil } from '../../src/domain/pedido/canal-por-perfil';
import { validarCancelamento, validarTransicaoOperacional } from '../../src/domain/pedido/maquina-de-status';
import { estaEmTemporada } from '../../src/domain/produto/sazonalidade';

/** Captura o erro de domínio lançado por uma função. */
const erroDe = (fn: () => void): ErroDeDominio => {
  try {
    fn();
  } catch (e) {
    return e as ErroDeDominio;
  }
  throw new Error('Era esperado um ErroDeDominio');
};

describe('Máquina de status do pedido', () => {
  it.each([
    [StatusPedido.PAGO, StatusPedido.EM_PREPARO, Perfil.COZINHA],
    [StatusPedido.EM_PREPARO, StatusPedido.PRONTO, Perfil.COZINHA],
    [StatusPedido.PRONTO, StatusPedido.ENTREGUE, Perfil.ATENDENTE],
    [StatusPedido.PRONTO, StatusPedido.ENTREGUE, Perfil.GERENTE],
  ])('permite %s → %s para %s', (de, para, perfil) => {
    expect(() => validarTransicaoOperacional(de, para, perfil)).not.toThrow();
  });

  it('bloqueia pular etapas (EM_PREPARO → ENTREGUE) com CONFLITO', () => {
    const erro = erroDe(() => validarTransicaoOperacional(StatusPedido.EM_PREPARO, StatusPedido.ENTREGUE, Perfil.GERENTE));
    expect(erro.natureza).toBe(NaturezaErro.CONFLITO);
    expect(erro.codigo).toBe('TRANSICAO_DE_STATUS_INVALIDA');
  });

  it('não permite iniciar preparo de pedido ainda não pago', () => {
    expect(erroDe(() => validarTransicaoOperacional(StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.EM_PREPARO, Perfil.COZINHA)).codigo).toBe(
      'TRANSICAO_DE_STATUS_INVALIDA',
    );
  });

  it('cozinha não pode marcar como ENTREGUE (PROIBIDO)', () => {
    expect(erroDe(() => validarTransicaoOperacional(StatusPedido.PRONTO, StatusPedido.ENTREGUE, Perfil.COZINHA)).natureza).toBe(NaturezaErro.PROIBIDO);
  });

  it('cliente cancela antes do pagamento, mas não depois', () => {
    expect(() => validarCancelamento(StatusPedido.AGUARDANDO_PAGAMENTO, Perfil.CLIENTE)).not.toThrow();
    expect(() => validarCancelamento(StatusPedido.PAGAMENTO_RECUSADO, Perfil.CLIENTE)).not.toThrow();
    expect(erroDe(() => validarCancelamento(StatusPedido.PAGO, Perfil.CLIENTE)).codigo).toBe('PEDIDO_NAO_CANCELAVEL');
  });

  it('gerente cancela até PRONTO; ninguém cancela ENTREGUE', () => {
    expect(() => validarCancelamento(StatusPedido.PRONTO, Perfil.GERENTE)).not.toThrow();
    expect(erroDe(() => validarCancelamento(StatusPedido.ENTREGUE, Perfil.ADMIN)).codigo).toBe('PEDIDO_NAO_CANCELAVEL');
  });
});

describe('Multicanalidade — canal × perfil', () => {
  it.each([
    [CanalPedido.APP, Perfil.CLIENTE],
    [CanalPedido.WEB, Perfil.CLIENTE],
    [CanalPedido.PICKUP, Perfil.CLIENTE],
    [CanalPedido.TOTEM, Perfil.TOTEM],
    [CanalPedido.BALCAO, Perfil.ATENDENTE],
  ])('aceita %s para %s', (canal, perfil) => expect(() => validarCanalDoPerfil(canal, perfil)).not.toThrow());

  it.each([
    [CanalPedido.BALCAO, Perfil.CLIENTE],
    [CanalPedido.APP, Perfil.ATENDENTE],
    [CanalPedido.APP, Perfil.TOTEM],
  ])('rejeita %s para %s', (canal, perfil) => {
    expect(erroDe(() => validarCanalDoPerfil(canal, perfil)).codigo).toBe('CANAL_INCOMPATIVEL_COM_PERFIL');
  });
});

describe('Cálculo e validação de itens', () => {
  it('consolida itens repetidos e soma o subtotal em centavos', () => {
    const itens = consolidarItens([
      { produtoId: 1, quantidade: 1 },
      { produtoId: 2, quantidade: 3 },
      { produtoId: 1, quantidade: 2 },
    ]);
    expect(itens).toEqual([
      { produtoId: 1, quantidade: 3 },
      { produtoId: 2, quantidade: 3 },
    ]);
    expect(
      calcularSubtotal([
        { produtoId: 1, quantidade: 3, precoUnitarioCentavos: 2490 },
        { produtoId: 2, quantidade: 3, precoUnitarioCentavos: 1000 },
      ]),
    ).toBe(10470);
  });

  it('rejeita quantidade acima do limite após consolidar', () => {
    expect(erroDe(() => validarItens([{ produtoId: 1, quantidade: 21 }])).codigo).toBe('QUANTIDADE_ACIMA_DO_LIMITE');
  });
});

describe('Sazonalidade', () => {
  const junino = { sazonal: true, mesInicio: 6, mesFim: 7 };
  const verao = { sazonal: true, mesInicio: 11, mesFim: 2 };

  it('produto junino só é vendido em junho e julho', () => {
    expect(estaEmTemporada(junino, new Date('2026-06-24T12:00:00'))).toBe(true);
    expect(estaEmTemporada(junino, new Date('2026-10-17T12:00:00'))).toBe(false);
  });

  it('janela que atravessa a virada do ano', () => {
    expect(estaEmTemporada(verao, new Date('2026-01-10T12:00:00'))).toBe(true);
    expect(estaEmTemporada(verao, new Date('2026-05-10T12:00:00'))).toBe(false);
  });

  it('produto não sazonal está sempre disponível', () => {
    expect(estaEmTemporada({ sazonal: false, mesInicio: null, mesFim: null }, new Date())).toBe(true);
  });
});
