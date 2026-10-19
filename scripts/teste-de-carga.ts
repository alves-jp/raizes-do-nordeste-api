/**
 * Teste de carga do horário de pico.
 *
 * npm run test:carga            15 s por cenário
 * DURACAO=5 npm run test:carga  execução rápida
 *
 * Sobe a API em memória, eleva o estoque de Recife e mede dois cenários com autocannon:
 * capacidade máxima de leitura e escrita, e pico projetado 10x (20 pedidos/s e 200 leituras/s).
 * Ao final confere a consistência e grava o relatório em docs/evidencias/teste-de-carga.md.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { AddressInfo } from 'net';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { configurarApp } from '../src/api/http/configurar-app';
import { AppModule } from '../src/app.module';
import { semearDadosIniciais, SENHA_PADRAO_SEED } from '../src/infrastructure/database/seeds/dados-iniciais';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const autocannon = require('autocannon');

const DURACAO = Number(process.env.DURACAO ?? 15);
const ESTOQUE_DE_CARGA = 1_000_000;

interface Meta {
  /** Latência máxima aceitável no percentil 99 (ausente nos cenários de capacidade). */
  p99Ms?: number;
}

interface Resultado {
  cenario: string;
  conexoes: number;
  duracao: number;
  requisicoes: number;
  reqPorSegundo: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
  erros: number;
  respostas2xx: number;
  naoSucesso: number;
  meta: Meta;
  aprovado: boolean;
}

function executar(opcoes: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    autocannon(opcoes, (erro: Error | null, resultado: unknown) => (erro ? reject(erro) : resolve(resultado)));
  });
}

function resumir(cenario: string, r: any, conexoes: number, meta: Meta): Resultado {
  const naoSucesso = r.non2xx + r.errors + r.timeouts;
  return {
    cenario,
    conexoes,
    duracao: DURACAO,
    requisicoes: r.requests.total,
    reqPorSegundo: Math.round(r.requests.average),
    p50: r.latency.p50,
    p90: r.latency.p90,
    p99: r.latency.p99,
    max: r.latency.max,
    erros: r.errors + r.timeouts,
    respostas2xx: r['2xx'],
    naoSucesso,
    meta,
    aprovado: naoSucesso === 0 && (meta.p99Ms === undefined || r.latency.p99 <= meta.p99Ms),
  };
}

