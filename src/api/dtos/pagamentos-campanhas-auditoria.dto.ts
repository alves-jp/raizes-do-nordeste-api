import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AcaoAuditoria, CanalPedido, FormaPagamento, NivelFidelidade } from '../../domain/enums';
import { TOKENS_DE_TESTE } from '../../infrastructure/pagamento/gateway-pagamento-mock';
import { listaDeValores, PaginacaoQuery } from './comum.dto';

export class SolicitarPagamentoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'pedidoId deve ser inteiro' })
  @Min(1)
  pedidoId: number;

  @ApiPropertyOptional({ enum: FormaPagamento, description: 'Opcional: troca a forma escolhida no pedido (ex.: após recusa no cartão, pagar com PIX)' })
  @IsOptional()
  @IsEnum(FormaPagamento, { message: `formaPagamento deve ser um de: ${listaDeValores(FormaPagamento)}` })
  formaPagamento?: FormaPagamento;

  @ApiPropertyOptional({
    example: TOKENS_DE_TESTE.aprovado,
    enum: Object.values(TOKENS_DE_TESTE),
    description:
      'Token gerado pelo SDK do provedor no App/Totem/Web (o back-end nunca recebe dados de cartão). ' +
      'No sandbox define o resultado: tok_aprovado (padrão), tok_recusado_saldo, tok_recusado_antifraude, tok_gateway_instavel, tok_gateway_indisponivel.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^tok_[a-z_]{3,40}$/, { message: 'tokenPagamento em formato inválido (esperado tok_...)' })
  tokenPagamento?: string;
}

export class CriarCampanhaDto {
  @ApiProperty({ example: 'SAOJOAO15', description: 'Código que o cliente digita (letras e números, será convertido para maiúsculas)' })
  @Matches(/^[A-Za-z0-9]{4,30}$/, { message: 'codigo deve ter de 4 a 30 letras ou números' })
  codigo: string;

  @ApiProperty({ example: '15% de desconto no arraiá da rede' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  descricao: string;

  @ApiProperty({ example: 15, minimum: 1, maximum: 50 })
  @IsInt({ message: 'percentualDesconto deve ser inteiro' })
  @Min(1)
  @Max(50, { message: 'percentualDesconto máximo é 50' })
  percentualDesconto: number;

  @ApiProperty({ example: '2026-11-01T00:00:00-03:00' })
  @Type(() => Date)
  @IsDate({ message: 'inicio deve ser uma data ISO 8601' })
  inicio: Date;

  @ApiProperty({ example: '2026-12-31T23:59:59-03:00' })
  @Type(() => Date)
  @IsDate({ message: 'fim deve ser uma data ISO 8601' })
  fim: Date;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Restringe a uma unidade (nulo = rede toda)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadeId?: number;

  @ApiPropertyOptional({ enum: CanalPedido, nullable: true, description: 'Restringe a um canal (nulo = todos)' })
  @IsOptional()
  @IsEnum(CanalPedido, { message: `canalPedido deve ser um de: ${listaDeValores(CanalPedido)}` })
  canalPedido?: CanalPedido;

  @ApiPropertyOptional({ example: 30, description: 'Valor mínimo do pedido em reais' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorMinimo?: number;

  @ApiPropertyOptional({ enum: NivelFidelidade, description: 'Segmentação: nível mínimo de fidelidade (exige consentimento MARKETING do cliente)' })
  @IsOptional()
  @IsEnum(NivelFidelidade, { message: `nivelMinimoFidelidade deve ser um de: ${listaDeValores(NivelFidelidade)}` })
  nivelMinimoFidelidade?: NivelFidelidade;

  @ApiPropertyOptional({ example: 18, minimum: 18, description: 'Segmentação por faixa etária (maiores de idade)' })
  @IsOptional()
  @IsInt({ message: 'idadeMinima deve ser inteiro' })
  @Max(120)
  idadeMinima?: number;

  @ApiPropertyOptional({ example: 25, maximum: 120 })
  @IsOptional()
  @IsInt({ message: 'idadeMaxima deve ser inteiro' })
  @Max(120)
  idadeMaxima?: number;
}

export class ListarCampanhasQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unidadeId?: number;

  @ApiPropertyOptional({ enum: CanalPedido })
  @IsOptional()
  @IsEnum(CanalPedido, { message: `canalPedido deve ser um de: ${listaDeValores(CanalPedido)}` })
  canalPedido?: CanalPedido;
}

export class ListarAuditoriaQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ enum: AcaoAuditoria })
  @IsOptional()
  @IsIn(Object.values(AcaoAuditoria), { message: 'acao inválida' })
  acao?: AcaoAuditoria;

  @ApiPropertyOptional({ example: 'Pedido' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entidade?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entidadeId?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usuarioId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unidadeId?: number;
}
