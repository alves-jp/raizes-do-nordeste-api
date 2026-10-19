import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { FormaPagamento, StatusPagamento } from '../../../domain/enums';
import { Pedido } from './pedido.entity';

/** Tentativa de pagamento. Um pedido pode ter várias. */
@Entity('pagamentos')
@Index(['pedidoId', 'criadoEm'])
export class Pagamento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pedidoId: number;

  @ManyToOne(() => Pedido, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id' })
  pedido?: Pedido;

  @Column({ type: 'integer' })
  valorCentavos: number;

  @Column({ type: 'simple-enum', enum: FormaPagamento })
  forma: FormaPagamento;

  @Column({ type: 'simple-enum', enum: StatusPagamento, default: StatusPagamento.PENDENTE })
  status: StatusPagamento;

  /** Identificador da transação no gateway (ex.: "mock_tx_..."). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  transacaoExternaId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  codigoRetorno: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  mensagemRetorno: string | null;

  /** Payload devolvido pelo gateway (JSON), guardado para conciliação. Nunca contém dados de cartão. */
  @Column({ type: 'text', nullable: true })
  respostaGateway: string | null;

  /** Header Idempotency-Key: repetir a mesma chave devolve este pagamento sem cobrar de novo. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  chaveIdempotencia: string | null;

  @CreateDateColumn()
  criadoEm: Date;

  @UpdateDateColumn()
  atualizadoEm: Date;
}
