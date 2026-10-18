import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoUnidade } from '../../../domain/enums';

/** Unidade (loja) da rede. A matriz é representada pelo perfil ADMIN, não por uma loja. */
@Entity('unidades')
export class Unidade {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  nome: string;

  @Column({ length: 80 })
  cidade: string;

  @Column({ length: 2 })
  uf: string;

  @Column({ type: 'simple-enum', enum: TipoUnidade })
  tipo: TipoUnidade;

  /** Horário de funcionamento (informativo), ex.: "07:00-22:00". */
  @Column({ type: 'varchar', length: 20, nullable: true })
  horarioFuncionamento: string | null;

  @Column({ default: true })
  ativa: boolean;

  @CreateDateColumn()
  criadoEm: Date;
}
