import { calcularDescontoDeCampanha, CampanhaAvaliavel } from '../../src/domain/campanha/regras-campanha';
import { CanalPedido } from '../../src/domain/enums';
import { ErroDeDominio } from '../../src/domain/erros';
import { calcularDescontoPorPontos, calcularPontosGanhos } from '../../src/domain/fidelidade/regras-fidelidade';
import { mascararEmail, mascararTelefone } from '../../src/domain/lgpd/mascaramento';

const codigoDoErro = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ErroDeDominio).codigo;
  }
  return null;
};

describe('Programa de fidelidade "Cliente Raiz"', () => {
  it('acumula 1 ponto a cada R$ 2,00 (arredonda para baixo)', () => {
    expect(calcularPontosGanhos(4882)).toBe(24); // R$ 48,82
    expect(calcularPontosGanhos(199)).toBe(0);
  });

  it('resgate: 50 pontos = R$ 5,00 de desconto', () => {
    expect(calcularDescontoPorPontos(50, 120, 5000)).toBe(500);
  });

  it('valida mínimo, saldo e teto de 30%', () => {
    expect(codigoDoErro(() => calcularDescontoPorPontos(40, 120, 5000))).toBe('RESGATE_ABAIXO_DO_MINIMO');
    expect(codigoDoErro(() => calcularDescontoPorPontos(200, 120, 50000))).toBe('SALDO_DE_PONTOS_INSUFICIENTE');
    expect(codigoDoErro(() => calcularDescontoPorPontos(100, 120, 2000))).toBe('RESGATE_ACIMA_DO_LIMITE'); // R$10 > 30% de R$20
  });
});

describe('Campanhas promocionais', () => {
  const base: CampanhaAvaliavel = {
    codigo: 'APPRAIZ10',
    ativa: true,
    percentualDesconto: 10,
    inicio: new Date('2026-01-01T00:00:00Z'),
    fim: new Date('2026-12-31T23:59:59Z'),
    unidadeId: null,
    canalPedido: CanalPedido.APP,
    valorMinimoCentavos: 2000,
  };
  const ctx = { unidadeId: 1, canalPedido: CanalPedido.APP, subtotalCentavos: 5980, agora: new Date('2026-10-17T12:00:00Z') };

  it('aplica o percentual sobre o subtotal', () => {
    expect(calcularDescontoDeCampanha(base, ctx)).toBe(598);
  });

  it('respeita canal, vigência, unidade e valor mínimo', () => {
    expect(codigoDoErro(() => calcularDescontoDeCampanha(base, { ...ctx, canalPedido: CanalPedido.TOTEM }))).toBe('CAMPANHA_NAO_APLICAVEL');
    expect(codigoDoErro(() => calcularDescontoDeCampanha(base, { ...ctx, agora: new Date('2027-02-01T00:00:00Z') }))).toBe('CAMPANHA_NAO_APLICAVEL');
    expect(codigoDoErro(() => calcularDescontoDeCampanha({ ...base, unidadeId: 2 }, ctx))).toBe('CAMPANHA_NAO_APLICAVEL');
    expect(codigoDoErro(() => calcularDescontoDeCampanha(base, { ...ctx, subtotalCentavos: 1500 }))).toBe('CAMPANHA_NAO_APLICAVEL');
  });
});

describe('LGPD — mascaramento', () => {
  it('mascara e-mail e telefone', () => {
    expect(mascararEmail('ana.souza@email.com')).toBe('an***@email.com');
    expect(mascararTelefone('(71) 99876-1234')).toBe('(**) *****-1234');
    expect(mascararEmail(null)).toBeNull();
  });
});
