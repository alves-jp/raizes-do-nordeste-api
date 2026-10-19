import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AcaoAuditoria, Perfil } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro } from '../../domain/erros';
import { mascararEmail } from '../../domain/lgpd/mascaramento';
import { ambiente } from '../../infrastructure/config/ambiente';
import { Usuario } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { HasherDeSenha } from '../../infrastructure/seguranca/hasher-senha';
import { LimitadorDeLogin } from '../../infrastructure/seguranca/limitador-de-login';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator } from '../comum/ator';

export interface ConteudoDoToken {
  sub: number;
  perfil: Perfil;
  unidadeId: number | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly jwt: JwtService,
    private readonly hasher: HasherDeSenha,
    private readonly limitador: LimitadorDeLogin,
    private readonly uow: UnidadeDeTrabalho,
    private readonly auditoria: AuditoriaService,
  ) {}

  async login(emailInformado: string, senha: string) {
    const email = emailInformado.trim().toLowerCase();

    const bloqueio = this.limitador.segundosDeBloqueio(email);
    if (bloqueio > 0) {
      throw new ErroDeDominio(
        NaturezaErro.LIMITE_EXCEDIDO,
        'MUITAS_TENTATIVAS_DE_LOGIN',
        `Muitas tentativas sem sucesso. Tente novamente em ${Math.ceil(bloqueio / 60)} minuto(s).`,
      );
    }

    const usuario = await this.usuarios.findOne({ where: { email, ativo: true, anonimizadoEm: IsNull() } });
    // A comparação roda mesmo sem usuário (hash fictício) para não revelar quais e-mails existem.
    const senhaConfere = await this.hasher.conferir(senha, usuario?.senhaHash);

    if (!usuario || !senhaConfere) {
      this.limitador.registrarFalha(email);
      await this.uow.executar((em) =>
        this.auditoria.registrar(em, {
          acao: AcaoAuditoria.LOGIN_FALHA,
          entidade: 'Usuario',
          entidadeId: usuario?.id ?? null,
          detalhes: { email: mascararEmail(email) },
        }),
      );
      throw new ErroDeDominio(NaturezaErro.NAO_AUTENTICADO, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
    }

    this.limitador.limpar(email);
    const ator: Ator = { id: usuario.id, perfil: usuario.perfil, unidadeId: usuario.unidadeId };
    await this.uow.executar((em) =>
      this.auditoria.registrar(em, { acao: AcaoAuditoria.LOGIN_SUCESSO, entidade: 'Usuario', entidadeId: usuario.id, ator }),
    );

    const conteudo: ConteudoDoToken = { sub: usuario.id, perfil: usuario.perfil, unidadeId: usuario.unidadeId };
    return {
      accessToken: await this.jwt.signAsync(conteudo),
      tokenType: 'Bearer',
      expiresIn: ambiente.jwtExpiraEmSegundos,
      usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, unidadeId: usuario.unidadeId },
    };
  }

  /** Valida o JWT e confirma que o usuário segue ativo e não anonimizado. */
  async autenticar(token: string): Promise<Ator> {
    let conteudo: ConteudoDoToken;
    try {
      conteudo = await this.jwt.verifyAsync<ConteudoDoToken>(token);
    } catch {
      throw new ErroDeDominio(NaturezaErro.NAO_AUTENTICADO, 'TOKEN_INVALIDO', 'Token de acesso inválido ou expirado.');
    }
    const usuario = await this.usuarios.findOne({ where: { id: conteudo.sub, ativo: true, anonimizadoEm: IsNull() } });
    if (!usuario) {
      throw new ErroDeDominio(NaturezaErro.NAO_AUTENTICADO, 'TOKEN_INVALIDO', 'Usuário do token não está mais ativo.');
    }
    return { id: usuario.id, perfil: usuario.perfil, unidadeId: usuario.unidadeId };
  }
}
