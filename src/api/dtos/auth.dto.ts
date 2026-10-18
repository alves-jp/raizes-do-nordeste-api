import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana.souza@email.com' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Raizes@2026' })
  @IsString({ message: 'senha deve ser um texto' })
  @IsNotEmpty({ message: 'senha é obrigatória' })
  @MaxLength(72)
  senha: string;
}

export const EXEMPLO_LOGIN = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  tokenType: 'Bearer',
  expiresIn: 3600,
  usuario: { id: 7, nome: 'Ana Souza', perfil: 'CLIENTE', unidadeId: null },
};
