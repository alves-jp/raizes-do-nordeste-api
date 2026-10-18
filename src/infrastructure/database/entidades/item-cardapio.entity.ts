import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Produto } from './produto.entity';
import { Unidade } from './unidade.entity';

/**
 * Cardápio por unidade: quais produtos do catálogo cada loja vende e a que preço.
 * Permite cardápios diferentes entre regiões e preços locais.
 */
@Entity('itens_cardapio')
@Unique('UQ_cardapio_unidade_produto', ['unidadeId', 'produtoId'])
@Check('CHK_cardapio_preco', 'preco_centavos > 0')
export class ItemCardapio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  unidadeId: number;

  @ManyToOne(() => Unidade, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unidade_id' })
  unidade?: Unidade;

  @Column()
  produtoId: number;

  @ManyToOne(() => Produto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'produto_id' })
  produto?: Produto;

  @Column({ type: 'integer' })
  precoCentavos: number;

  /** Permite ao gerente pausar um item sem removê-lo do cardápio. */
  @Column({ default: true })
  disponivel: boolean;

  @UpdateDateColumn()
  atualizadoEm: Date;
}
