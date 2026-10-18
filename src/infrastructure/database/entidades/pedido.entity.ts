import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { CanalPedido, FormaPagamento, StatusPedido } from '../../../domain/enums';
import { Campanha } from './campanha.entity';
import { ItemPedido } from './item-pedido.entity';
import { Unidade } from './unidade.entity';
import { Usuario } from './usuario.entity';

@Entity('pedidos')
@Index(['unidadeId', 'status'])
@Index(['canalPedido', 'criadoEm'])
@Index(['clienteId', 'criadoEm'])
@Unique('UQ_pedido_idempotencia', ['criadoPorId', 'chaveIdempotencia'])
@Check('CHK_pedido_total', 'total_centavos >= 0 AND total_centavos = subtotal_centavos - desconto_campanha_centavos - desconto_pontos_centavos')
export class Pedido {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  unidadeId: number;

  @ManyToOne(() => Unidade, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidade_id' })
  unidade?: Unidade;

  /** Cliente identificado (para fidelidade). Nulo em pedidos anônimos de balcão/totem. */
  @Column({ type: 'integer', nullable: true })
  clienteId: number | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Usuario | null;

  /** Quem registrou o pedido (o próprio cliente, o atendente ou a conta do totem). */
  @Column()
  criadoPorId: number;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'criado_por_id' })
  criadoPor?: Usuario;

  @Column({ type: 'simple-enum', enum: CanalPedido })
  canalPedido: CanalPedido;

  @Column({ type: 'simple-enum', enum: StatusPedido, default: StatusPedido.AGUARDANDO_PAGAMENTO })
  status: StatusPedido;

  @Column({ type: 'simple-enum', enum: FormaPagamento })
  formaPagamento: FormaPagamento;

  @Column({ type: 'integer' })
  subtotalCentavos: number;

  @Column({ type: 'integer', default: 0 })
  descontoCampanhaCentavos: number;

  @Column({ type: 'integer', default: 0 })
  descontoPontosCentavos: number;

  @Column({ type: 'integer' })
  totalCentavos: number;

  @Column({ type: 'integer', nullable: true })
  campanhaId: number | null;

  @ManyToOne(() => Campanha, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campanha_id' })
  campanha?: Campanha | null;

  @Column({ type: 'integer', default: 0 })
  pontosResgatados: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  observacao: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivoCancelamento: string | null;

  /** Header Idempotency-Key enviado na criação (evita pedido duplicado por duplo toque/reenvio). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  chaveIdempotencia: string | null;

  @OneToMany(() => ItemPedido, (item) => item.pedido, { cascade: ['insert'] })
  itens: ItemPedido[];

  @CreateDateColumn()
  criadoEm: Date;

  @UpdateDateColumn()
  atualizadoEm: Date;
}
