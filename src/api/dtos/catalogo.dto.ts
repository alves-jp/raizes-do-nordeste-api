import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';
import { CategoriaProduto } from '../../domain/enums';
import { listaDeValores, PaginacaoQuery } from './comum.dto';

export class CriarProdutoDto {
  @ApiProperty({ example: 'Escondidinho de charque' })
  @IsString()
  @IsNotEmpty({ message: 'nome é obrigatório' })
  @MaxLength(120)
  nome: string;

  @ApiPropertyOptional({ example: 'Purê de macaxeira gratinado com charque desfiada.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  descricao?: string;

  @ApiProperty({ enum: CategoriaProduto, example: CategoriaProduto.PRATOS })
  @IsEnum(CategoriaProduto, { message: `categoria deve ser um de: ${listaDeValores(CategoriaProduto)}` })
  categoria: CategoriaProduto;

  @ApiPropertyOptional({ example: false, description: 'Produto regional/sazonal (ex.: itens juninos)' })
  @IsOptional()
  @IsBoolean()
  sazonal?: boolean;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  mesInicio?: number;

  @ApiPropertyOptional({ example: 7, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  mesFim?: number;

  @ApiPropertyOptional({ example: true, description: 'true = só pode ser vendido em unidades com cozinha completa' })
  @IsOptional()
  @IsBoolean()
  exigeCozinhaCompleta?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class AtualizarProdutoDto extends PartialType(CriarProdutoDto) {}

export class ItemCardapioDto {
  @ApiProperty({ example: 24.9, description: 'Preço nesta unidade, em reais (máx. 2 casas decimais)' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'preco deve ser um número com no máximo 2 casas decimais' })
  @IsPositive({ message: 'preco deve ser maior que zero' })
  @Max(9999.99)
  preco: number;

  @ApiPropertyOptional({ example: true, description: 'false pausa o item no cardápio desta unidade' })
  @IsOptional()
  @IsBoolean()
  disponivel?: boolean;

  @ApiPropertyOptional({
    example: 'Versão cearense: acompanha queijo coalho na chapa',
    nullable: true,
    description: 'Variação regional da receita nesta unidade (null remove)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'variacaoRegional deve ter no máximo 200 caracteres' })
  variacaoRegional?: string | null;
}

export class ListarProdutosQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ enum: CategoriaProduto })
  @IsOptional()
  @IsEnum(CategoriaProduto, { message: `categoria deve ser um de: ${listaDeValores(CategoriaProduto)}` })
  categoria?: CategoriaProduto;
}

export class CardapioQuery extends ListarProdutosQuery {
  @ApiPropertyOptional({ example: false, description: 'true lista apenas itens disponíveis agora' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  somenteDisponiveis?: boolean;

  constructor() {
    super();
    this.limit = 50;
  }
}

