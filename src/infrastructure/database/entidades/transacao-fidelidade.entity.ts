import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoTransacaoFidelidade } from '../../../domain/enums';
import { Pedido } from './pedido.entity';
import { Usuario } from './usuario.entity';

/** Extrato de pontos (ledger). O saldo é a soma das transações. */
@Entity('transacoes_fidelidade')
@Index(['clienteId', 'criadoEm'])
export class TransacaoFidelidade {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  clienteId: number;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Usuario;

  @Column({ type: 'integer', nullable: true })
  pedidoId: number | null;

  @ManyToOne(() => Pedido, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pedido_id' })
  pedido?: Pedido | null;

  @Column({ type: 'simple-enum', enum: TipoTransacaoFidelidade })
  tipo: TipoTransacaoFidelidade;

  /** Positivo credita, negativo debita. */
  @Column({ type: 'integer' })
  pontos: number;

  @Column({ length: 160 })
  descricao: string;

  @CreateDateColumn()
  criadoEm: Date;
}
