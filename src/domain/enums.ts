/** Enumerações compartilhadas por entidades, DTOs e regras de negócio. */

export enum Perfil {
  CLIENTE = 'CLIENTE',
  ATENDENTE = 'ATENDENTE',
  COZINHA = 'COZINHA',
  GERENTE = 'GERENTE',
  ADMIN = 'ADMIN',
  /** Conta de dispositivo do autoatendimento, vinculada a uma unidade. */
  TOTEM = 'TOTEM',
}

/** Perfis de funcionários/dispositivos, que sempre pertencem a uma unidade (exceto ADMIN). */
export const PERFIS_DE_UNIDADE: Perfil[] = [Perfil.ATENDENTE, Perfil.COZINHA, Perfil.GERENTE, Perfil.TOTEM];

export enum CanalPedido {
  APP = 'APP',
  TOTEM = 'TOTEM',
  BALCAO = 'BALCAO',
  PICKUP = 'PICKUP',
  WEB = 'WEB',
}

export enum StatusPedido {
  AGUARDANDO_PAGAMENTO = 'AGUARDANDO_PAGAMENTO',
  PAGAMENTO_RECUSADO = 'PAGAMENTO_RECUSADO',
  PAGO = 'PAGO',
  EM_PREPARO = 'EM_PREPARO',
  PRONTO = 'PRONTO',
  ENTREGUE = 'ENTREGUE',
  CANCELADO = 'CANCELADO',
}

export enum FormaPagamento {
  PIX = 'PIX',
  CARTAO_CREDITO = 'CARTAO_CREDITO',
  CARTAO_DEBITO = 'CARTAO_DEBITO',
}

export enum StatusPagamento {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  RECUSADO = 'RECUSADO',
  /** Gateway indisponível / timeout: nada foi cobrado, o cliente pode tentar de novo. */
  FALHA_COMUNICACAO = 'FALHA_COMUNICACAO',
  ESTORNADO = 'ESTORNADO',
}

export enum TipoUnidade {
  PROPRIA = 'PROPRIA',
  FRANQUIA = 'FRANQUIA',
}

/** Formato da loja. Unidades REDUZIDAS não vendem itens que exigem cozinha completa. */
export enum FormatoUnidade {
  COMPLETA = 'COMPLETA',
  REDUZIDA = 'REDUZIDA',
}

/** Regiões do IBGE, usadas na consolidação de vendas da matriz. */
export enum Regiao {
  NORDESTE = 'NORDESTE',
  NORTE = 'NORTE',
  CENTRO_OESTE = 'CENTRO_OESTE',
  SUDESTE = 'SUDESTE',
  SUL = 'SUL',
}

/** Níveis por frequência de consumo (90 dias), com desconto progressivo no resgate. */
export enum NivelFidelidade {
  BRONZE = 'BRONZE',
  PRATA = 'PRATA',
  OURO = 'OURO',
}

export enum CategoriaProduto {
  TAPIOCAS = 'TAPIOCAS',
  CUSCUZ = 'CUSCUZ',
  PRATOS = 'PRATOS',
  SALGADOS = 'SALGADOS',
  DOCES = 'DOCES',
  BEBIDAS = 'BEBIDAS',
}

export enum TipoMovimentacaoEstoque {
  ENTRADA = 'ENTRADA',
  /** Perda, descarte ou consumo interno (exige motivo). */
  SAIDA = 'SAIDA',
  /** Baixa automática ao criar pedido. */
  RESERVA_PEDIDO = 'RESERVA_PEDIDO',
  /** Devolução automática ao cancelar pedido. */
  ESTORNO_PEDIDO = 'ESTORNO_PEDIDO',
}

/** Finalidades de tratamento que dependem de consentimento (LGPD, art. 7º, I). */
export enum FinalidadeConsentimento {
  FIDELIDADE = 'FIDELIDADE',
  MARKETING = 'MARKETING',
}

export enum TipoTransacaoFidelidade {
  ACUMULO = 'ACUMULO',
  RESGATE = 'RESGATE',
  ESTORNO_ACUMULO = 'ESTORNO_ACUMULO',
  ESTORNO_RESGATE = 'ESTORNO_RESGATE',
}

/** Ações sensíveis registradas na trilha de auditoria. */
export enum AcaoAuditoria {
  LOGIN_SUCESSO = 'LOGIN_SUCESSO',
  LOGIN_FALHA = 'LOGIN_FALHA',
  USUARIO_CADASTRADO = 'USUARIO_CADASTRADO',
  FUNCIONARIO_CADASTRADO = 'FUNCIONARIO_CADASTRADO',
  CONSENTIMENTO_ALTERADO = 'CONSENTIMENTO_ALTERADO',
  DADOS_PESSOAIS_ACESSADOS = 'DADOS_PESSOAIS_ACESSADOS',
  DADOS_PESSOAIS_EXPORTADOS = 'DADOS_PESSOAIS_EXPORTADOS',
  DADOS_PESSOAIS_ATUALIZADOS = 'DADOS_PESSOAIS_ATUALIZADOS',
  USUARIO_ANONIMIZADO = 'USUARIO_ANONIMIZADO',
  PRODUTO_CRIADO = 'PRODUTO_CRIADO',
  PRODUTO_ATUALIZADO = 'PRODUTO_ATUALIZADO',
  CARDAPIO_ATUALIZADO = 'CARDAPIO_ATUALIZADO',
  ESTOQUE_MOVIMENTADO = 'ESTOQUE_MOVIMENTADO',
  CAMPANHA_CRIADA = 'CAMPANHA_CRIADA',
  RELATORIO_CONSULTADO = 'RELATORIO_CONSULTADO',
  PEDIDO_CRIADO = 'PEDIDO_CRIADO',
  PEDIDO_STATUS_ALTERADO = 'PEDIDO_STATUS_ALTERADO',
  PEDIDO_CANCELADO = 'PEDIDO_CANCELADO',
  PAGAMENTO_APROVADO = 'PAGAMENTO_APROVADO',
  PAGAMENTO_RECUSADO = 'PAGAMENTO_RECUSADO',
  PAGAMENTO_FALHA_COMUNICACAO = 'PAGAMENTO_FALHA_COMUNICACAO',
  PAGAMENTO_ESTORNADO = 'PAGAMENTO_ESTORNADO',
}
