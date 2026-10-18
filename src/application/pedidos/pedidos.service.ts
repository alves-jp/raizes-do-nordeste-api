import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { calcularDescontoDeCampanha } from '../../domain/campanha/regras-campanha';
import {
  AcaoAuditoria,
  CanalPedido,
  FinalidadeConsentimento,
  FormaPagamento,
  Perfil,
  StatusPagamento,
  StatusPedido,
} from '../../domain/enums';
import { ErroDeDominio, NaturezaErro, naoEncontrado, proibido } from '../../domain/erros';
import { calcularDescontoPorPontos } from '../../domain/fidelidade/regras-fidelidade';
import { paraReais } from '../../domain/dinheiro';
import { calcularSubtotal, consolidarItens, validarItens } from '../../domain/pedido/calculo-pedido';
import { validarCanalDoPerfil } from '../../domain/pedido/canal-por-perfil';
import { validarCancelamento, validarTransicaoOperacional } from '../../domain/pedido/maquina-de-status';
import { estaEmTemporada } from '../../domain/produto/sazonalidade';
import { ambiente } from '../../infrastructure/config/ambiente';
import { Campanha, ItemCardapio, ItemPedido, Pagamento, Pedido, Produto, Unidade, Usuario } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator, garantirAcessoAUnidade } from '../comum/ator';
import { deslocamento, Pagina, paginar, Paginacao } from '../comum/paginacao';
import { Relogio } from '../comum/relogio';
import { EstoqueService } from '../estoque/estoque.service';
import { FidelidadeService } from '../fidelidade/fidelidade.service';
import { chamarComResiliencia } from '../pagamentos/chamada-resiliente';
import { GatewayDePagamento, GatewayIndisponivelError } from '../pagamentos/gateway-pagamento.port';
import { resumoDoPedido, visaoDoPedido } from './visoes';

export interface NovoPedido {
  unidadeId: number;
  canalPedido: CanalPedido;
  formaPagamento: FormaPagamento;
  itens: { produtoId: number; quantidade: number }[];
  clienteId?: number;
  codigoCampanha?: string;
  pontosResgate?: number;
  observacao?: string;
}

export interface FiltrosPedido {
  canalPedido?: CanalPedido;
  status?: StatusPedido;
  unidadeId?: number;
  dataInicio?: Date;
  dataFim?: Date;
}

