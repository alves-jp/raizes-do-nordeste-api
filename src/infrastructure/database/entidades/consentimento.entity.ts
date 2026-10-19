import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FinalidadeConsentimento } from '../../../domain/enums';
import { Usuario } from './usuario.entity';

/** Consentimento append-only (LGPD, art. 8º). O vigente é o registro mais recente. */
@Entity('consentimentos')
@Index(['usuarioId', 'finalidade', 'registradoEm'])
export class Consentimento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;

  @Column({ type: 'simple-enum', enum: FinalidadeConsentimento })
  finalidade: FinalidadeConsentimento;

  @Column()
  concedido: boolean;

  /** Versão do termo apresentado ao titular no momento da decisão. */
  @Column({ length: 10 })
  versaoTermo: string;

  /** Onde a decisão foi tomada (ex.: CADASTRO, APP_PREFERENCIAS). */
  @Column({ length: 40 })
  origem: string;

  @CreateDateColumn()
  registradoEm: Date;
}
