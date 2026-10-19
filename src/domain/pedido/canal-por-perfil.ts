import { CanalPedido, Perfil } from '../enums';
import { ErroDeDominio, NaturezaErro } from '../erros';

/** Cada perfil só origina pedidos pelos canais que opera (rastreabilidade por canal). */
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
