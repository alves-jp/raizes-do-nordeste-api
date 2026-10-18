import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { AcaoAuditoria, Perfil } from '../../domain/enums';
import { LogAuditoria } from '../../infrastructure/database/entidades';
import { contextoAtual } from '../../infrastructure/contexto/contexto-requisicao';
import { Ator } from '../comum/ator';
import { deslocamento, Pagina, paginar, Paginacao } from '../comum/paginacao';

export interface RegistroDeAuditoria {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId?: number | null;
  ator?: Ator | null;
  unidadeId?: number | null;
  /** Nunca incluir senha, token ou dado pessoal em claro. */
  detalhes?: Record<string, unknown>;
}

export interface FiltrosAuditoria {
  acao?: AcaoAuditoria;
  entidade?: string;
  entidadeId?: number;
  usuarioId?: number;
  unidadeId?: number;
}

@Injectable()
export class AuditoriaService {
  constructor(@InjectRepository(LogAuditoria) private readonly logs: Repository<LogAuditoria>) {}

  /** Grava o registro DENTRO da transação do caso de uso: ou tudo é salvo, ou nada é. */
  async registrar(em: EntityManager, r: RegistroDeAuditoria): Promise<void> {
    const contexto = contextoAtual();
    await em.insert(LogAuditoria, {
      acao: r.acao,
      entidade: r.entidade,
      entidadeId: r.entidadeId ?? null,
      usuarioId: r.ator?.id ?? null,
      perfil: r.ator?.perfil ?? null,
      unidadeId: r.unidadeId ?? r.ator?.unidadeId ?? null,
      detalhes: r.detalhes ? JSON.stringify(r.detalhes) : null,
      ip: contexto?.ip ?? null,
      requestId: contexto?.requestId ?? null,
    });
  }

  /** ADMIN vê toda a rede; GERENTE vê apenas os registros da própria unidade. */
  async listar(filtros: FiltrosAuditoria, paginacao: Paginacao, ator: Ator): Promise<Pagina<Record<string, unknown>>> {
    const where: FindOptionsWhere<LogAuditoria> = {};
    if (filtros.acao) where.acao = filtros.acao;
    if (filtros.entidade) where.entidade = filtros.entidade;
    if (filtros.entidadeId) where.entidadeId = filtros.entidadeId;
    if (filtros.usuarioId) where.usuarioId = filtros.usuarioId;
    if (filtros.unidadeId) where.unidadeId = filtros.unidadeId;
    if (ator.perfil === Perfil.GERENTE) where.unidadeId = ator.unidadeId ?? -1;

    const [registros, total] = await this.logs.findAndCount({
      where,
      order: { id: 'DESC' },
      ...deslocamento(paginacao),
    });
    return paginar(
      registros.map((l) => ({
        id: l.id,
        acao: l.acao,
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        usuarioId: l.usuarioId,
        perfil: l.perfil,
        unidadeId: l.unidadeId,
        detalhes: l.detalhes ? JSON.parse(l.detalhes) : null,
        ip: l.ip,
        requestId: l.requestId,
        criadoEm: l.criadoEm,
      })),
      total,
      paginacao,
    );
  }
}
