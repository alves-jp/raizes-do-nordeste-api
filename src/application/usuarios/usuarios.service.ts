import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { EntityManager, In, Repository } from 'typeorm';
import { AcaoAuditoria, FinalidadeConsentimento, Perfil, PERFIS_DE_UNIDADE, StatusPedido } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro, naoEncontrado } from '../../domain/erros';
import { validarDataNascimento } from '../../domain/cliente/idade';
import { mascararEmail, mascararTelefone } from '../../domain/lgpd/mascaramento';
import { paraReais } from '../../domain/dinheiro';
import { Consentimento, Pedido, TransacaoFidelidade, Unidade, Usuario } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { HasherDeSenha } from '../../infrastructure/seguranca/hasher-senha';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator } from '../comum/ator';
import { deslocamento, Pagina, paginar, Paginacao } from '../comum/paginacao';
import { Relogio } from '../comum/relogio';
import { FidelidadeService } from '../fidelidade/fidelidade.service';

/** Versão atual dos termos e da política. */
export const VERSAO_TERMOS = 'v1.0';

export interface NovoCliente {
  nome: string;
  email: string;
  senha: string;
  telefone?: string;
  dataNascimento?: string;
  consentimentos?: { fidelidade?: boolean; marketing?: boolean };
}

export interface AtualizacaoDePerfil {
  telefone?: string | null;
  dataNascimento?: string | null;
}

