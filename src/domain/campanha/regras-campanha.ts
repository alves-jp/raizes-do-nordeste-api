import { CanalPedido, NivelFidelidade } from '../enums';
import { nivelAtende } from '../fidelidade/regras-fidelidade';
import { ErroDeDominio, NaturezaErro } from '../erros';

export interface CampanhaAvaliavel {
  codigo: string;
  ativa: boolean;
  percentualDesconto: number;
  inicio: Date;
  fim: Date;
  unidadeId: number | null;
  canalPedido: CanalPedido | null;
  valorMinimoCentavos: number;
  nivelMinimoFidelidade?: NivelFidelidade | null;
  idadeMinima?: number | null;
  idadeMaxima?: number | null;
}

/** Dados do cliente usados só na avaliação de campanhas (não são persistidos). */
export interface PerfilDoCliente {
  nivel: NivelFidelidade;
  /** Idade calculada na hora a partir da data de nascimento opcional. Nulo se não informada. */
  idade: number | null;
  /** Segmentação é perfilamento para marketing: exige consentimento MARKETING vigente. */
  consentiuMarketing: boolean;
}

export const campanhaEhSegmentada = (c: CampanhaAvaliavel) =>
  c.nivelMinimoFidelidade != null || c.idadeMinima != null || c.idadeMaxima != null;

export interface ContextoDoPedido {
  unidadeId: number;
  canalPedido: CanalPedido;
  subtotalCentavos: number;
  agora: Date;
  cliente?: PerfilDoCliente | null;
}

/**
 * Campanha por código. Pode restringir unidade, canal e valor mínimo, e vale uma por pedido.
 * Campanhas segmentadas por nível ou idade exigem cliente identificado e consentimento MARKETING.
 */
export function calcularDescontoDeCampanha(campanha: CampanhaAvaliavel, ctx: ContextoDoPedido): number {
  const rejeitar = (issue: string) =>
    new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'CAMPANHA_NAO_APLICAVEL',
      `A campanha ${campanha.codigo} não pode ser aplicada a este pedido.`,
      [{ field: 'codigoCampanha', issue }],
    );

  if (!campanha.ativa) throw rejeitar('Campanha inativa.');
  if (ctx.agora < campanha.inicio || ctx.agora > campanha.fim) throw rejeitar('Campanha fora do período de vigência.');
  if (campanha.unidadeId != null && campanha.unidadeId !== ctx.unidadeId) {
    throw rejeitar(`Campanha válida apenas na unidade ${campanha.unidadeId}.`);
  }
  if (campanha.canalPedido != null && campanha.canalPedido !== ctx.canalPedido) {
    throw rejeitar(`Campanha válida apenas no canal ${campanha.canalPedido}.`);
  }
  if (ctx.subtotalCentavos < campanha.valorMinimoCentavos) {
    throw rejeitar(`Valor mínimo do pedido: R$ ${(campanha.valorMinimoCentavos / 100).toFixed(2)}.`);
  }
  if (campanhaEhSegmentada(campanha)) validarSegmentacao(campanha, ctx.cliente ?? null, rejeitar);
  return Math.floor((ctx.subtotalCentavos * campanha.percentualDesconto) / 100);
}

function validarSegmentacao(campanha: CampanhaAvaliavel, cliente: PerfilDoCliente | null, rejeitar: (issue: string) => ErroDeDominio): void {
  if (!cliente) throw rejeitar('Campanha exclusiva para clientes identificados.');
  if (!cliente.consentiuMarketing) {
    throw rejeitar('Campanha segmentada exige consentimento MARKETING (PUT /usuarios/me/consentimentos/MARKETING).');
  }
  if (campanha.nivelMinimoFidelidade && !nivelAtende(cliente.nivel, campanha.nivelMinimoFidelidade)) {
    throw rejeitar(`Campanha exclusiva para nível ${campanha.nivelMinimoFidelidade} ou superior (nível atual: ${cliente.nivel}).`);
  }
  if (campanha.idadeMinima != null || campanha.idadeMaxima != null) {
    if (cliente.idade == null) throw rejeitar('Campanha por faixa etária: informe a data de nascimento (opcional) no seu perfil.');
    const min = campanha.idadeMinima ?? 0;
    const max = campanha.idadeMaxima ?? 200;
    if (cliente.idade < min || cliente.idade > max) throw rejeitar(`Campanha válida para a faixa de ${min} a ${max} anos.`);
  }
}
