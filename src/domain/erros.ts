/** Erros de domínio declaram a natureza. A API traduz para HTTP e JSON padrão. */
export enum NaturezaErro {
  REQUISICAO_INVALIDA = 'REQUISICAO_INVALIDA', // 400
  VALIDACAO = 'VALIDACAO', // 422
  REGRA_DE_NEGOCIO = 'REGRA_DE_NEGOCIO', // 422
  NAO_ENCONTRADO = 'NAO_ENCONTRADO', // 404
  CONFLITO = 'CONFLITO', // 409
  NAO_AUTENTICADO = 'NAO_AUTENTICADO', // 401
  PROIBIDO = 'PROIBIDO', // 403
  PAGAMENTO_RECUSADO = 'PAGAMENTO_RECUSADO', // 402
  LIMITE_EXCEDIDO = 'LIMITE_EXCEDIDO', // 429
  DEPENDENCIA_INDISPONIVEL = 'DEPENDENCIA_INDISPONIVEL', // 503
}

export interface DetalheErro {
  field: string;
  issue: string;
}

export class ErroDeDominio extends Error {
  constructor(
    public readonly natureza: NaturezaErro,
    /** Código estável e legível por máquina, ex.: ESTOQUE_INSUFICIENTE. */
    public readonly codigo: string,
    mensagem: string,
    public readonly detalhes: DetalheErro[] = [],
  ) {
    super(mensagem);
    this.name = 'ErroDeDominio';
  }
}

export const naoEncontrado = (recurso: string, id: number | string) =>
  new ErroDeDominio(
    NaturezaErro.NAO_ENCONTRADO,
    `${recurso.toUpperCase()}_NAO_ENCONTRADO`,
    `${recurso} ${id} não encontrado(a).`,
  );

export const proibido = (mensagem = 'Seu perfil não tem permissão para esta operação.') =>
  new ErroDeDominio(NaturezaErro.PROIBIDO, 'ACESSO_NEGADO', mensagem);
