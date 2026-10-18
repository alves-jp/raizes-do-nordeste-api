import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TipoMovimentacaoEstoque } from '../../domain/enums';
import { listaDeValores, PaginacaoQuery } from './comum.dto';

export class MovimentacaoEstoqueDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'unidadeId deve ser inteiro' })
  @Min(1)
  unidadeId: number;

  @ApiProperty({ example: 6 })
  @IsInt({ message: 'produtoId deve ser inteiro' })
  @Min(1)
  produtoId: number;

  @ApiProperty({ enum: [TipoMovimentacaoEstoque.ENTRADA, TipoMovimentacaoEstoque.SAIDA], example: TipoMovimentacaoEstoque.ENTRADA })
  @IsIn([TipoMovimentacaoEstoque.ENTRADA, TipoMovimentacaoEstoque.SAIDA], { message: 'tipo deve ser ENTRADA ou SAIDA' })
  tipo: TipoMovimentacaoEstoque.ENTRADA | TipoMovimentacaoEstoque.SAIDA;

  @ApiProperty({ example: 20, minimum: 1, maximum: 10000 })
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser maior que zero' })
  @Max(10000)
  quantidade: number;

  @ApiPropertyOptional({ example: 'Recebimento do fornecedor — NF 4512', description: 'Obrigatório para SAIDA' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

export class SaldoEstoqueQuery extends PaginacaoQuery {
  @ApiProperty({ example: 1, description: 'Unidade a consultar' })
  @Type(() => Number)
  @IsInt({ message: 'unidadeId é obrigatório e deve ser inteiro' })
  @Min(1)
  unidadeId: number;

  @ApiPropertyOptional({ example: false, description: 'true lista só itens no estoque mínimo ou abaixo' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  somenteBaixo?: boolean;
}

export class MovimentacoesQuery extends PaginacaoQuery {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'unidadeId é obrigatório e deve ser inteiro' })
  @Min(1)
  unidadeId: number;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  produtoId?: number;

  @ApiPropertyOptional({ enum: TipoMovimentacaoEstoque })
  @IsOptional()
  @IsIn(Object.values(TipoMovimentacaoEstoque), { message: `tipo deve ser um de: ${listaDeValores(TipoMovimentacaoEstoque)}` })
  tipo?: TipoMovimentacaoEstoque;
}
