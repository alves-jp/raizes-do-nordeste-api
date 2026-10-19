import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Agrupamento } from '../../application/relatorios/relatorios.service';

export class PeriodoRelatorioQuery {
  @ApiPropertyOptional({ example: '2026-10-01T00:00:00-03:00', description: 'Início do período (padrão: 1º dia do mês corrente)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'de deve ser uma data ISO 8601' })
  de?: Date;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59-03:00', description: 'Fim do período (padrão: agora)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'ate deve ser uma data ISO 8601' })
  ate?: Date;

  @ApiPropertyOptional({ example: 1, description: 'Somente ADMIN escolhe a unidade; GERENTE é sempre restrito à própria' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'unidadeId deve ser inteiro' })
  @Min(1)
  unidadeId?: number;
}

export class RelatorioVendasQuery extends PeriodoRelatorioQuery {
  @ApiPropertyOptional({ enum: ['UNIDADE', 'REGIAO'], default: 'UNIDADE' })
  @IsOptional()
  @IsIn(['UNIDADE', 'REGIAO'], { message: 'agruparPor deve ser UNIDADE ou REGIAO' })
  agruparPor: Agrupamento = 'UNIDADE';
}

export class ProdutosMaisVendidosQuery extends PeriodoRelatorioQuery {
  @ApiPropertyOptional({ example: 10, default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite deve ser inteiro' })
  @Min(1, { message: 'limite deve ser no mínimo 1' })
  @Max(50, { message: 'limite deve ser no máximo 50' })
  limite: number = 10;
}
