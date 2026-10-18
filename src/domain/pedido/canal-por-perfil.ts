import { CanalPedido, Perfil } from '../enums';
import { ErroDeDominio, NaturezaErro } from '../erros';

/**
 * Multicanalidade: cada perfil só pode originar pedidos pelos canais que opera.
 * Isso garante que o canalPedido registrado reflita a origem real do pedido
 * (rastreabilidade por canal) e não um valor escolhido livremente pelo cliente.
 */
export const CANAIS_POR_PERFIL: Record<Perfil, CanalPedido[]> = {
  [Perfil.CLIENTE]: [CanalPedido.APP, CanalPedido.WEB, CanalPedido.PICKUP],
  [Perfil.TOTEM]: [CanalPedido.TOTEM],
  [Perfil.ATENDENTE]: [CanalPedido.BALCAO],
  [Perfil.GERENTE]: [CanalPedido.BALCAO],
  [Perfil.ADMIN]: [],
  [Perfil.COZINHA]: [],
};

export function validarCanalDoPerfil(canal: CanalPedido, perfil: Perfil): void {
  const permitidos = CANAIS_POR_PERFIL[perfil];
  if (!permitidos.includes(canal)) {
    throw new ErroDeDominio(
      NaturezaErro.REGRA_DE_NEGOCIO,
      'CANAL_INCOMPATIVEL_COM_PERFIL',
      `O perfil ${perfil} não pode registrar pedidos pelo canal ${canal}.`,
      [{ field: 'canalPedido', issue: `Canais permitidos para ${perfil}: ${permitidos.join(', ') || 'nenhum'}` }],
    );
  }
}
