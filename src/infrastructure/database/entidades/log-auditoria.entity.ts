import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AcaoAuditoria, Perfil } from '../../../domain/enums';

/**
 * Trilha de auditoria de ações sensíveis (append-only).
 * Sem FK de propósito: o registro deve sobreviver mesmo se a entidade referenciada mudar.
 * Detalhes nunca contêm senha, token ou dado pessoal em claro (e-mails são mascarados).
 */
@Entity('logs_auditoria')
@Index(['acao', 'criadoEm'])
@Index(['entidade', 'entidadeId'])
@Index(['unidadeId', 'criadoEm'])
export class LogAuditoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'simple-enum', enum: AcaoAuditoria })
  acao: AcaoAuditoria;

  @Column({ length: 40 })
  entidade: string;

  @Column({ type: 'integer', nullable: true })
  entidadeId: number | null;

  /** Autor da ação (nulo em tentativas anônimas, ex.: login com falha). */
  @Column({ type: 'integer', nullable: true })
  usuarioId: number | null;

  @Column({ type: 'simple-enum', enum: Perfil, nullable: true })
  perfil: Perfil | null;

  @Column({ type: 'integer', nullable: true })
  unidadeId: number | null;

  @Column({ type: 'text', nullable: true })
  detalhes: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId: string | null;

  @CreateDateColumn()
  criadoEm: Date;
}