@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidos: Repository<Pedido>,
    private readonly uow: UnidadeDeTrabalho,
    private readonly estoque: EstoqueService,
    private readonly fidelidade: FidelidadeService,
    private readonly auditoria: AuditoriaService,
    private readonly gateway: GatewayDePagamento,
    private readonly relogio: Relogio,
  ) {}

  /**
   * Fluxo crítico — criação do pedido:
   * valida canal × perfil, unidade, cliente, cardápio, temporada; calcula subtotal,
   * campanha e resgate de pontos; baixa o estoque; tudo numa única transação.
   */
  async criar(dados: NovoPedido, ator: Ator, chaveIdempotencia?: string): Promise<{ pedido: ReturnType<typeof visaoDoPedido>; repetido: boolean }> {
    return this.uow.executar(async (em) => {
      if (chaveIdempotencia) {
        const existente = await em.findOne(Pedido, { where: { criadoPorId: ator.id, chaveIdempotencia } });
        if (existente) return { pedido: visaoDoPedido(await this.carregar(em, existente.id)), repetido: true };
      }

      validarCanalDoPerfil(dados.canalPedido, ator.perfil);
      if (ator.perfil !== Perfil.CLIENTE) garantirAcessoAUnidade(ator, dados.unidadeId);

      const unidade = await em.findOne(Unidade, { where: { id: dados.unidadeId } });
      if (!unidade) throw naoEncontrado('Unidade', dados.unidadeId);
      if (!unidade.ativa) {
        throw new ErroDeDominio(NaturezaErro.REGRA_DE_NEGOCIO, 'UNIDADE_INATIVA', `A unidade ${unidade.nome} não está recebendo pedidos.`);
      }

      const clienteId = await this.resolverCliente(em, dados, ator);

      const itens = consolidarItens(dados.itens);
      validarItens(itens);
      const precificados = await this.precificarItens(em, dados.unidadeId, itens);
      const subtotal = calcularSubtotal(precificados);

      const agora = this.relogio.agora();
      let campanha: Campanha | null = null;
      let descontoCampanha = 0;
      if (dados.codigoCampanha) {
        campanha = await em.findOne(Campanha, { where: { codigo: dados.codigoCampanha.trim().toUpperCase() } });
        if (!campanha) {
          throw new ErroDeDominio(NaturezaErro.REGRA_DE_NEGOCIO, 'CAMPANHA_NAO_APLICAVEL', 'Código promocional inexistente.', [
            { field: 'codigoCampanha', issue: 'Código não encontrado' },
          ]);
        }
        descontoCampanha = calcularDescontoDeCampanha(campanha, { unidadeId: dados.unidadeId, canalPedido: dados.canalPedido, subtotalCentavos: subtotal, agora });
      }

      let descontoPontos = 0;
      const pontosResgate = dados.pontosResgate ?? 0;
      if (pontosResgate > 0) {
        if (!clienteId) {
          throw new ErroDeDominio(NaturezaErro.REGRA_DE_NEGOCIO, 'CLIENTE_NAO_IDENTIFICADO', 'Resgate de pontos exige um cliente identificado no pedido.', [
            { field: 'clienteId', issue: 'Informe o cliente para resgatar pontos' },
          ]);
        }
        if (!(await this.fidelidade.temConsentimento(clienteId, FinalidadeConsentimento.FIDELIDADE, em))) {
          throw new ErroDeDominio(NaturezaErro.REGRA_DE_NEGOCIO, 'CONSENTIMENTO_FIDELIDADE_AUSENTE', 'O cliente não participa do programa de fidelidade (consentimento não concedido).', [
            { field: 'pontosResgate', issue: 'Conceda o consentimento FIDELIDADE em PUT /usuarios/me/consentimentos/FIDELIDADE' },
          ]);
        }
        const saldo = await this.fidelidade.saldo(clienteId, em);
        descontoPontos = calcularDescontoPorPontos(pontosResgate, saldo, subtotal - descontoCampanha);
      }

      const pedido = await em.save(
        em.create(Pedido, {
          unidadeId: dados.unidadeId,
          clienteId,
          criadoPorId: ator.id,
          canalPedido: dados.canalPedido,
          status: StatusPedido.AGUARDANDO_PAGAMENTO,
          formaPagamento: dados.formaPagamento,
          subtotalCentavos: subtotal,
          descontoCampanhaCentavos: descontoCampanha,
          descontoPontosCentavos: descontoPontos,
          totalCentavos: subtotal - descontoCampanha - descontoPontos,
          campanhaId: campanha?.id ?? null,
          pontosResgatados: pontosResgate,
          observacao: dados.observacao?.trim() || null,
          chaveIdempotencia: chaveIdempotencia ?? null,
          itens: precificados.map((i) =>
            em.create(ItemPedido, {
              produtoId: i.produtoId,
              nomeProduto: i.nome,
              quantidade: i.quantidade,
              precoUnitarioCentavos: i.precoUnitarioCentavos,
              subtotalCentavos: i.precoUnitarioCentavos * i.quantidade,
            }),
          ),
        }),
      );

      await this.estoque.reservarParaPedido(em, dados.unidadeId, pedido.id, precificados, ator);
      await this.fidelidade.debitarResgate(em, pedido);
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.PEDIDO_CRIADO,
        entidade: 'Pedido',
        entidadeId: pedido.id,
        ator,
        unidadeId: pedido.unidadeId,
        detalhes: {
          canalPedido: pedido.canalPedido,
          total: paraReais(pedido.totalCentavos),
          itens: precificados.length,
          campanha: campanha?.codigo ?? null,
          pontosResgatados: pontosResgate,
        },
      });
      return { pedido: visaoDoPedido(await this.carregar(em, pedido.id)), repetido: false };
    });
  }

  async listar(filtros: FiltrosPedido, paginacao: Paginacao, ator: Ator): Promise<Pagina<ReturnType<typeof resumoDoPedido>>> {
    const qb = this.pedidos.createQueryBuilder('p').leftJoinAndSelect('p.itens', 'i').orderBy('p.id', 'DESC');

    if (ator.perfil === Perfil.CLIENTE) {
      qb.andWhere('p.cliente_id = :clienteId', { clienteId: ator.id });
    } else if (ator.perfil !== Perfil.ADMIN) {
      if (filtros.unidadeId && filtros.unidadeId !== ator.unidadeId) garantirAcessoAUnidade(ator, filtros.unidadeId);
      qb.andWhere('p.unidade_id = :unidadeId', { unidadeId: ator.unidadeId });
    }
    if (filtros.unidadeId && ator.perfil !== Perfil.CLIENTE) qb.andWhere('p.unidade_id = :filtroUnidade', { filtroUnidade: filtros.unidadeId });
    if (filtros.canalPedido) qb.andWhere('p.canal_pedido = :canal', { canal: filtros.canalPedido });
    if (filtros.status) qb.andWhere('p.status = :status', { status: filtros.status });
    if (filtros.dataInicio) qb.andWhere('p.criado_em >= :inicio', { inicio: filtros.dataInicio });
    if (filtros.dataFim) qb.andWhere('p.criado_em <= :fim', { fim: filtros.dataFim });

    const { skip, take } = deslocamento(paginacao);
    const [itens, total] = await qb.skip(skip).take(take).getManyAndCount();
    return paginar(itens.map(resumoDoPedido), total, paginacao);
  }

  /** Consolidação por canal (multicanalidade): volume e faturamento de cada canal. */
  async resumoPorCanal(filtros: { unidadeId?: number; dataInicio?: Date; dataFim?: Date }, ator: Ator) {
    const unidadeId = ator.perfil === Perfil.ADMIN ? filtros.unidadeId : ator.unidadeId!;
    if (filtros.unidadeId && ator.perfil !== Perfil.ADMIN) garantirAcessoAUnidade(ator, filtros.unidadeId);

    const qb = this.pedidos
      .createQueryBuilder('p')
      .select('p.canal_pedido', 'canal')
      .addSelect('COUNT(*)', 'pedidos')
      .addSelect(`SUM(CASE WHEN p.status = 'CANCELADO' THEN 1 ELSE 0 END)`, 'cancelados')
      .addSelect(`SUM(CASE WHEN p.status IN ('PAGO','EM_PREPARO','PRONTO','ENTREGUE') THEN p.total_centavos ELSE 0 END)`, 'faturamento')
      .addSelect(`SUM(CASE WHEN p.status IN ('PAGO','EM_PREPARO','PRONTO','ENTREGUE') THEN 1 ELSE 0 END)`, 'pagos')
      .groupBy('p.canal_pedido');
    if (unidadeId) qb.andWhere('p.unidade_id = :unidadeId', { unidadeId });
    if (filtros.dataInicio) qb.andWhere('p.criado_em >= :inicio', { inicio: filtros.dataInicio });
    if (filtros.dataFim) qb.andWhere('p.criado_em <= :fim', { fim: filtros.dataFim });
    const linhas = await qb.getRawMany<{ canal: CanalPedido; pedidos: number; cancelados: number; faturamento: number; pagos: number }>();

    const canais = Object.values(CanalPedido).map((canal) => {
      const l = linhas.find((x) => x.canal === canal);
      const pagos = Number(l?.pagos ?? 0);
      const faturamento = Number(l?.faturamento ?? 0);
      return {
        canalPedido: canal,
        pedidos: Number(l?.pedidos ?? 0),
        pedidosPagos: pagos,
        pedidosCancelados: Number(l?.cancelados ?? 0),
        faturamento: paraReais(faturamento),
        ticketMedio: pagos ? paraReais(Math.round(faturamento / pagos)) : 0,
      };
    });
    return { unidadeId: unidadeId ?? null, periodo: { inicio: filtros.dataInicio ?? null, fim: filtros.dataFim ?? null }, canais };
  }

  async obter(id: number, ator: Ator) {
    const pedido = await this.carregar(this.pedidos.manager, id);
    this.verificarEscopo(pedido, ator);
    return visaoDoPedido(pedido);
  }

  /** Atualização operacional (cozinha → pronto → entregue), validada pela máquina de estados. */
  async atualizarStatus(id: number, novoStatus: StatusPedido, ator: Ator) {
    return this.uow.executar(async (em) => {
      const pedido = await this.carregar(em, id);
      this.verificarEscopo(pedido, ator);
      const anterior = pedido.status;
      validarTransicaoOperacional(anterior, novoStatus, ator.perfil);
      await em.update(Pedido, id, { status: novoStatus });
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.PEDIDO_STATUS_ALTERADO,
        entidade: 'Pedido',
        entidadeId: id,
        ator,
        unidadeId: pedido.unidadeId,
        detalhes: { de: anterior, para: novoStatus },
      });
      return visaoDoPedido(await this.carregar(em, id));
    });
  }

  /**
   * Cancelamento com compensação: estorna o pagamento aprovado no provedor (se houver),
   * devolve o estoque e desfaz os efeitos de fidelidade.
   */
  async cancelar(id: number, motivo: string, ator: Ator) {
    const pedido = await this.carregar(this.pedidos.manager, id);
    this.verificarEscopo(pedido, ator);
    validarCancelamento(pedido.status, ator.perfil);

    const pagamentos = await this.pedidos.manager.find(Pagamento, { where: { pedidoId: id } });
    if (pagamentos.some((p) => p.status === StatusPagamento.PENDENTE)) {
      throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PAGAMENTO_EM_PROCESSAMENTO', 'Há um pagamento em processamento para este pedido. Aguarde o retorno.');
    }
    const aprovado = pagamentos.find((p) => p.status === StatusPagamento.APROVADO);

    let estorno: { estornoId: string; payload: Record<string, unknown> } | null = null;
    if (aprovado) {
      try {
        estorno = await chamarComResiliencia(() => this.gateway.estornar(aprovado.transacaoExternaId!, aprovado.valorCentavos), {
          timeoutMs: ambiente.gatewayTimeoutMs,
          tentativasExtras: ambiente.gatewayTentativasExtras,
          descricao: `estorno do pedido ${id}`,
        });
      } catch (erro) {
        if (erro instanceof GatewayIndisponivelError) {
          throw new ErroDeDominio(NaturezaErro.DEPENDENCIA_INDISPONIVEL, 'GATEWAY_PAGAMENTO_INDISPONIVEL', 'Não foi possível estornar o pagamento agora. O pedido NÃO foi cancelado; tente novamente.');
        }
        throw erro;
      }
    }

    return this.uow.executar(async (em) => {
      const atual = await this.carregar(em, id);
      if (atual.status === StatusPedido.CANCELADO || atual.status === StatusPedido.ENTREGUE) {
        throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PEDIDO_NAO_CANCELAVEL', `Pedido com status ${atual.status} não pode ser cancelado.`);
      }
      await em.update(Pedido, id, { status: StatusPedido.CANCELADO, motivoCancelamento: motivo.trim() });
      await this.estoque.devolverDoPedido(em, atual.unidadeId, id, atual.itens, ator);
      const fidelidade = await this.fidelidade.estornarPedido(em, atual);

      if (aprovado && estorno) {
        const resposta = { ...(aprovado.respostaGateway ? JSON.parse(aprovado.respostaGateway) : {}), refund: estorno.payload };
        await em.update(Pagamento, aprovado.id, { status: StatusPagamento.ESTORNADO, respostaGateway: JSON.stringify(resposta) });
        await this.auditoria.registrar(em, {
          acao: AcaoAuditoria.PAGAMENTO_ESTORNADO,
          entidade: 'Pagamento',
          entidadeId: aprovado.id,
          ator,
          unidadeId: atual.unidadeId,
          detalhes: { pedidoId: id, estornoId: estorno.estornoId, valor: paraReais(aprovado.valorCentavos) },
        });
      }
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.PEDIDO_CANCELADO,
        entidade: 'Pedido',
        entidadeId: id,
        ator,
        unidadeId: atual.unidadeId,
        detalhes: { statusAnterior: atual.status, motivo: motivo.trim(), pagamentoEstornado: Boolean(estorno), fidelidade },
      });
      return visaoDoPedido(await this.carregar(em, id));
    });
  }

  // ------------------------------ auxiliares ------------------------------

  async carregar(em: EntityManager, id: number): Promise<Pedido> {
    const pedido = await em.findOne(Pedido, { where: { id }, relations: { itens: true, campanha: true } });
    if (!pedido) throw naoEncontrado('Pedido', id);
    pedido.itens.sort((a, b) => a.id - b.id);
    return pedido;
  }

  /**
   * CLIENTE só enxerga os próprios pedidos (pedido de outro cliente responde 404,
   * para não revelar que o ID existe). Equipe/totem só enxergam a própria unidade (403).
   */
  verificarEscopo(pedido: Pedido, ator: Ator): void {
    if (ator.perfil === Perfil.CLIENTE) {
      if (pedido.clienteId !== ator.id) throw naoEncontrado('Pedido', pedido.id);
      return;
    }
    garantirAcessoAUnidade(ator, pedido.unidadeId);
  }

  private async resolverCliente(em: EntityManager, dados: NovoPedido, ator: Ator): Promise<number | null> {
    if (ator.perfil === Perfil.CLIENTE) {
      if (dados.clienteId && dados.clienteId !== ator.id) throw proibido('Um cliente só pode fazer pedidos em seu próprio nome.');
      return ator.id;
    }
    if (!dados.clienteId) return null;
    const cliente = await em.findOne(Usuario, { where: { id: dados.clienteId, perfil: Perfil.CLIENTE, ativo: true } });
    if (!cliente) throw naoEncontrado('Cliente', dados.clienteId);
    return cliente.id;
  }

  private async precificarItens(em: EntityManager, unidadeId: number, itens: { produtoId: number; quantidade: number }[]) {
    const ids = itens.map((i) => i.produtoId);
    const produtos = await em.find(Produto, { where: { id: In(ids) } });
    const inexistentes = ids.filter((id) => !produtos.some((p) => p.id === id));
    if (inexistentes.length) {
      throw new ErroDeDominio(
        NaturezaErro.NAO_ENCONTRADO,
        'PRODUTO_NAO_ENCONTRADO',
        `Produto(s) não encontrado(s): ${inexistentes.join(', ')}.`,
        inexistentes.map((id) => ({ field: `itens[${ids.indexOf(id)}].produtoId`, issue: `Produto ${id} não existe` })),
      );
    }
    const cardapio = await em.find(ItemCardapio, { where: { unidadeId, produtoId: In(ids) } });
    const agora = this.relogio.agora();

    return itens.map((item, indice) => {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      const noCardapio = cardapio.find((c) => c.produtoId === item.produtoId);
      const campo = `itens[${indice}].produtoId`;
      if (!noCardapio || !noCardapio.disponivel || !produto.ativo) {
        throw new ErroDeDominio(NaturezaErro.REGRA_DE_NEGOCIO, 'PRODUTO_INDISPONIVEL_NA_UNIDADE', `"${produto.nome}" não está disponível no cardápio desta unidade.`, [
          { field: campo, issue: !noCardapio ? 'Produto fora do cardápio da unidade' : 'Produto pausado/inativo' },
        ]);
      }
      if (!estaEmTemporada(produto, agora)) {
        throw new ErroDeDominio(NaturezaErro.REGRA_DE_NEGOCIO, 'PRODUTO_FORA_DE_TEMPORADA', `"${produto.nome}" é sazonal e só é vendido entre os meses ${produto.mesInicio} e ${produto.mesFim}.`, [
          { field: campo, issue: `Temporada: mês ${produto.mesInicio} a ${produto.mesFim}` },
        ]);
      }
      return { produtoId: produto.id, nome: produto.nome, quantidade: item.quantidade, precoUnitarioCentavos: noCardapio.precoCentavos };
    });
  }
}

