import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Perfil } from '../../domain/enums';
import { listaDeValores, PaginacaoQuery } from './comum.dto';

const SENHA_FORTE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const MSG_SENHA = 'senha deve ter de 8 a 72 caracteres, com pelo menos uma letra e um número';

export class ConsentimentosCadastroDto {
  @ApiPropertyOptional({ example: true, description: 'Participar do programa de fidelidade (acúmulo e resgate de pontos)' })
  @IsOptional()
  @IsBoolean({ message: 'fidelidade deve ser true ou false' })
  fidelidade?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Receber ofertas e campanhas personalizadas' })
  @IsOptional()
  @IsBoolean({ message: 'marketing deve ser true ou false' })
  marketing?: boolean;
}

export class CadastroClienteDto {
  @ApiProperty({ example: 'Carla Menezes' })
  @IsString()
  @IsNotEmpty({ message: 'nome é obrigatório' })
  @MaxLength(120)
  nome: string;

  @ApiProperty({ example: 'carla.menezes@email.com' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Cuscuz2026', description: MSG_SENHA })
  @IsString()
  @Matches(SENHA_FORTE, { message: MSG_SENHA })
  senha: string;

  @ApiPropertyOptional({ example: '(71) 98888-7777', description: 'Opcional — usado apenas para avisar que o pedido está pronto' })
  @IsOptional()
  @Matches(/^[\d\s()+-]{10,20}$/, { message: 'telefone em formato inválido' })
  telefone?: string;

  @ApiProperty({ example: true, description: 'Aceite obrigatório dos Termos de Uso e da Política de Privacidade (v1.0)' })
  @Equals(true, { message: 'é necessário aceitar os Termos de Uso e a Política de Privacidade' })
  aceiteTermos: boolean;

  @ApiPropertyOptional({ type: ConsentimentosCadastroDto, description: 'Consentimentos opcionais e independentes (padrão: false)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConsentimentosCadastroDto)
  consentimentos?: ConsentimentosCadastroDto;
}

export class CadastroFuncionarioDto {
  @ApiProperty({ example: 'Rafael Lima' })
  @IsString()
  @IsNotEmpty({ message: 'nome é obrigatório' })
  @MaxLength(120)
  nome: string;

  @ApiProperty({ example: 'rafael.lima@raizesdonordeste.com.br' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Baiao2026' })
  @IsString()
  @Matches(SENHA_FORTE, { message: MSG_SENHA })
  senha: string;

  @ApiProperty({ enum: Perfil, example: Perfil.ATENDENTE })
  @IsEnum(Perfil, { message: `perfil deve ser um de: ${listaDeValores(Perfil)}` })
  perfil: Perfil;

  @ApiPropertyOptional({ example: 1, description: 'Obrigatório para ATENDENTE, COZINHA, GERENTE e TOTEM' })
  @IsOptional()
  @IsInt({ message: 'unidadeId deve ser inteiro' })
  @Min(1)
  unidadeId?: number;
}

export class ConsentimentoDto {
  @ApiProperty({ example: true, description: 'true concede, false revoga' })
  @IsBoolean({ message: 'concedido deve ser true ou false' })
  concedido: boolean;
}

export class ListarUsuariosQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ enum: Perfil })
  @IsOptional()
  @IsEnum(Perfil, { message: `perfil deve ser um de: ${listaDeValores(Perfil)}` })
  perfil?: Perfil;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unidadeId?: number;
}

