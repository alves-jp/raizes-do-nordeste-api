import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Perfil } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro } from '../../domain/erros';
import { AuthService } from '../../application/auth/auth.service';
import { CHAVE_PERFIS, CHAVE_PUBLICO } from './decoradores';

/** Guard global de autenticação JWT e autorização por perfil. O escopo fica na aplicação. */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const alvos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, alvos)) return true;

    const requisicao = contexto.switchToHttp().getRequest();
    const cabecalho: string | undefined = requisicao.headers.authorization;
    const [tipo, token] = cabecalho?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new ErroDeDominio(NaturezaErro.NAO_AUTENTICADO, 'TOKEN_AUSENTE', 'Envie o token de acesso no header Authorization: Bearer <token>.');
    }
    requisicao.ator = await this.auth.autenticar(token);

    const perfis = this.reflector.getAllAndOverride<Perfil[] | undefined>(CHAVE_PERFIS, alvos);
    if (perfis?.length && !perfis.includes(requisicao.ator.perfil)) {
      throw new ErroDeDominio(NaturezaErro.PROIBIDO, 'ACESSO_NEGADO', 'Seu perfil não tem permissão para esta operação.', [
        { field: 'perfil', issue: `Perfis autorizados: ${perfis.join(', ')}` },
      ]);
    }
    return true;
  }
}
