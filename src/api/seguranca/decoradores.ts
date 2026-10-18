import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Perfil } from '../../domain/enums';
import { Ator } from '../../application/comum/ator';

export const CHAVE_PUBLICO = 'rota-publica';
export const CHAVE_PERFIS = 'perfis-permitidos';

/** Rota acessível sem token. Por padrão, TODAS as rotas exigem autenticação. */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

/** Restringe a rota aos perfis informados (RBAC). */
export const Perfis = (...perfis: Perfil[]) => SetMetadata(CHAVE_PERFIS, perfis);

/** Injeta o usuário autenticado (extraído e validado do JWT). */
export const AtorAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): Ator => ctx.switchToHttp().getRequest().ator);