export interface NovoFuncionario {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
  unidadeId?: number;
}

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly uow: UnidadeDeTrabalho,
    private readonly hasher: HasherDeSenha,
    private readonly auditoria: AuditoriaService,
    private readonly fidelidade: FidelidadeService,
    private readonly relogio: Relogio,
  ) {}

  async cadastrarCliente(dados: NovoCliente) {
    if (dados.dataNascimento) this.validarDataParaSegmentacao(dados.dataNascimento, dados.consentimentos?.marketing ?? false);
    const email = dados.email.trim().toLowerCase();
    const senhaHash = await this.hasher.gerar(dados.senha);
    return this.uow.executar(async (em) => {
      await this.garantirEmailLivre(em, email);
      const usuario = await em.save(
        em.create(Usuario, {
          nome: dados.nome.trim(),
          email,
          senhaHash,
          telefone: dados.telefone ?? null,
          dataNascimento: dados.dataNascimento ?? null,
          perfil: Perfil.CLIENTE,
          unidadeId: null,
          versaoTermosAceita: VERSAO_TERMOS,
          termosAceitosEm: this.relogio.agora(),
        }),
      );
      const decisoes = {
        [FinalidadeConsentimento.FIDELIDADE]: dados.consentimentos?.fidelidade ?? false,
        [FinalidadeConsentimento.MARKETING]: dados.consentimentos?.marketing ?? false,
      };
      for (const [finalidade, concedido] of Object.entries(decisoes)) {
        await em.insert(Consentimento, {
          usuarioId: usuario.id,
          finalidade: finalidade as FinalidadeConsentimento,
          concedido,
          versaoTermo: VERSAO_TERMOS,
          origem: 'CADASTRO',
        });
      }
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.USUARIO_CADASTRADO,
        entidade: 'Usuario',
        entidadeId: usuario.id,
        ator: { id: usuario.id, perfil: usuario.perfil, unidadeId: null },
        detalhes: { email: mascararEmail(email), consentimentos: decisoes, informouDataNascimento: Boolean(dados.dataNascimento) },
      });
      return this.visaoPublica(usuario);
    });
  }

  async cadastrarFuncionario(dados: NovoFuncionario, ator: Ator) {
    if (dados.perfil === Perfil.CLIENTE) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'PERFIL_INVALIDO', 'Clientes se cadastram por POST /usuarios.', [
        { field: 'perfil', issue: 'Use ATENDENTE, COZINHA, GERENTE, TOTEM ou ADMIN' },
      ]);
    }
    const exigeUnidade = PERFIS_DE_UNIDADE.includes(dados.perfil);
    if (exigeUnidade && !dados.unidadeId) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'UNIDADE_OBRIGATORIA', `O perfil ${dados.perfil} precisa estar vinculado a uma unidade.`, [
        { field: 'unidadeId', issue: 'Campo obrigatório para este perfil' },
      ]);
    }
    const email = dados.email.trim().toLowerCase();
    const senhaHash = await this.hasher.gerar(dados.senha);
    return this.uow.executar(async (em) => {
      await this.garantirEmailLivre(em, email);
      if (exigeUnidade && !(await em.exists(Unidade, { where: { id: dados.unidadeId } }))) {
        throw naoEncontrado('Unidade', dados.unidadeId!);
      }
      const usuario = await em.save(
        em.create(Usuario, {
          nome: dados.nome.trim(),
          email,
          senhaHash,
          perfil: dados.perfil,
          unidadeId: exigeUnidade ? dados.unidadeId! : null,
        }),
      );
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.FUNCIONARIO_CADASTRADO,
        entidade: 'Usuario',
        entidadeId: usuario.id,
        ator,
        unidadeId: usuario.unidadeId,
        detalhes: { perfil: usuario.perfil, email: mascararEmail(email) },
      });
      return this.visaoPublica(usuario);
    });
  }

  async meuPerfil(ator: Ator) {
    const usuario = await this.buscar(ator.id);
    return {
      ...this.visaoPublica(usuario),
      email: usuario.email,
      telefone: usuario.telefone,
      dataNascimento: usuario.dataNascimento,
      versaoTermosAceita: usuario.versaoTermosAceita,
      consentimentos: await this.consentimentosVigentes(usuario.id),
    };
  }

  /** Atualiza telefone e data de nascimento. A data exige consentimento MARKETING. */
  async atualizarMeuPerfil(ator: Ator, dados: AtualizacaoDePerfil) {
    if (dados.dataNascimento) {
      const consentiu = await this.fidelidade.temConsentimento(ator.id, FinalidadeConsentimento.MARKETING);
      this.validarDataParaSegmentacao(dados.dataNascimento, consentiu);
    }
    const alteracoes: Partial<Usuario> = {};
    if (dados.telefone !== undefined) alteracoes.telefone = dados.telefone;
    if (dados.dataNascimento !== undefined) alteracoes.dataNascimento = dados.dataNascimento;
    if (Object.keys(alteracoes).length === 0) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'NADA_A_ATUALIZAR', 'Informe ao menos um campo: telefone ou dataNascimento.');
    }
    await this.uow.executar(async (em) => {
      await em.update(Usuario, ator.id, alteracoes);
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.DADOS_PESSOAIS_ATUALIZADOS,
        entidade: 'Usuario',
        entidadeId: ator.id,
        ator,
        // Só os NOMES dos campos alterados: o valor (dado pessoal) não vai para a trilha.
        detalhes: { campos: Object.keys(alteracoes) },
      });
    });
    return this.meuPerfil(ator);
  }

  private validarDataParaSegmentacao(dataNascimento: string, consentiuMarketing: boolean) {
    if (!consentiuMarketing) {
      throw new ErroDeDominio(
        NaturezaErro.REGRA_DE_NEGOCIO,
        'CONSENTIMENTO_MARKETING_AUSENTE',
        'A data de nascimento só é usada para campanhas por faixa etária e exige o consentimento MARKETING.',
        [{ field: 'dataNascimento', issue: 'Conceda o consentimento MARKETING ou não envie este campo' }],
      );
    }
    validarDataNascimento(dataNascimento, this.relogio.agora());
  }

  /** Listagem administrativa com contatos mascarados. */
  async listar(filtros: { perfil?: Perfil; unidadeId?: number }, paginacao: Paginacao): Promise<Pagina<Record<string, unknown>>> {
    const where: Record<string, unknown> = {};
    if (filtros.perfil) where.perfil = filtros.perfil;
    if (filtros.unidadeId) where.unidadeId = filtros.unidadeId;
    const [usuarios, total] = await this.usuarios.findAndCount({ where, order: { id: 'ASC' }, ...deslocamento(paginacao) });
    return paginar(
      usuarios.map((u) => ({
        ...this.visaoPublica(u),
        email: mascararEmail(u.email),
        telefone: mascararTelefone(u.telefone),
        ativo: u.ativo,
        anonimizado: Boolean(u.anonimizadoEm),
      })),
      total,
      paginacao,
    );
  }

  /** Dados completos, restritos ao ADMIN e auditados. */
  async obterDadosPessoais(id: number, ator: Ator) {
    const usuario = await this.buscar(id);
    await this.uow.executar((em) =>
      this.auditoria.registrar(em, {
        acao: AcaoAuditoria.DADOS_PESSOAIS_ACESSADOS,
        entidade: 'Usuario',
        entidadeId: id,
        ator,
        detalhes: { finalidade: 'consulta administrativa' },
      }),
    );
    return {
      ...this.visaoPublica(usuario),
      email: usuario.email,
      telefone: usuario.telefone,
      dataNascimento: usuario.dataNascimento,
      ativo: usuario.ativo,
      anonimizadoEm: usuario.anonimizadoEm,
      consentimentos: await this.consentimentosVigentes(id),
    };
  }

  async consentimentosVigentes(usuarioId: number, em: EntityManager = this.usuarios.manager) {
    const registros = await em.find(Consentimento, { where: { usuarioId }, order: { registradoEm: 'DESC', id: 'DESC' } });
    return Object.values(FinalidadeConsentimento).map((finalidade) => {
      const ultimo = registros.find((r) => r.finalidade === finalidade);
      return {
        finalidade,
        concedido: ultimo?.concedido ?? false,
        versaoTermo: ultimo?.versaoTermo ?? null,
        registradoEm: ultimo?.registradoEm ?? null,
      };
    });
  }

  async historicoDeConsentimentos(ator: Ator) {
    const registros = await this.usuarios.manager.find(Consentimento, {
      where: { usuarioId: ator.id },
      order: { id: 'DESC' },
    });
    return registros.map((r) => ({
      id: r.id,
      finalidade: r.finalidade,
      concedido: r.concedido,
      versaoTermo: r.versaoTermo,
      origem: r.origem,
      registradoEm: r.registradoEm,
    }));
  }

  /** Concede/revoga consentimento (LGPD, art. 8º, §5º). */
  async registrarConsentimento(ator: Ator, finalidade: FinalidadeConsentimento, concedido: boolean) {
    return this.uow.executar(async (em) => {
      await em.insert(Consentimento, { usuarioId: ator.id, finalidade, concedido, versaoTermo: VERSAO_TERMOS, origem: 'PREFERENCIAS' });
      // Finalidade encerrada → dado deixa de ser necessário (LGPD, art. 15, III e art. 16): a data de nascimento é apagada.
      let dataNascimentoApagada = false;
      if (finalidade === FinalidadeConsentimento.MARKETING && !concedido) {
        const resultado = await em
          .createQueryBuilder()
          .update(Usuario)
          .set({ dataNascimento: null })
          .where('id = :id AND data_nascimento IS NOT NULL', { id: ator.id })
          .execute();
        dataNascimentoApagada = (resultado.affected ?? 0) > 0;
      }
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.CONSENTIMENTO_ALTERADO,
        entidade: 'Usuario',
        entidadeId: ator.id,
        ator,
        detalhes: { finalidade, concedido, dataNascimentoApagada },
      });
      return this.consentimentosVigentes(ator.id, em);
    });
  }

  /** Exporta todos os dados do titular (LGPD, art. 18, II e V). */
  async exportarMeusDados(ator: Ator) {
    const usuario = await this.buscar(ator.id);
    const manager = this.usuarios.manager;
    const [pedidos, extrato] = await Promise.all([
      manager.find(Pedido, { where: { clienteId: ator.id }, relations: { itens: true }, order: { id: 'DESC' } }),
      manager.find(TransacaoFidelidade, { where: { clienteId: ator.id }, order: { id: 'DESC' } }),
    ]);
    await this.uow.executar((em) =>
      this.auditoria.registrar(em, { acao: AcaoAuditoria.DADOS_PESSOAIS_EXPORTADOS, entidade: 'Usuario', entidadeId: ator.id, ator }),
    );
    return {
      geradoEm: this.relogio.agora(),
      titular: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        dataNascimento: usuario.dataNascimento,
        perfil: usuario.perfil,
        versaoTermosAceita: usuario.versaoTermosAceita,
        termosAceitosEm: usuario.termosAceitosEm,
        criadoEm: usuario.criadoEm,
      },
      consentimentos: await this.historicoDeConsentimentos(ator),
      pedidos: pedidos.map((p) => ({
        id: p.id,
        unidadeId: p.unidadeId,
        canalPedido: p.canalPedido,
        status: p.status,
        total: paraReais(p.totalCentavos),
        criadoEm: p.criadoEm,
        itens: p.itens.map((i) => ({ produto: i.nomeProduto, quantidade: i.quantidade })),
      })),
      fidelidade: {
        saldo: await this.fidelidade.saldo(ator.id),
        extrato: extrato.map((t) => ({ tipo: t.tipo, pontos: t.pontos, descricao: t.descricao, criadoEm: t.criadoEm })),
      },
    };
  }

  /** Anonimiza a conta. Pedidos permanecem sem vínculo por obrigação fiscal. */
  async anonimizar(ator: Ator): Promise<void> {
    if (ator.perfil !== Perfil.CLIENTE) {
      throw new ErroDeDominio(NaturezaErro.PROIBIDO, 'ACESSO_NEGADO', 'Apenas contas de cliente podem ser anonimizadas por esta rota.');
    }
    const senhaAleatoria = await this.hasher.gerar(randomBytes(32).toString('hex'));
    await this.uow.executar(async (em) => {
      const emAndamento = await em.count(Pedido, {
        where: { clienteId: ator.id, status: In([StatusPedido.PAGO, StatusPedido.EM_PREPARO, StatusPedido.PRONTO]) },
      });
      if (emAndamento > 0) {
        throw new ErroDeDominio(
          NaturezaErro.CONFLITO,
          'PEDIDOS_EM_ANDAMENTO',
          'Existem pedidos pagos ainda não entregues. Aguarde a conclusão para excluir a conta.',
        );
      }
      await em.update(Usuario, ator.id, {
        nome: 'Titular anonimizado',
        email: `anonimizado+${ator.id}@raizes.invalid`,
        telefone: null,
        dataNascimento: null,
        senhaHash: senhaAleatoria,
        ativo: false,
        anonimizadoEm: this.relogio.agora(),
      });
      for (const finalidade of Object.values(FinalidadeConsentimento)) {
        await em.insert(Consentimento, { usuarioId: ator.id, finalidade, concedido: false, versaoTermo: VERSAO_TERMOS, origem: 'ANONIMIZACAO' });
      }
      await this.auditoria.registrar(em, { acao: AcaoAuditoria.USUARIO_ANONIMIZADO, entidade: 'Usuario', entidadeId: ator.id, ator });
    });
  }

  private async buscar(id: number): Promise<Usuario> {
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario) throw naoEncontrado('Usuario', id);
    return usuario;
  }

  private async garantirEmailLivre(em: EntityManager, email: string) {
    if (await em.exists(Usuario, { where: { email } })) {
      throw new ErroDeDominio(NaturezaErro.CONFLITO, 'EMAIL_JA_CADASTRADO', 'Já existe uma conta com este e-mail.', [
        { field: 'email', issue: 'E-mail já cadastrado' },
      ]);
    }
  }

  /** Visão sem dados sensíveis (nunca expõe senhaHash). */
  private visaoPublica(u: Usuario) {
    return { id: u.id, nome: u.nome, perfil: u.perfil, unidadeId: u.unidadeId, criadoEm: u.criadoEm };
  }
}
