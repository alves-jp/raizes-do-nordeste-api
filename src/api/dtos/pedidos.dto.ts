import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CanalPedido, FormaPagamento, StatusPedido } from '../../domain/enums';
import { STATUS_OPERACIONAIS } from '../../domain/pedido/maquina-de-status';
import { listaDeValores, PaginacaoQuery } from './comum.dto';

export class ItemPedidoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'produtoId deve ser um número inteiro' })
  @Min(1, { message: 'produtoId deve ser positivo' })
  produtoId: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 20 })
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser maior que zero' })
  @Max(20, { message: 'quantidade máxima por item é 20' })
  quantidade: number;
}

export class CriarPedidoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'unidadeId deve ser um número inteiro' })
  @Min(1)
  unidadeId: number;

  @ApiProperty({
    enum: CanalPedido,
    example: CanalPedido.APP,
    description: 'OBRIGATÓRIO. Canal de origem do pedido. Compatibilidade: CLIENTE → APP/WEB/PICKUP · TOTEM → TOTEM · ATENDENTE/GERENTE → BALCAO',
  })
  @IsNotEmpty({ message: 'canalPedido é obrigatório' })
  @IsEnum(CanalPedido, { message: `canalPedido deve ser um de: ${listaDeValores(CanalPedido)}` })
  canalPedido: CanalPedido;

  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX })
  @IsNotEmpty({ message: 'formaPagamento é obrigatório' })
  @IsEnum(FormaPagamento, { message: `formaPagamento deve ser um de: ${listaDeValores(FormaPagamento)}` })
  formaPagamento: FormaPagamento;

  @ApiProperty({ type: [ItemPedidoDto], example: [{ produtoId: 1, quantidade: 2 }, { produtoId: 9, quantidade: 1 }] })
  @IsArray({ message: 'itens deve ser uma lista' })
  @ArrayMinSize(1, { message: 'o pedido precisa ter ao menos 1 item' })
  @ArrayMaxSize(20, { message: 'o pedido aceita no máximo 20 itens' })
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  itens: ItemPedidoDto[];

  @ApiPropertyOptional({ example: 7, description: 'Atendente/totem: identifica o cliente para pontuar na fidelidade. Cliente logado: ignorado (usa o próprio id).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  clienteId?: number;

  @ApiPropertyOptional({ example: 'APPRAIZ10', description: 'Código de campanha promocional' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  codigoCampanha?: string;

  @ApiPropertyOptional({ example: 50, description: 'Pontos de fidelidade a resgatar (mín. 50; 1 ponto = R$ 0,10; até 30% do pedido)' })
  @IsOptional()
  @IsInt({ message: 'pontosResgate deve ser inteiro' })
  @Min(0)
  pontosResgate?: number;

  @ApiPropertyOptional({ example: 'Tapioca sem queijo, por favor' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  observacao?: string;
}

export class AtualizarStatusDto {
  @ApiProperty({
    enum: STATUS_OPERACIONAIS,
    example: StatusPedido.EM_PREPARO,
    description: 'PAGO → EM_PREPARO (cozinha) → PRONTO (cozinha) → ENTREGUE (atendente). PAGO é definido pelo pagamento; cancelamento tem rota própria.',
  })
  @IsIn(STATUS_OPERACIONAIS, { message: `status deve ser um de: ${STATUS_OPERACIONAIS.join(', ')} (PAGO vem do pagamento; use /cancelamento para cancelar)` })
  status: StatusPedido;
}

export class CancelarPedidoDto {
  @ApiProperty({ example: 'Cliente desistiu da compra' })
  @IsString()
  @IsNotEmpty({ message: 'motivo é obrigatório' })
  @MaxLength(200)
  motivo: string;
}

export class ListarPedidosQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ enum: CanalPedido, description: 'Filtra por canal de origem' })
  @IsOptional()
  @IsEnum(CanalPedido, { message: `canalPedido deve ser um de: ${listaDeValores(CanalPedido)}` })
  canalPedido?: CanalPedido;

  @ApiPropertyOptional({ enum: StatusPedido })
  @IsOptional()
  @IsEnum(StatusPedido, { message: `status deve ser um de: ${listaDeValores(StatusPedido)}` })
  status?: StatusPedido;

  @ApiPropertyOptional({ example: 1, description: 'Somente ADMIN pode consultar outras unidades' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unidadeId?: number;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Data inicial (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'dataInicio deve ser uma data ISO 8601 (ex.: 2026-10-01)' })
  dataInicio?: Date;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59', description: 'Data final (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'dataFim deve ser uma data ISO 8601' })
  dataFim?: Date;
}

export class ResumoPorCanalQuery {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unidadeId?: number;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'dataInicio deve ser uma data ISO 8601' })
  dataInicio?: Date;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'dataFim deve ser uma data ISO 8601' })
  dataFim?: Date;
}

/** Cabeçalho de idempotência aceito em POST /pedidos e POST /pagamentos. */
export const REGEX_IDEMPOTENCIA = /^[\w-]{8,80}$/;
