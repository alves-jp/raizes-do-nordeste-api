import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../../application/auth/auth.service';
import { ApiErros } from '../documentacao/swagger';
import { EXEMPLO_LOGIN, LoginDto } from '../dtos/auth.dto';
import { Publico } from '../seguranca/decoradores';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Publico()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Autenticar e obter token JWT',
    description: 'Retorna um access token (Bearer, validade de 1h). Após 5 falhas seguidas o e-mail fica bloqueado por 15 minutos (429).',
  })
  @ApiOkResponse({ description: 'Autenticado', schema: { example: EXEMPLO_LOGIN } })
  @ApiErros(401, 422, 429)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.senha);
  }
}
