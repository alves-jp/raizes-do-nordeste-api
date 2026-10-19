import { Perfil, StatusPedido } from '../enums';
import { ErroDeDominio, NaturezaErro } from '../erros';

/**
 * Máquina de estados do pedido. O fluxo normal é AGUARDANDO_PAGAMENTO, PAGO,
 * EM_PREPARO, PRONTO e ENTREGUE. PAGAMENTO_RECUSADO pode ser retentado e CANCELADO
 * encerra o pedido. PAGO só vem do pagamento, e ENTREGUE e CANCELADO são finais.
 */

/** Transições operacionais (feitas pela equipe da unidade via PATCH /pedidos/{id}/status). */
const TRANSICOES_OPERACIONAIS: Record<string, { para: StatusPedido; perfis: Perfil[] }[]> = {
  [StatusPedido.PAGO]: [{ para: StatusPedido.EM_PREPARO, perfis: [Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN] }],
  [StatusPedido.EM_PREPARO]: [{ para: StatusPedido.PRONTO, perfis: [Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN] }],
  [StatusPedido.PRONTO]: [{ para: StatusPedido.ENTREGUE, perfis: [Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN] }],
};

export const STATUS_OPERACIONAIS = [StatusPedido.EM_PREPARO, StatusPedido.PRONTO, StatusPedido.ENTREGUE];

export const STATUS_PAGAVEIS = [StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.PAGAMENTO_RECUSADO];

export const STATUS_FINAIS = [StatusPedido.ENTREGUE, StatusPedido.CANCELADO];

/** Lança CONFLITO para transição inválida e PROIBIDO para perfil sem permissão. */
export function validarTransicaoOperacional(atual: StatusPedido, desejado: StatusPedido, perfil: Perfil): void {
  const possiveis = TRANSICOES_OPERACIONAIS[atual] ?? [];
  const transicao = possiveis.find((t) => t.para === desejado);
  if (!transicao) {
    const permitidos = possiveis.map((t) => t.para).join(', ') || 'nenhuma';
    throw new ErroDeDominio(
      NaturezaErro.CONFLITO,
      'TRANSICAO_DE_STATUS_INVALIDA',
      `Não é possível mudar o pedido de ${atual} para ${desejado}.`,
      [{ field: 'status', issue: `Transições permitidas a partir de ${atual}: ${permitidos}` }],
    );
  }
  if (!transicao.perfis.includes(perfil)) {
    throw new ErroDeDominio(
      NaturezaErro.PROIBIDO,
      'ACESSO_NEGADO',
      `O perfil ${perfil} não pode mudar o pedido para ${desejado}.`,
      [{ field: 'status', issue: `Perfis autorizados: ${transicao.perfis.join(', ')}` }],
    );
  }
}

/** CLIENTE e TOTEM cancelam antes do pagamento, ATENDENTE até PAGO e GERENTE/ADMIN até PRONTO. */
export function validarCancelamento(atual: StatusPedido, perfil: Perfil): void {
  if (STATUS_FINAIS.includes(atual)) {
    throw new ErroDeDominio(
      NaturezaErro.CONFLITO,
      'PEDIDO_NAO_CANCELAVEL',
      `Pedido com status ${atual} não pode ser cancelado.`,
    );
  }
  const limitePorPerfil: Record<Perfil, StatusPedido[]> = {
    [Perfil.CLIENTE]: STATUS_PAGAVEIS,
    [Perfil.TOTEM]: STATUS_PAGAVEIS,
    [Perfil.ATENDENTE]: [...STATUS_PAGAVEIS, StatusPedido.PAGO],
    [Perfil.COZINHA]: [],
    [Perfil.GERENTE]: [...STATUS_PAGAVEIS, StatusPedido.PAGO, StatusPedido.EM_PREPARO, StatusPedido.PRONTO],
    [Perfil.ADMIN]: [...STATUS_PAGAVEIS, StatusPedido.PAGO, StatusPedido.EM_PREPARO, StatusPedido.PRONTO],
  };
  if (!limitePorPerfil[perfil].includes(atual)) {
    throw new ErroDeDominio(
      NaturezaErro.CONFLITO,
      'PEDIDO_NAO_CANCELAVEL',
      `O perfil ${perfil} não pode cancelar um pedido com status ${atual}.`,
    );
  }
}
