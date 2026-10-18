import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Perfil } from '../../../domain/enums';
import { Unidade } from './unidade.entity';

/**
 * Usuário do sistema (clientes, funcionários e contas de totem).
 * LGPD — minimização: coletamos apenas nome, e-mail e (opcionalmente) telefone.
 * CPF, endereço e data de nascimento NÃO são necessários para a finalidade e não são coletados.
 */
@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  nome: string;

  @Index({ unique: true })
  @Column({ length: 160 })
  email: string;

  /** Hash bcrypt (custo 10). A senha em texto nunca é persistida nem devolvida. */
  @Column({ length: 100 })
  senhaHash: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @Column({ type: 'simple-enum', enum: Perfil })
  perfil: Perfil;

  /** Obrigatório para ATENDENTE, COZINHA, GERENTE e TOTEM; nulo para CLIENTE e ADMIN. */
  @Column({ type: 'integer', nullable: true })
  unidadeId: number | null;

  @ManyToOne(() => Unidade, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidade_id' })
  unidade?: Unidade | null;

  @Column({ default: true })
  ativo: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  versaoTermosAceita: string | null;

  @Column({ type: 'datetime', nullable: true })
  termosAceitosEm: Date | null;

  /** Preenchido quando o titular solicita a eliminação dos dados (anonimização). */
  @Column({ type: 'datetime', nullable: true })
  anonimizadoEm: Date | null;

  @CreateDateColumn()
  criadoEm: Date;

  @UpdateDateColumn()
  atualizadoEm: Date;
}
