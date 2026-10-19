import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalPedido, NivelFidelidade } from '../../../domain/enums';
import { Unidade } from './unidade.entity';

/** Campanha promocional definida pela matriz e aplicada por código no pedido. */
@Entity('campanhas')
@Check('CHK_campanha_percentual', 'percentual_desconto BETWEEN 1 AND 50')
@Check('CHK_campanha_periodo', 'fim > inicio')
export class Campanha {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 30 })
  codigo: string;

  @Column({ length: 200 })
  descricao: string;

  @Column({ type: 'integer' })
  percentualDesconto: number;

  @Column({ type: 'datetime' })
  inicio: Date;

  @Column({ type: 'datetime' })
  fim: Date;

  /** Nulo = vale para toda a rede. */
  @Column({ type: 'integer', nullable: true })
  unidadeId: number | null;

  @ManyToOne(() => Unidade, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unidade_id' })
  unidade?: Unidade | null;

  /** Nulo = vale para todos os canais. */
  @Column({ type: 'simple-enum', enum: CanalPedido, nullable: true })
  canalPedido: CanalPedido | null;

  @Column({ type: 'integer', default: 0 })
  valorMinimoCentavos: number;

  /** Segmentação: nível mínimo de fidelidade do cliente (nulo = sem restrição). */
  @Column({ type: 'simple-enum', enum: NivelFidelidade, nullable: true })
  nivelMinimoFidelidade: NivelFidelidade | null;

  /** Segmentação por faixa etária (nulo = sem restrição). Exige consentimento MARKETING. */
  @Column({ type: 'integer', nullable: true })
  idadeMinima: number | null;

  @Column({ type: 'integer', nullable: true })
  idadeMaxima: number | null;

  @Column({ default: true })
  ativa: boolean;

  @CreateDateColumn()
  criadoEm: Date;
}