async function main() {
  Logger.overrideLogger(false);
  const app = await NestFactory.create(AppModule.configurar({ bancoCaminho: null }), { logger: false });
  configurarApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const dataSource = app.get(DataSource);
  await semearDadosIniciais(dataSource);
  await dataSource.query(`UPDATE estoques SET quantidade = ? WHERE unidade_id = 1`, [ESTOQUE_DE_CARGA]);

  const login = async (email: string) => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, senha: SENHA_PADRAO_SEED }),
    });
    return ((await res.json()) as { accessToken: string }).accessToken;
  };
  const totem = await login('totem01.recife@raizesdonordeste.com.br');

  const leitura = { url: `${base}/unidades/1/cardapio`, method: 'GET' };
  const escrita = {
    url: `${base}/pedidos`,
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${totem}` },
    body: JSON.stringify({
      unidadeId: 1,
      canalPedido: 'TOTEM',
      formaPagamento: 'PIX',
      itens: [
        { produtoId: 1, quantidade: 1 },
        { produtoId: 9, quantidade: 1 },
      ],
    }),
  };

  const resultados: Resultado[] = [];
  console.log(`Teste de carga — ${DURACAO}s por cenário (API em ${base})\n`);

  console.log('Aquecimento (2 s, não medido)…');
  await Promise.all([executar({ ...leitura, connections: 10, duration: 2 }), executar({ ...escrita, connections: 2, duration: 2 })]);

  console.log('A1 Capacidade — leitura do cardápio (50 conexões)…');
  resultados.push(resumir('A1 Capacidade — leitura do cardápio', await executar({ ...leitura, connections: 50, duration: DURACAO }), 50, {}));

  console.log('A2 Capacidade — criação de pedidos pelo Totem (20 conexões)…');
  resultados.push(resumir('A2 Capacidade — criação de pedidos', await executar({ ...escrita, connections: 20, duration: DURACAO }), 20, {}));

  console.log('B  Pico projetado ×10 — 200 leituras/s + 20 pedidos/s ao mesmo tempo…');
  const [picoLeitura, picoEscrita] = await Promise.all([
    executar({ ...leitura, connections: 20, overallRate: 200, duration: DURACAO }),
    executar({ ...escrita, connections: 5, overallRate: 20, duration: DURACAO }),
  ]);
  resultados.push(resumir('B Pico ×10 — leitura do cardápio (200/s)', picoLeitura, 20, { p99Ms: 200 }));
  resultados.push(resumir('B Pico ×10 — criação de pedidos (20/s)', picoEscrita, 5, { p99Ms: 500 }));
  // Requisições em andamento quando o autocannon encerra ainda são concluídas pelo servidor.
  await new Promise((r) => setTimeout(r, 1000));

  // Consistência após a carga: cada pedido gravado baixou o estoque e gerou auditoria, sem perdas nem duplicidades.
  const [{ pedidos }] = await dataSource.query(`SELECT COUNT(*) AS pedidos FROM pedidos WHERE unidade_id = 1`);
  const [{ saldo }] = await dataSource.query(`SELECT quantidade AS saldo FROM estoques WHERE unidade_id = 1 AND produto_id = 1`);
  const [{ auditados }] = await dataSource.query(`SELECT COUNT(*) AS auditados FROM logs_auditoria WHERE acao = 'PEDIDO_CRIADO'`);
  const pedidosCriados = resultados.filter((r) => r.cenario.includes('pedidos')).reduce((s, r) => s + r.respostas2xx, 0);
  const consistencia = {
    respostas201Medidas: pedidosCriados,
    pedidosNoBanco: Number(pedidos),
    baixaDeEstoque: ESTOQUE_DE_CARGA - Number(saldo),
    registrosDeAuditoria: Number(auditados),
  };
  const consistente =
    consistencia.pedidosNoBanco >= pedidosCriados &&
    consistencia.baixaDeEstoque === consistencia.pedidosNoBanco &&
    consistencia.registrosDeAuditoria === consistencia.pedidosNoBanco;
  await app.close();

  console.table(
    resultados.map((r) => ({
      cenário: r.cenario,
      conexões: r.conexoes,
      requisições: r.requisicoes,
      'req/s': r.reqPorSegundo,
      'p50 ms': r.p50,
      'p99 ms': r.p99,
      'meta p99': r.meta.p99Ms ?? '—',
      'não-2xx/erros': r.naoSucesso,
      resultado: r.aprovado ? 'OK' : 'FALHOU',
    })),
  );
  console.log('Consistência:', consistencia, consistente ? 'OK' : 'FALHOU');

  const linhas = resultados
    .map(
      (r) =>
        `| ${r.cenario} | ${r.conexoes} | ${r.requisicoes} | ${r.reqPorSegundo} | ${r.p50} | ${r.p90} | ${r.p99} | ${r.meta.p99Ms ? `≤ ${r.meta.p99Ms}` : '0 erros'} | ${r.naoSucesso} | ${r.aprovado ? 'Aprovado' : 'Reprovado'} |`,
    )
    .join('\n');
  const relatorio = `# Teste de carga — horário de pico

Gerado por \`npm run test:carga\` em ${new Date().toISOString()} · Node ${process.version} · ${process.platform}/${process.arch} · ${DURACAO} s por cenário.

API em execução local com SQLite em memória (sql.js), mesmas migrations e seed da aplicação. O estoque da unidade 1 foi
elevado para ${ESTOQUE_DE_CARGA.toLocaleString('pt-BR')} unidades apenas neste ambiente de teste, para medir desempenho sem
esbarrar na regra de estoque (validada à parte no teste de concorrência).

- **A — Capacidade:** conexões sem limite de taxa; mede o máximo de requisições por segundo de **uma** instância. Meta: nenhuma falha.
- **B — Pico projetado ×10:** estimativa de pico da rede = 30 unidades × 4 pedidos/min ≈ 2 pedidos/s e ≈ 20 consultas de
  cardápio/s; o cenário aplica 10 vezes isso (20 pedidos/s + 200 consultas/s) ao mesmo tempo. Meta: p99 ≤ 200 ms na leitura e ≤ 500 ms na criação de pedidos.

| Cenário | Conexões | Requisições | Req/s | p50 (ms) | p90 (ms) | p99 (ms) | Meta p99 (ms) | Não-2xx/erros | Resultado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
${linhas}

## Consistência após a carga

| Verificação | Valor |
|---|---:|
| Respostas 201 medidas pelo autocannon | ${consistencia.respostas201Medidas} |
| Pedidos gravados no banco (inclui aquecimento e requisições em andamento ao fim de cada cenário) | ${consistencia.pedidosNoBanco} |
| Unidades baixadas do estoque (tapioca) | ${consistencia.baixaDeEstoque} |
| Registros PEDIDO_CRIADO na auditoria | ${consistencia.registrosDeAuditoria} |
| **Resultado** | **${consistente ? 'Consistente' : 'Inconsistente'}** |
`;
  writeFileSync(join(__dirname, '..', 'docs', 'evidencias', 'teste-de-carga.md'), relatorio);
  writeFileSync(join(__dirname, '..', 'docs', 'evidencias', 'teste-de-carga.json'), JSON.stringify({ duracao: DURACAO, resultados, consistencia }, null, 2) + '\n');
  console.log('\nRelatório: docs/evidencias/teste-de-carga.md');
  process.exit(resultados.every((r) => r.aprovado) && consistente ? 0 : 1);
}

void main();
