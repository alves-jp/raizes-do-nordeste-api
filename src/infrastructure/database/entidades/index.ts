import { Campanha } from './campanha.entity';
import { Consentimento } from './consentimento.entity';
import { Estoque } from './estoque.entity';
import { ItemCardapio } from './item-cardapio.entity';
import { ItemPedido } from './item-pedido.entity';
import { LogAuditoria } from './log-auditoria.entity';
import { MovimentacaoEstoque } from './movimentacao-estoque.entity';
import { Pagamento } from './pagamento.entity';
import { Pedido } from './pedido.entity';
import { Produto } from './produto.entity';
import { TransacaoFidelidade } from './transacao-fidelidade.entity';
import { Unidade } from './unidade.entity';
import { Usuario } from './usuario.entity';

export {
  Campanha,
  Consentimento,
  Estoque,
  ItemCardapio,
  ItemPedido,
  LogAuditoria,
  MovimentacaoEstoque,
  Pagamento,
  Pedido,
  Produto,
  TransacaoFidelidade,
  Unidade,
  Usuario,
};

export const ENTIDADES = [
  Unidade,
  Usuario,
  Consentimento,
  Produto,
  ItemCardapio,
  Estoque,
  MovimentacaoEstoque,
  Campanha,
  Pedido,
  ItemPedido,
  Pagamento,
  TransacaoFidelidade,
  LogAuditoria,
];
