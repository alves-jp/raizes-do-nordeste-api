import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CategoriaProduto } from '../../../domain/enums';

/** Produto do catálogo central da rede (definido pela matriz). Preço é por unidade (ItemCardapio). */
@Entity('produtos')
@Check('CHK_produto_sazonalidade', `sazonal = 0 OR mes_inicio BETWEEN 1 AND 12 AND mes_fim BETWEEN 1 AND 12`)
export class Produto {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 120 })
  nome: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  descricao: string | null;

  @Column({ type: 'simple-enum', enum: CategoriaProduto })
  categoria: CategoriaProduto;

  /** Produto regional/sazonal (ex.: pamonha no São João). */
  @Column({ default: false })
  sazonal: boolean;

  @Column({ type: 'integer', nullable: true })
  mesInicio: number | null;

  @Column({ type: 'integer', nullable: true })
  mesFim: number | null;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  criadoEm: Date;

  @UpdateDateColumn()
  atualizadoEm: Date;
}
