import 'dotenv/config';

/** Configuração centralizada. Nenhuma outra camada lê process.env. */
const inteiro = (nome: string, padrao: number): number => {
  const valor = process.env[nome];
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(`Variável de ambiente ${nome} deve ser numérica.`);
  return n;
};

const JWT_SECRET_PADRAO = 'segredo-apenas-para-desenvolvimento-local-troque-em-producao';

export const ambiente = {
  porta: inteiro('PORT', 3000),
  bancoCaminho: process.env.DATABASE_PATH || 'data/raizes.sqlite',
  executarMigrations: (process.env.DB_MIGRATIONS_RUN ?? 'true') !== 'false',
  jwtSegredo: process.env.JWT_SECRET || JWT_SECRET_PADRAO,
  jwtSegredoEhPadrao: !process.env.JWT_SECRET,
  jwtExpiraEmSegundos: inteiro('JWT_EXPIRES_IN', 3600),
  gatewayLatenciaMs: inteiro('PAYMENT_GATEWAY_LATENCY_MS', 150),
  gatewayTimeoutMs: inteiro('PAYMENT_GATEWAY_TIMEOUT_MS', 2000),
  gatewayTentativasExtras: inteiro('PAYMENT_GATEWAY_RETRIES', 1),
  corsOrigens: (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim()),
  loginMaxTentativas: inteiro('LOGIN_MAX_TENTATIVAS', 5),
  loginBloqueioMinutos: inteiro('LOGIN_BLOQUEIO_MINUTOS', 15),
};
