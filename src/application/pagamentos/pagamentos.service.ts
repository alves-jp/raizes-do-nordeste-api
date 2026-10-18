import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcaoAuditoria, FormaPagamento, StatusPagamento, StatusPedido } from '../../domain/enums';
import { ErroDeDominio, NaturezaErro, naoEncontrado } from '../../domain/erros';
import { paraReais } from '../../domain/dinheiro';
import { STATUS_PAGAVEIS } from '../../domain/pedido/maquina-de-status';
import { ambiente } from '../../infrastructure/config/ambiente';
import { Pagamento, Pedido } from '../../infrastructure/database/entidades';
import { UnidadeDeTrabalho } from '../../infrastructure/database/unidade-de-trabalho';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator } from '../comum/ator';
import { FidelidadeService } from '../fidelidade/fidelidade.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { visaoDoPagamento } from '../pedidos/visoes';
import { chamarComResiliencia } from './chamada-resiliente';
import { GatewayDePagamento, GatewayIndisponivelError, RespostaDeCobranca } from './gateway-pagamento.port';

export interface SolicitacaoDePagamento {
  pedidoId: number;
  formaPagamento?: FormaPagamento;
  tokenPagamento?: string;
}

export interface ResultadoDoPagamento {
  pagamento: ReturnType<typeof visaoDoPagamento>;
  pedido: { id: number; status: StatusPedido; total: number };
  pontosCreditados: number;
  repetido: boolean;
}

/**
 * Fluxo crítico — pagamento via provedor externo (mock):
 *
 *  1. valida o pedido e registra a tentativa como PENDENTE (transação curta);
 *  2. chama o provedor FORA de transação, com timeout e nova tentativa em falha transitória;
 *  3. registra o retorno e atualiza o pedido (transação curta):
 *     APROVADO → pedido PAGO + pontos de fidelidade;
 *     RECUSADO → pedido PAGAMENTO_RECUSADO (cliente pode tentar de novo) → HTTP 402;
 *     sem resposta → tentativa FALHA_COMUNICACAO, pedido inalterado → HTTP 503.
 *
 * Idempotência: o header Idempotency-Key faz com que um reenvio (ex.: totem sem rede)
 * devolva o mesmo resultado em vez de cobrar duas vezes.
 */
