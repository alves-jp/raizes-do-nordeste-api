import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Pedido } from './pedido.entity';
import { Produto } from './produto.entity';

/** Item do pedido com nome e preço congelados no momento da compra. */
@Entity('itens_pedido')
@Check('CHK_item_quantidade', 'quantidade > 0')
export class ItemPedido {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pedidoId: number;

  @ManyToOne(() => Pedido, (pedido) => pedido.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  pedido?: Pedido;

  @Column()
  produtoId: number;

  @ManyToOne(() => Produto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'produto_id' })
  produto?: Produto;

  @Column({ length: 120 })
  nomeProduto: string;

  @Column({ type: 'integer' })
  quantidade: number;

  @Column({ type: 'integer' })
  precoUnitarioCentavos: number;

  @Column({ type: 'integer' })
  subtotalCentavos: number;
}
