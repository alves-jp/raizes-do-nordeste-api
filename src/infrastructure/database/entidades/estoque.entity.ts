import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Produto } from './produto.entity';
import { Unidade } from './unidade.entity';

/** Saldo de estoque por produto e unidade. */
@Entity('estoques')
@Unique('UQ_estoque_unidade_produto', ['unidadeId', 'produtoId'])
@Check('CHK_estoque_nao_negativo', 'quantidade >= 0')
export class Estoque {
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

  @Column({ type: 'integer', default: 0 })
  quantidade: number;

  /** Abaixo deste valor o item aparece como "estoque baixo" para o gerente. */
  @Column({ type: 'integer', default: 5 })
  estoqueMinimo: number;

  @UpdateDateColumn()
  atualizadoEm: Date;
}
