import { calcularDescontoDeCampanha, CampanhaAvaliavel, PerfilDoCliente } from '../../src/domain/campanha/regras-campanha';
import { calcularIdade, validarDataNascimento } from '../../src/domain/cliente/idade';
import { CanalPedido, FormatoUnidade, NivelFidelidade, Regiao } from '../../src/domain/enums';
import { ErroDeDominio } from '../../src/domain/erros';
import { calcularDescontoPorPontos, calcularNivel, nivelAtende } from '../../src/domain/fidelidade/regras-fidelidade';
import { regiaoDaUf, validarProdutoNoFormato } from '../../src/domain/unidade/regras-unidade';

const erro = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as ErroDeDominio;
  }
  return null;
};

describe('Diferenças entre unidades da rede', () => {
  it('classifica a UF na região do IBGE (relatórios por região)', () => {
    expect(regiaoDaUf('PE')).toBe(Regiao.NORDESTE);
    expect(regiaoDaUf('mg')).toBe(Regiao.SUDESTE);
    expect(regiaoDaUf('DF')).toBe(Regiao.CENTRO_OESTE);
    expect(erro(() => regiaoDaUf('XX'))?.codigo).toBe('UF_INVALIDA');
  });

  it('unidade em formato reduzido não vende produto que exige cozinha completa', () => {
    const baiao = { nome: 'Baião de dois', exigeCozinhaCompleta: true };
    const suco = { nome: 'Suco de cajá', exigeCozinhaCompleta: false };
    const bh = { nome: 'BH', formato: FormatoUnidade.REDUZIDA };
    const recife = { nome: 'Recife', formato: FormatoUnidade.COMPLETA };
    expect(erro(() => validarProdutoNoFormato(baiao, bh))?.codigo).toBe('PRODUTO_EXIGE_COZINHA_COMPLETA');
    expect(() => validarProdutoNoFormato(baiao, recife)).not.toThrow();
    expect(() => validarProdutoNoFormato(suco, bh)).not.toThrow();
  });
});

describe('Fidelidade com descontos progressivos', () => {
  it('nível pela frequência de consumo (pedidos pagos em 90 dias)', () => {
    expect(calcularNivel(0)).toMatchObject({ nivel: NivelFidelidade.BRONZE, valorDoPontoEmCentavos: 10, proximoNivel: { nivel: NivelFidelidade.PRATA, pedidosQueFaltam: 4 } });
    expect(calcularNivel(4)).toMatchObject({ nivel: NivelFidelidade.PRATA, valorDoPontoEmCentavos: 12, proximoNivel: { nivel: NivelFidelidade.OURO, pedidosQueFaltam: 6 } });
    expect(calcularNivel(15)).toMatchObject({ nivel: NivelFidelidade.OURO, valorDoPontoEmCentavos: 15, proximoNivel: null });
  });

  it('o mesmo resgate vale mais nos níveis superiores', () => {
    expect(calcularDescontoPorPontos(50, 120, 10000, 10)).toBe(500);
    expect(calcularDescontoPorPontos(50, 120, 10000, 12)).toBe(600);
    expect(calcularDescontoPorPontos(50, 120, 10000, 15)).toBe(750);
  });

  it('compara níveis', () => {
    expect(nivelAtende(NivelFidelidade.OURO, NivelFidelidade.PRATA)).toBe(true);
    expect(nivelAtende(NivelFidelidade.BRONZE, NivelFidelidade.PRATA)).toBe(false);
  });
});

describe('Data de nascimento opcional (LGPD)', () => {
  const agora = new Date('2026-10-17T15:00:00Z');

  it('calcula a idade considerando se o aniversário já passou', () => {
    expect(calcularIdade('2003-05-14', agora)).toBe(23);
    expect(calcularIdade('2003-12-01', agora)).toBe(22);
  });

  it('rejeita formato, data inexistente, futuro e menores de 18 anos', () => {
    expect(erro(() => validarDataNascimento('14/05/2003', agora))?.codigo).toBe('DATA_NASCIMENTO_INVALIDA');
    expect(erro(() => validarDataNascimento('2003-02-30', agora))?.codigo).toBe('DATA_NASCIMENTO_INVALIDA');
    expect(erro(() => validarDataNascimento('2030-01-01', agora))?.codigo).toBe('DATA_NASCIMENTO_INVALIDA');
    expect(erro(() => validarDataNascimento('2010-01-01', agora))?.codigo).toBe('SEGMENTACAO_NAO_PERMITIDA_PARA_MENORES');
    expect(() => validarDataNascimento('2003-05-14', agora)).not.toThrow();
  });
});

describe('Campanhas segmentadas', () => {
  const base: CampanhaAvaliavel = {
    codigo: 'SEG',
    ativa: true,
    percentualDesconto: 10,
    inicio: new Date('2026-01-01'),
    fim: new Date('2027-01-01'),
    unidadeId: null,
    canalPedido: null,
    valorMinimoCentavos: 0,
  };
  const ctx = (cliente: PerfilDoCliente | null) => ({ unidadeId: 1, canalPedido: CanalPedido.APP, subtotalCentavos: 10000, agora: new Date('2026-10-17'), cliente });
  const ana: PerfilDoCliente = { nivel: NivelFidelidade.PRATA, idade: 23, consentiuMarketing: true };
  const issue = (c: CampanhaAvaliavel, cli: PerfilDoCliente | null) => erro(() => calcularDescontoDeCampanha(c, ctx(cli)))?.detalhes[0].issue;

  it('por nível mínimo de fidelidade', () => {
    const prata = { ...base, nivelMinimoFidelidade: NivelFidelidade.PRATA };
    expect(calcularDescontoDeCampanha(prata, ctx(ana))).toBe(1000);
    expect(issue(prata, { ...ana, nivel: NivelFidelidade.BRONZE })).toMatch(/nível PRATA/);
  });

  it('por faixa etária, exigindo data de nascimento', () => {
    const jovem = { ...base, idadeMinima: 18, idadeMaxima: 25 };
    expect(calcularDescontoDeCampanha(jovem, ctx(ana))).toBe(1000);
    expect(issue(jovem, { ...ana, idade: 30 })).toMatch(/18 a 25/);
    expect(issue(jovem, { ...ana, idade: null })).toMatch(/data de nascimento/);
  });

  it('exige cliente identificado e consentimento MARKETING', () => {
    const prata = { ...base, nivelMinimoFidelidade: NivelFidelidade.PRATA };
    expect(issue(prata, null)).toMatch(/clientes identificados/);
    expect(issue(prata, { ...ana, consentiuMarketing: false })).toMatch(/MARKETING/);
  });

  it('campanha não segmentada ignora o perfil do cliente', () => {
    expect(calcularDescontoDeCampanha(base, ctx(null))).toBe(1000);
  });
});
