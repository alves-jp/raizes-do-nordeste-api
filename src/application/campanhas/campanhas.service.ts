import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcaoAuditoria, CanalPedido, NivelFidelidade } from '../../domain/enums';
import { campanhaEhSegmentada } from '../../domain/campanha/regras-campanha';
import { IDADE_MINIMA_SEGMENTACAO } from '../../domain/cliente/idade';
import { ErroDeDominio, NaturezaErro, naoEncontrado } from '../../domain/erros';
import { paraCentavos, paraReais } from '../../domain/dinheiro';
import { Campanha, Unidade } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator } from '../comum/ator';
import { deslocamento, Pagina, paginar, Paginacao } from '../comum/paginacao';
import { Relogio } from '../comum/relogio';

export interface NovaCampanha {
  codigo: string;
  descricao: string;
  percentualDesconto: number;
  inicio: Date;
  fim: Date;
  unidadeId?: number | null;
  canalPedido?: CanalPedido | null;
  valorMinimo?: number;
  nivelMinimoFidelidade?: NivelFidelidade | null;
  idadeMinima?: number | null;
  idadeMaxima?: number | null;
}

@Injectable()
export class CampanhasService {
  constructor(
    @InjectRepository(Campanha) private readonly campanhas: Repository<Campanha>,
    private readonly uow: UnidadeDeTrabalho,
    private readonly auditoria: AuditoriaService,
    private readonly relogio: Relogio,
  ) {}

  /** Campanhas vigentes para a vitrine pública. */
  async listarVigentes(filtros: { unidadeId?: number; canalPedido?: CanalPedido }, paginacao: Paginacao): Promise<Pagina<ReturnType<CampanhasService['visao']>>> {
    const agora = this.relogio.agora();
    const qb = this.campanhas
      .createQueryBuilder('c')
      .where('c.ativa = 1')
      .andWhere('c.inicio <= :agora AND c.fim >= :agora', { agora });
    if (filtros.unidadeId) qb.andWhere('(c.unidade_id IS NULL OR c.unidade_id = :unidadeId)', { unidadeId: filtros.unidadeId });
    if (filtros.canalPedido) qb.andWhere('(c.canal_pedido IS NULL OR c.canal_pedido = :canal)', { canal: filtros.canalPedido });
    const { skip, take } = deslocamento(paginacao);
    const [itens, total] = await qb.orderBy('c.fim', 'ASC').skip(skip).take(take).getManyAndCount();
    return paginar(itens.map((c) => this.visao(c)), total, paginacao);
  }

  async criar(dados: NovaCampanha, ator: Ator) {
    const codigo = dados.codigo.trim().toUpperCase();
    if (dados.fim <= dados.inicio) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'PERIODO_INVALIDO', 'A data de fim deve ser posterior à data de início.', [
        { field: 'fim', issue: 'Deve ser maior que inicio' },
      ]);
    }
    const { idadeMinima, idadeMaxima } = dados;
    if (idadeMinima != null && idadeMinima < IDADE_MINIMA_SEGMENTACAO) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'SEGMENTACAO_NAO_PERMITIDA_PARA_MENORES', 'Campanhas por faixa etária só podem atingir maiores de idade.', [
        { field: 'idadeMinima', issue: `Mínimo: ${IDADE_MINIMA_SEGMENTACAO}` },
      ]);
    }
    if (idadeMaxima != null && idadeMaxima < (idadeMinima ?? IDADE_MINIMA_SEGMENTACAO)) {
      throw new ErroDeDominio(NaturezaErro.VALIDACAO, 'FAIXA_ETARIA_INVALIDA', 'idadeMaxima deve ser maior ou igual a idadeMinima (e a 18).', [
        { field: 'idadeMaxima', issue: 'Faixa etária inválida' },
      ]);
    }
    return this.uow.executar(async (em) => {
      if (await em.exists(Campanha, { where: { codigo } })) {
        throw new ErroDeDominio(NaturezaErro.CONFLITO, 'CAMPANHA_JA_EXISTE', `Já existe uma campanha com o código ${codigo}.`, [
          { field: 'codigo', issue: 'Código já utilizado' },
        ]);
      }
      if (dados.unidadeId && !(await em.exists(Unidade, { where: { id: dados.unidadeId } }))) {
        throw naoEncontrado('Unidade', dados.unidadeId);
      }
      const campanha = await em.save(
        em.create(Campanha, {
          codigo,
          descricao: dados.descricao.trim(),
          percentualDesconto: dados.percentualDesconto,
          inicio: dados.inicio,
          fim: dados.fim,
          unidadeId: dados.unidadeId ?? null,
          canalPedido: dados.canalPedido ?? null,
          valorMinimoCentavos: paraCentavos(dados.valorMinimo ?? 0),
          nivelMinimoFidelidade: dados.nivelMinimoFidelidade ?? null,
          idadeMinima: idadeMinima ?? null,
          idadeMaxima: idadeMaxima ?? null,
        }),
      );
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.CAMPANHA_CRIADA,
        entidade: 'Campanha',
        entidadeId: campanha.id,
        ator,
        unidadeId: campanha.unidadeId,
        detalhes: { codigo, percentualDesconto: campanha.percentualDesconto, segmentada: campanhaEhSegmentada(campanha) },
      });
      return this.visao(campanha);
    });
  }

  visao(c: Campanha) {
    return {
      id: c.id,
      codigo: c.codigo,
      descricao: c.descricao,
      percentualDesconto: c.percentualDesconto,
      inicio: c.inicio,
      fim: c.fim,
      unidadeId: c.unidadeId,
      canalPedido: c.canalPedido,
      valorMinimo: paraReais(c.valorMinimoCentavos),
      segmentacao: campanhaEhSegmentada(c)
        ? { nivelMinimoFidelidade: c.nivelMinimoFidelidade, idadeMinima: c.idadeMinima, idadeMaxima: c.idadeMaxima, exigeConsentimentoMarketing: true }
        : null,
      ativa: c.ativa,
    };
  }
}

