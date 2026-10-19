# Teste de carga — horário de pico

Gerado por `npm run test:carga` em 2026-10-19T05:15:51.393Z · Node v22.22.0 · linux/x64 · 15 s por cenário.

API em execução local com SQLite em memória (sql.js), mesmas migrations e seed da aplicação. O estoque da unidade 1 foi
elevado para 1.000.000 unidades apenas neste ambiente de teste, para medir desempenho sem
esbarrar na regra de estoque (validada à parte no teste de concorrência).

- **A — Capacidade:** conexões sem limite de taxa; mede o máximo de requisições por segundo de **uma** instância. Meta: nenhuma falha.
- **B — Pico projetado ×10:** estimativa de pico da rede = 30 unidades × 4 pedidos/min ≈ 2 pedidos/s e ≈ 20 consultas de
  cardápio/s; o cenário aplica 10 vezes isso (20 pedidos/s + 200 consultas/s) ao mesmo tempo. Meta: p99 ≤ 200 ms na leitura e ≤ 500 ms na criação de pedidos.

| Cenário | Conexões | Requisições | Req/s | p50 (ms) | p90 (ms) | p99 (ms) | Meta p99 (ms) | Não-2xx/erros | Resultado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| A1 Capacidade — leitura do cardápio | 50 | 9600 | 640 | 73 | 95 | 148 | 0 erros | 0 | Aprovado |
| A2 Capacidade — criação de pedidos | 20 | 2620 | 175 | 112 | 138 | 185 | 0 erros | 0 | Aprovado |
| B Pico ×10 — leitura do cardápio (200/s) | 20 | 3024 | 202 | 21 | 53 | 96 | ≤ 200 | 0 | Aprovado |
| B Pico ×10 — criação de pedidos (20/s) | 5 | 300 | 20 | 32 | 66 | 233 | ≤ 500 | 0 | Aprovado |

## Consistência após a carga

| Verificação | Valor |
|---|---:|
| Respostas 201 medidas pelo autocannon | 2920 |
| Pedidos gravados no banco (inclui aquecimento e requisições em andamento ao fim de cada cenário) | 3034 |
| Unidades baixadas do estoque (tapioca) | 3034 |
| Registros PEDIDO_CRIADO na auditoria | 3034 |
| **Resultado** | **Consistente** |
