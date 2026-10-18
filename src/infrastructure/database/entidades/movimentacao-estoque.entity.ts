import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoMovimentacaoEstoque } from '../../../domain/enums';
import { Pedido } from './pedido.entity';
import { Produto } from './produto.entity';
import { Unidade } from './unidade.entity';
import { Usuario } from './usuario.entity';

/** Histórico imutável de entradas e saídas de estoque (rastreabilidade). */
@Entity('movimentacoes_estoque')
@Index(['unidadeId', 'criadoEm'])
@Check('CHK_movimentacao_quantidade_positiva', 'quantidade > 0')
export class MovimentacaoEstoque {
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

  @Column({ type: 'simple-enum', enum: TipoMovimentacaoEstoque })
  tipo: TipoMovimentacaoEstoque;

  /** Sempre positiva; o sentido (entrada/saída) vem do tipo. */
  @Column({ type: 'integer' })
  quantidade: number;

  @Column({ type: 'integer' })
  saldoApos: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo: string | null;

  @Column({ type: 'integer', nullable: true })
  pedidoId: number | null;

  @ManyToOne(() => Pedido, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pedido_id' })
  pedido?: Pedido | null;

  @Column({ type: 'integer', nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario | null;

  @CreateDateColumn()
  criadoEm: Date;
}