@Injectable()
export class PagamentosService {
  constructor(
    @InjectRepository(Pagamento) private readonly pagamentos: Repository<Pagamento>,
    private readonly uow: UnidadeDeTrabalho,
    private readonly gateway: GatewayDePagamento,
    private readonly pedidosService: PedidosService,
    private readonly fidelidade: FidelidadeService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async solicitar(dados: SolicitacaoDePagamento, ator: Ator, chaveIdempotencia?: string): Promise<ResultadoDoPagamento> {
    // 1) Validação + registro da tentativa
    const etapa1 = await this.uow.executar(async (em) => {
      if (chaveIdempotencia) {
        const anterior = await em.findOne(Pagamento, { where: { chaveIdempotencia } });
        if (anterior) {
          if (anterior.pedidoId !== dados.pedidoId) {
            throw new ErroDeDominio(NaturezaErro.CONFLITO, 'CHAVE_IDEMPOTENCIA_REUTILIZADA', 'Esta Idempotency-Key já foi usada para outro pedido.', [
              { field: 'Idempotency-Key', issue: `Associada ao pedido ${anterior.pedidoId}` },
            ]);
          }
          this.pedidosService.verificarEscopo(await this.pedidosService.carregar(em, anterior.pedidoId), ator);
          return { repetido: anterior };
        }
      }

      const pedido = await this.pedidosService.carregar(em, dados.pedidoId);
      this.pedidosService.verificarEscopo(pedido, ator);
      this.garantirPagavel(pedido);

      if (await em.exists(Pagamento, { where: { pedidoId: pedido.id, status: StatusPagamento.PENDENTE } })) {
        throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PAGAMENTO_EM_PROCESSAMENTO', 'Já existe um pagamento em processamento para este pedido.');
      }
      const tentativa = await em.save(
        em.create(Pagamento, {
          pedidoId: pedido.id,
          valorCentavos: pedido.totalCentavos,
          forma: dados.formaPagamento ?? pedido.formaPagamento,
          status: StatusPagamento.PENDENTE,
          chaveIdempotencia: chaveIdempotencia ?? null,
        }),
      );
      return { tentativa, pedido };
    });

    if ('repetido' in etapa1 && etapa1.repetido) return this.reproduzir(etapa1.repetido);
    const { tentativa, pedido } = etapa1 as { tentativa: Pagamento; pedido: Pedido };

    // 2) Chamada ao provedor externo, fora da transação
    let resposta: RespostaDeCobranca | null = null;
    try {
      resposta = await chamarComResiliencia(
        () =>
          this.gateway.cobrar({
            referencia: `pedido-${pedido.id}-pagamento-${tentativa.id}`,
            valorCentavos: tentativa.valorCentavos,
            forma: tentativa.forma,
            tokenPagamento: dados.tokenPagamento ?? 'tok_aprovado',
          }),
        { timeoutMs: ambiente.gatewayTimeoutMs, tentativasExtras: ambiente.gatewayTentativasExtras, descricao: `cobrança do pedido ${pedido.id}` },
      );
    } catch (erro) {
      if (!(erro instanceof GatewayIndisponivelError)) throw erro;
    }

    // 3) Registro do retorno
    if (!resposta) return this.registrarFalhaDeComunicacao(tentativa, pedido, ator);

    const resultado = await this.uow.executar(async (em) => {
      const atual = await this.pedidosService.carregar(em, pedido.id);
      await em.update(Pagamento, tentativa.id, {
        status: resposta.aprovado ? StatusPagamento.APROVADO : StatusPagamento.RECUSADO,
        transacaoExternaId: resposta.transacaoId,
        codigoRetorno: resposta.codigo,
        mensagemRetorno: resposta.mensagem,
        respostaGateway: JSON.stringify(resposta.payload),
      });
      const novoStatus = resposta.aprovado ? StatusPedido.PAGO : StatusPedido.PAGAMENTO_RECUSADO;
      await em.update(Pedido, atual.id, { status: novoStatus });
      atual.status = novoStatus;

      const pontosCreditados = resposta.aprovado ? await this.fidelidade.creditarPorPagamento(em, atual) : 0;
      await this.auditoria.registrar(em, {
        acao: resposta.aprovado ? AcaoAuditoria.PAGAMENTO_APROVADO : AcaoAuditoria.PAGAMENTO_RECUSADO,
        entidade: 'Pagamento',
        entidadeId: tentativa.id,
        ator,
        unidadeId: atual.unidadeId,
        detalhes: {
          pedidoId: atual.id,
          valor: paraReais(tentativa.valorCentavos),
          forma: tentativa.forma,
          codigoRetorno: resposta.codigo,
          transacaoExternaId: resposta.transacaoId,
          statusPedido: novoStatus,
          pontosCreditados,
        },
      });
      const pagamento = await em.findOneByOrFail(Pagamento, { id: tentativa.id });
      return { pagamento, pedido: atual, pontosCreditados };
    });

    if (!resposta.aprovado) throw this.erroDeRecusa(resultado.pagamento);
    return {
      pagamento: visaoDoPagamento(resultado.pagamento),
      pedido: { id: resultado.pedido.id, status: resultado.pedido.status, total: paraReais(resultado.pedido.totalCentavos) },
      pontosCreditados: resultado.pontosCreditados,
      repetido: false,
    };
  }

  async obter(id: number, ator: Ator) {
    const pagamento = await this.pagamentos.findOne({ where: { id } });
    if (!pagamento) throw naoEncontrado('Pagamento', id);
    const pedido = await this.pedidosService.carregar(this.pagamentos.manager, pagamento.pedidoId);
    try {
      this.pedidosService.verificarEscopo(pedido, ator);
    } catch (erro) {
      if (erro instanceof ErroDeDominio && erro.natureza === NaturezaErro.NAO_ENCONTRADO) throw naoEncontrado('Pagamento', id);
      throw erro;
    }
    return visaoDoPagamento(pagamento);
  }

  async listarDoPedido(pedidoId: number, ator: Ator) {
    const pedido = await this.pedidosService.carregar(this.pagamentos.manager, pedidoId);
    this.pedidosService.verificarEscopo(pedido, ator);
    const itens = await this.pagamentos.find({ where: { pedidoId }, order: { id: 'ASC' } });
    return itens.map(visaoDoPagamento);
  }

  // ------------------------------ auxiliares ------------------------------

  private garantirPagavel(pedido: Pedido) {
    if (STATUS_PAGAVEIS.includes(pedido.status)) return;
    if (pedido.status === StatusPedido.CANCELADO) {
      throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PEDIDO_CANCELADO', `O pedido ${pedido.id} está cancelado e não pode ser pago.`);
    }
    throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PEDIDO_JA_PAGO', `O pedido ${pedido.id} já foi pago (status ${pedido.status}).`);
  }

  private async registrarFalhaDeComunicacao(tentativa: Pagamento, pedido: Pedido, ator: Ator): Promise<never> {
    await this.uow.executar(async (em) => {
      // A chave de idempotência é liberada: o cliente pode repetir a MESMA requisição com segurança.
      await em.update(Pagamento, tentativa.id, {
        status: StatusPagamento.FALHA_COMUNICACAO,
        mensagemRetorno: 'Provedor de pagamento não respondeu a tempo.',
        chaveIdempotencia: null,
      });
      await this.auditoria.registrar(em, {
        acao: AcaoAuditoria.PAGAMENTO_FALHA_COMUNICACAO,
        entidade: 'Pagamento',
        entidadeId: tentativa.id,
        ator,
        unidadeId: pedido.unidadeId,
        detalhes: { pedidoId: pedido.id, statusPedido: pedido.status },
      });
    });
    throw new ErroDeDominio(
      NaturezaErro.DEPENDENCIA_INDISPONIVEL,
      'GATEWAY_PAGAMENTO_INDISPONIVEL',
      'O provedor de pagamento não respondeu. Nada foi cobrado; tente novamente em instantes.',
      [
        { field: 'pagamentoId', issue: String(tentativa.id) },
        { field: 'pedido.status', issue: pedido.status },
      ],
    );
  }

  private erroDeRecusa(pagamento: Pagamento) {
    return new ErroDeDominio(
      NaturezaErro.PAGAMENTO_RECUSADO,
      'PAGAMENTO_RECUSADO',
      `Pagamento recusado pelo provedor: ${pagamento.mensagemRetorno} Tente outro meio de pagamento.`,
      [
        { field: 'pagamentoId', issue: String(pagamento.id) },
        { field: 'codigoRetorno', issue: pagamento.codigoRetorno ?? 'DESCONHECIDO' },
        { field: 'pedido.status', issue: StatusPedido.PAGAMENTO_RECUSADO },
      ],
    );
  }

  /** Reenvio com a mesma Idempotency-Key: devolve o resultado original, sem nova cobrança. */
  private async reproduzir(pagamento: Pagamento): Promise<ResultadoDoPagamento> {
    if (pagamento.status === StatusPagamento.RECUSADO) throw this.erroDeRecusa(pagamento);
    if (pagamento.status === StatusPagamento.PENDENTE) {
      throw new ErroDeDominio(NaturezaErro.CONFLITO, 'PAGAMENTO_EM_PROCESSAMENTO', 'Este pagamento ainda está em processamento.');
    }
    const pedido = await this.pedidosService.carregar(this.pagamentos.manager, pagamento.pedidoId);
    return {
      pagamento: visaoDoPagamento(pagamento),
      pedido: { id: pedido.id, status: pedido.status, total: paraReais(pedido.totalCentavos) },
      pontosCreditados: 0,
      repetido: true,
    };
  }
}
