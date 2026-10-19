# Raízes do Nordeste: API Back-end

API REST da **Rede Raízes do Nordeste**, rede de lanchonetes de culinária nordestina que nasceu em um bairro tradicional de Recife e hoje
tem unidades próprias e franqueadas em várias cidades, desenvolvida para o **Projeto Multidisciplinar (Trilha Back-End)** do curso de
Análise e Desenvolvimento de Sistemas da UNINTER, a partir do estudo de caso oficial da disciplina.

Uma plataforma única de pedidos atende os canais **APP, TOTEM, BALCÃO, PICKUP e WEB**, com cardápio e estoque por unidade, pagamento por
provedor externo **simulado (mock)**, unidades com cozinha completa ou formato reduzido e receitas regionais, relatórios da matriz (vendas por
unidade e região, metas, produtos mais vendidos), programa de fidelidade "Cliente Raiz" com níveis por frequência, campanhas segmentadas,
trilha de auditoria e controles de LGPD.

| | |
|---|---|
| **Repositório** | https://github.com/alves-jp/raizes-do-nordeste-api |
| **Swagger (local, com a API rodando)** | http://localhost:3000/docs |
| **Swagger público (GitHub Pages)** | https://alves-jp.github.io/raizes-do-nordeste-api/swagger/ |
| **OpenAPI (JSON)** | [`docs/openapi.json`](docs/openapi.json) · local: http://localhost:3000/docs-json |
| **Coleção Postman** | [`postman/raizes-do-nordeste.postman_collection.json`](postman/raizes-do-nordeste.postman_collection.json) + [`postman/local.postman_environment.json`](postman/local.postman_environment.json) |
| **Diagramas (casos de uso, DER, classes, sequência, implantação)** | [`docs/diagramas/`](docs/diagramas) |
| **Teste de carga (horário de pico)** | [`docs/evidencias/teste-de-carga.md`](docs/evidencias/teste-de-carga.md) |

> **Fluxo crítico entregue (Fluxo A):** `POST /pedidos` → `POST /pagamentos` (mock) → `PATCH /pedidos/{id}/status` (EM_PREPARO → PRONTO → ENTREGUE),
> com baixa de estoque, idempotência, pontos de fidelidade, cancelamento com estorno e auditoria. O Fluxo B (estoque por unidade) também está implementado.

---

## 1. Requisitos

| Item | Versão |
|---|---|
| Node.js | **20 ou superior** (testado com 20 e 22) |
| npm | 10+ (vem com o Node) |
| Banco de dados | **nenhuma instalação** — SQLite embarcado (via `sql.js`, WebAssembly), salvo em `data/raizes.sqlite` |
| Sistema operacional | Windows, macOS ou Linux (sem dependências nativas) |

Principais bibliotecas: NestJS 11, TypeORM 0.3, class-validator, @nestjs/jwt (JWT), bcryptjs, @nestjs/swagger, helmet, Jest + Supertest, Newman.

## 2. Como executar (passo a passo)

```bash
# 1. Clonar o repositório
git clone https://github.com/alves-jp/raizes-do-nordeste-api.git
cd raizes-do-nordeste-api

# 2. Instalar as dependências
npm install

# 3. Configurar as variáveis de ambiente (opcional: todos os valores têm padrão para desenvolvimento)
cp .env.example .env          # Windows (PowerShell): Copy-Item .env.example .env

# 4. Criar o banco, aplicar as migrations e carregar o seed (dados de demonstração)
npm run setup

# 5. Iniciar a API
npm run start                 # ou: npm run start:dev  (recarrega ao salvar)
```

A API sobe em **http://localhost:3000** e a documentação interativa em **http://localhost:3000/docs**.
Verificação rápida: `GET http://localhost:3000/health` → `{"status":"ok","banco":"ok",...}`.

> Execute `npm run setup` com a API **parada** (o arquivo SQLite é aberto por um processo por vez).
> Para voltar ao estado inicial a qualquer momento: pare a API e rode `npm run db:reset`.
> **Atualizou o projeto e já tinha um banco criado?** Rode `npm run db:reset`: a migration nova é aplicada sozinha, mas o seed só é inserido em banco vazio.

### Variáveis de ambiente (`.env.example`)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `DATABASE_PATH` | `data/raizes.sqlite` | Arquivo do banco (criado automaticamente) |
| `DB_MIGRATIONS_RUN` | `true` | Aplica migrations pendentes ao iniciar |
| `JWT_SECRET` | *(segredo de dev)* | Segredo de assinatura do JWT — **troque fora do ambiente local** |
| `JWT_EXPIRES_IN` | `3600` | Validade do token (segundos) |
| `PAYMENT_GATEWAY_LATENCY_MS` | `150` | Latência simulada do provedor de pagamento |
| `PAYMENT_GATEWAY_TIMEOUT_MS` | `2000` | Timeout da chamada ao provedor |
| `PAYMENT_GATEWAY_RETRIES` | `1` | Novas tentativas em falha transitória |
| `CORS_ORIGINS` | `*` | Origens liberadas no CORS |
| `LOGIN_MAX_TENTATIVAS` / `LOGIN_BLOQUEIO_MINUTOS` | `5` / `15` | Proteção contra força bruta no login |

### Scripts

| Comando | O que faz |
|---|---|
| `npm run setup` | Aplica migrations e insere o seed (idempotente) |
| `npm run db:reset` | Apaga o banco e roda o setup do zero |
| `npm run db:migrate` / `npm run db:revert` | Aplica / desfaz migrations (CLI do TypeORM) |
| `npm run start` · `start:dev` · `build` + `start:prod` | Executa a API |
| `npm test` | Testes automatizados (unitários + e2e com banco em memória) |
| `npm run test:postman` | Executa a coleção Postman via Newman (API precisa estar rodando) |
| `npm run test:carga` | Teste de carga do horário de pico (sobe a API em memória; `DURACAO=5` para rodar rápido) |
| `npm run openapi:export` | Regera `docs/openapi.json` a partir do código |

## 3. Usuários de teste (seed)

Senha de **todos**: `Raizes@2026`

| Perfil | E-mail | Unidade | Observação |
|---|---|---|---|
| ADMIN (matriz) | admin@raizesdonordeste.com.br | — | acesso à rede toda |
| GERENTE | gerente.recife@raizesdonordeste.com.br | 1 — Recife | |
| ATENDENTE | atendente.recife@raizesdonordeste.com.br | 1 — Recife | pedidos de BALCÃO |
| COZINHA | cozinha.recife@raizesdonordeste.com.br | 1 — Recife | preparo |
| TOTEM | totem01.recife@raizesdonordeste.com.br | 1 — Recife | conta do dispositivo de autoatendimento |
| GERENTE | gerente.fortaleza@raizesdonordeste.com.br | 2 — Fortaleza | usado no teste de acesso a outra unidade (403) |
| CLIENTE | ana.souza@email.com | — | id 7 · fidelidade e marketing consentidos · 120 pontos · data de nascimento 2003-05-14 |
| CLIENTE | bruno.costa@email.com | — | id 8 · **não** consentiu com fidelidade nem marketing |

Dados do seed:
- **3 unidades:** Recife/PE (própria, a primeira da rede, cozinha completa), Fortaleza/CE (franquia, cozinha completa) e Belo Horizonte/MG
  (franquia em **formato reduzido**), cada uma com meta mensal de faturamento.
- **15 produtos:** tapiocas, cuscuz, baião de dois, arrumadinho de charque (só em Recife), bolo de macaxeira, café da manhã completo e itens
  juninos sazonais; 5 deles exigem cozinha completa e por isso não estão no cardápio de BH. Variações regionais da receita (ex.: cuscuz com
  manteiga de garrafa em Recife e com queijo coalho em Fortaleza).
- Estoque por unidade (Bolo de rolo com 4 unidades e Cartola zerada em Recife, para demonstrar as regras).
- **5 campanhas:** `APPRAIZ10` (só no App), `FORTALEZA15` (só em Fortaleza), `RAIZPRATA12` (segmentada: nível PRATA ou superior),
  `UNIRAIZES` (segmentada: 18 a 25 anos) e `ARRAIA2026` (encerrada).

## 4. Como testar

### 4.1 Testes automatizados (recomendado)

```bash
npm test
```

**117 testes** (Jest + Supertest): regras de domínio isoladas (unitários) e a API completa de ponta a ponta, cada suíte com banco SQLite
**em memória**, migrations e seed próprios, sem tocar no banco de desenvolvimento. Cobrem o fluxo crítico, idempotência, pagamento
aprovado/recusado/indisponível, estorno, multicanalidade, sazonalidade, formatos de unidade, relatórios, níveis de fidelidade, campanhas
segmentadas, autenticação/autorização, LGPD, auditoria e **concorrência de pico** (12 pedidos simultâneos de canais diferentes pelo último
estoque, reenvios simultâneos com a mesma `Idempotency-Key` e pagamentos simultâneos do mesmo pedido).

### 4.2 Coleção Postman (plano de testes T01–T45)

1. Rode a API com o seed aplicado (`npm run setup` e `npm run start`).
2. No Postman: **Import** → selecione `postman/raizes-do-nordeste.postman_collection.json` e `postman/local.postman_environment.json`.
3. Selecione o environment **"Raízes do Nordeste - Local"**.
4. Execute a coleção **inteira, na ordem** (Collection Runner). Os tokens e IDs são encadeados automaticamente por variáveis.

Ou pela linha de comando (sem abrir o Postman):

```bash
npm run test:postman
```

A coleção tem **52 requisições** em 11 pastas (Autenticação, Cardápio, Pedidos, Pagamento, Status, Multicanal, Estoque, Fidelidade e LGPD,
Auditoria, Erros, Estudo de caso) com **45 cenários numerados** (25 positivos e 20 negativos), todos com asserções automáticas. Pode ser executada várias vezes seguidas.
Evidência de execução: [`docs/evidencias/newman-execucao.txt`](docs/evidencias/newman-execucao.txt).

### 4.3 Teste de carga (horário de pico)

```bash
npm run test:carga            # 15 s por cenário · DURACAO=5 npm run test:carga para uma execução rápida
```

Sobe a API em memória e usa o **autocannon** em dois tipos de cenário: **capacidade** (máximo de requisições/s de uma instância na leitura
do cardápio e na criação de pedidos, sem erros) e **pico projetado ×10** (200 consultas de cardápio/s + 20 pedidos/s ao mesmo tempo, com
metas de p99 ≤ 200 ms e ≤ 500 ms). Ao final confere que pedidos gravados = baixas de estoque = registros de auditoria. Resultado:
[`docs/evidencias/teste-de-carga.md`](docs/evidencias/teste-de-carga.md).

### 4.4 Swagger

Em http://localhost:3000/docs: faça `POST /auth/login`, clique em **Authorize**, cole o `accessToken` e use **Try it out**.

### 4.5 Tokens de teste do pagamento (mock)

| `tokenPagamento` | Resultado | HTTP |
|---|---|---|
| `tok_aprovado` (padrão) | APROVADO → pedido `PAGO` | 201 |
| `tok_recusado_saldo` | RECUSADO (SALDO_INSUFICIENTE) → pedido `PAGAMENTO_RECUSADO` | 402 |
| `tok_recusado_antifraude` | RECUSADO (SUSPEITA_DE_FRAUDE) | 402 |
| `tok_gateway_instavel` | falha na 1ª chamada, aprovado na nova tentativa automática | 201 |
| `tok_gateway_indisponivel` | provedor não responde dentro do timeout → nada é cobrado | 503 |

## 5. Arquitetura e organização

Arquitetura em camadas com separação explícita de responsabilidades:

```
src/
├── api/                    # Interface: controllers REST, DTOs (validação), guard JWT/perfis,
│   ├── controllers/        #   filtro de erros (JSON padrão), middleware de requestId, Swagger
│   ├── dtos/
│   ├── http/
│   ├── seguranca/
│   └── documentacao/
├── application/            # Casos de uso: pedidos, pagamentos (+ resiliência), estoque, fidelidade,
│   ├── pedidos/            #   usuários/LGPD, catálogo, campanhas, relatórios, auth, auditoria
│   ├── pagamentos/         #   gateway-pagamento.port.ts → porta (interface) do provedor externo
│   └── ...
├── domain/                 # Regras de negócio puras (sem framework/banco): máquina de status,
│   ├── pedido/             #   canal × perfil, cálculo do pedido, fidelidade, campanhas,
│   ├── fidelidade/         #   formato da unidade e regiões, idade, sazonalidade, mascaramento LGPD, enums e erros
│   └── ...
├── infrastructure/         # Detalhes técnicos: entidades TypeORM, migrations, seed, unidade de trabalho
│   ├── database/           #   (transações), gateway de pagamento mock, hash bcrypt, limitador de login,
│   ├── pagamento/          #   configuração (.env)
│   └── seguranca/
├── app.module.ts           # Composição (injeção de dependências)
└── main.ts
test/
├── unit/                   # Regras de domínio
└── e2e/                    # API completa (banco em memória), incluindo concorrência de pico
scripts/                    # Exportação do OpenAPI e teste de carga
postman/                    # Coleção + environment
docs/                       # Diagramas, OpenAPI, Swagger estático e evidências
```

- O **domínio** não conhece HTTP: lança `ErroDeDominio` com uma *natureza* (validação, conflito, não encontrado…) e o filtro global converte em status code + JSON padrão.
- A aplicação depende da **porta** `GatewayDePagamento`; o adaptador `GatewayDePagamentoMock` é ligado no `AppModule`; trocar por um PSP real é mudar uma linha.
- Toda escrita roda em uma **unidade de trabalho** (transação); a auditoria é gravada na mesma transação da ação.

## 6. Endpoints

| Recurso | Método e rota | Acesso |
|---|---|---|
| Auth | `POST /auth/login` | público |
| Usuários | `POST /usuarios` (cadastro de cliente) | público |
| | `POST /usuarios/funcionarios` · `GET /usuarios` · `GET /usuarios/{id}` (auditado) | ADMIN |
| | `GET /usuarios/me` | autenticado |
| | `PATCH /usuarios/me` (telefone e data de nascimento opcionais) | CLIENTE |
| | `GET /usuarios/me/consentimentos` · `PUT /usuarios/me/consentimentos/{finalidade}` · `GET /usuarios/me/dados` · `DELETE /usuarios/me` | CLIENTE |
| Unidades | `GET /unidades` · `GET /unidades/{id}` · `GET /unidades/{id}/cardapio` | público |
| | `PUT /unidades/{id}/cardapio/{produtoId}` | GERENTE (própria unidade), ADMIN |
| Produtos | `GET /produtos` · `GET /produtos/{id}` | público |
| | `POST /produtos` · `PATCH /produtos/{id}` | ADMIN |
| Estoque | `GET /estoque?unidadeId=` | GERENTE, ATENDENTE, COZINHA (própria unidade), ADMIN |
| | `POST /estoque/movimentacoes` · `GET /estoque/movimentacoes?unidadeId=` | GERENTE (própria unidade), ADMIN |
| Pedidos | `POST /pedidos` | CLIENTE, TOTEM, ATENDENTE, GERENTE |
| | `GET /pedidos?canalPedido=&status=&unidadeId=&dataInicio=&dataFim=&page=&limit=` | autenticado (escopo automático) |
| | `GET /pedidos/resumo-por-canal` | GERENTE, ADMIN |
| | `GET /pedidos/{id}` · `GET /pedidos/{id}/pagamentos` | autenticado (escopo) |
| | `PATCH /pedidos/{id}/status` | COZINHA, ATENDENTE, GERENTE, ADMIN (conforme a transição) |
| | `POST /pedidos/{id}/cancelamento` | CLIENTE, TOTEM, ATENDENTE, GERENTE, ADMIN (conforme o status) |
| Pagamentos | `POST /pagamentos` · `GET /pagamentos/{id}` | CLIENTE, TOTEM, ATENDENTE, GERENTE, ADMIN |
| Fidelidade | `GET /fidelidade/saldo` · `GET /fidelidade/extrato` | CLIENTE |
| Campanhas | `GET /campanhas` | público |
| | `POST /campanhas` | ADMIN |
| Relatórios | `GET /relatorios/vendas?agruparPor=UNIDADE\|REGIAO&de=&ate=&unidadeId=` · `GET /relatorios/produtos-mais-vendidos?limite=` | ADMIN (rede), GERENTE (própria unidade) |
| Auditoria | `GET /auditoria` | ADMIN (rede), GERENTE (própria unidade) |
| Saúde | `GET /health` | público |

Convenções: URLs no plural, IDs no path, paginação `?page=1&limit=10` (máx. 100) com `{ data, meta: { page, limit, total, totalPages } }`,
valores monetários em reais (armazenados em centavos), datas em ISO 8601 (UTC), header opcional `Idempotency-Key` em `POST /pedidos` e `POST /pagamentos`
e header `X-Request-Id` em todas as respostas.

### Padrão de erro (todas as falhas)

```json
{
  "error": "ESTOQUE_INSUFICIENTE",
  "message": "Não há quantidade suficiente em estoque para um ou mais itens.",
  "details": [{ "field": "itens[0].quantidade", "issue": "Bolo de rolo (fatia): solicitado 10, disponível 4" }],
  "timestamp": "2026-10-17T15:04:05.000Z",
  "path": "/pedidos",
  "requestId": "9b2f7c1e-3a4d-4b1e-9f0a-1c2d3e4f5a6b"
}
```

| Status | Quando |
|---|---|
| 200 / 201 / 204 | sucesso / criado / sem conteúdo |
| 400 | JSON malformado, parâmetro de rota inválido, `Idempotency-Key` inválida |
| 401 | sem token, token inválido/expirado, credenciais inválidas |
| 402 | pagamento recusado pelo provedor |
| 403 | perfil sem permissão ou unidade fora do escopo |
| 404 | recurso inexistente (ou pedido de outro cliente) |
| 409 | conflito de estado: estoque insuficiente, transição inválida, pedido já pago, e-mail duplicado |
| 422 | validação de campos e regras de negócio (canal incompatível, fora de temporada, produto que exige cozinha completa, campanha inválida…) |
| 429 | muitas tentativas de login |
| 503 | provedor de pagamento indisponível (com `Retry-After`) |

## 7. Regras de negócio principais

- **Multicanalidade:** `canalPedido` é obrigatório e registrado no pedido; cada perfil só usa os canais que opera (CLIENTE: APP/WEB/PICKUP · TOTEM: TOTEM · ATENDENTE/GERENTE: BALCAO). Filtro `GET /pedidos?canalPedido=` e consolidação em `GET /pedidos/resumo-por-canal`.
- **Unidades diferentes, padrão único:** cada unidade tem formato `COMPLETA` ou `REDUZIDA`; produto com `exigeCozinhaCompleta` não entra no cardápio (nem em pedidos) de unidade reduzida. O produto é padronizado pela matriz, e cada unidade pode registrar a **variação regional** da receita no seu cardápio.
- **Pedido:** valida unidade, cardápio da unidade, formato da unidade, item pausado/inativo e **temporada** (itens juninos só em junho/julho); itens repetidos são consolidados; limite de 20 por item. O estoque é baixado na mesma transação; se faltar qualquer item, nada é baixado (409 com todos os itens faltantes). Pedidos concorrentes nunca vendem além do saldo.
- **Máquina de status:** `AGUARDANDO_PAGAMENTO → PAGO → EM_PREPARO → PRONTO → ENTREGUE`, com `PAGAMENTO_RECUSADO` e `CANCELADO`. `PAGO` só vem do pagamento; transição fora de ordem → 409; perfil errado → 403.
- **Pagamento (mock):** tentativa registrada antes da chamada; chamada externa fora da transação, com timeout e nova tentativa em falha transitória; payload do provedor guardado para conciliação; idempotência por `Idempotency-Key`; o back-end nunca recebe dados de cartão (token do SDK do provedor).
- **Cancelamento:** cliente/totem antes do pagamento; atendente até PAGO; gerente/admin até PRONTO. Se pago, estorna no provedor, devolve o estoque e desfaz os pontos.
- **Fidelidade "Cliente Raiz":** 1 ponto a cada R$ 2,00 pagos, só com consentimento FIDELIDADE vigente; resgate mínimo de 50 pontos, até 30% do pedido. **Níveis por frequência de consumo** (pedidos pagos em 90 dias): BRONZE (0–3), PRATA (4–9) e OURO (10+); o ponto vale R$ 0,10, R$ 0,12 e R$ 0,15, com desconto progressivo.
- **Campanhas:** desconto percentual por código, com vigência, valor mínimo e restrição opcional por unidade e/ou canal. **Campanhas segmentadas** por nível de fidelidade e/ou faixa etária só valem para cliente identificado com consentimento MARKETING vigente.
- **Relatórios da matriz:** vendas e financeiro (bruto, descontos, líquido, ticket médio, estornos) por unidade ou por região do IBGE, percentual da meta mensal da unidade e ranking de produtos mais vendidos; gerente vê só a própria unidade; toda consulta é auditada.

## 8. Segurança e LGPD

- Senhas com **bcrypt**; o hash nunca é devolvido. Autenticação **JWT** (1 h) e verificação de usuário ativo a cada requisição.
- **RBAC** em todas as rotas (guard global, rotas públicas explícitas) + **escopo por unidade** nos casos de uso.
- **Minimização:** só nome, e-mail, telefone opcional e **data de nascimento opcional** (sem CPF/endereço). Listagens administrativas com e-mail/telefone mascarados e sem data de nascimento.
- **Data de nascimento para segmentação:** só aceita com consentimento MARKETING, apenas de maiores de 18 anos (LGPD, art. 14), usada somente para calcular a faixa etária na hora do pedido (a idade não é gravada nem auditada) e **apagada automaticamente** quando o consentimento MARKETING é revogado.
- **Consentimento** por finalidade (FIDELIDADE, MARKETING), com versão do termo, origem e histórico (concessão e revogação).
- **Direitos do titular:** exportação dos dados (`GET /usuarios/me/dados`) e exclusão por **anonimização** (`DELETE /usuarios/me`), preservando pedidos sem identificação (obrigação fiscal).
- **Auditoria** de ações sensíveis (login, acesso e alteração de dados pessoais, pedidos, status, pagamentos, estoque, cardápio, campanhas, relatórios) com autor, perfil, unidade, IP e `requestId`, sem dados pessoais em claro.
- Proteção contra força bruta no login (429), validação estrita (campos desconhecidos rejeitados), cabeçalhos de segurança (helmet), limite de 100 KB no corpo e erros 500 sem detalhes internos.

## 9. Decisões técnicas e limitações

- **SQLite via sql.js:** escolhido para que o projeto rode em qualquer máquina só com `npm install`. As escritas são serializadas pela unidade de trabalho (isolamento serializável). Para produção: PostgreSQL (trocar `type` em `opcoes-banco.ts` e gerar as migrations; entidades e serviços não mudam) e `SELECT ... FOR UPDATE`.
- **Pagamento síncrono no sandbox:** num PSP real o PIX seria confirmado por webhook assinado (HMAC), evolução documentada.
- **Escala e alta disponibilidade (proposta de implantação, `docs/diagramas/07-implantacao`):** API stateless (JWT) em várias instâncias atrás de balanceador com health check em `/health`, PostgreSQL com failover e réplica de leitura para os relatórios, Redis para cache do cardápio e limites, fila de eventos (outbox) para notificações e BI, observabilidade com `requestId`.
- **Proposta, não implementado:** refresh token/logout com revogação, expiração automática de pedidos não pagos (liberando estoque), webhook de pagamento, rate limiting global, cache do cardápio, controle de horário de funcionamento e relatórios em réplica de leitura.

## 10. Diagramas

| Diagrama | Arquivo |
|---|---|
| Casos de uso | [`docs/diagramas/01-casos-de-uso.png`](docs/diagramas/01-casos-de-uso.png) |
| DER — parte 1: rede, catálogo, cardápio, estoque e campanhas | [`docs/diagramas/02a-der-catalogo-estoque.svg`](docs/diagramas/02a-der-catalogo-estoque.svg) |
| DER — parte 2: usuários e LGPD, pedidos, pagamentos, fidelidade e auditoria | [`docs/diagramas/02b-der-pedidos-pagamentos.svg`](docs/diagramas/02b-der-pedidos-pagamentos.svg) |
| Classes — parte 1: rede, catálogo, estoque, pessoas e LGPD | [`docs/diagramas/03a-classes-catalogo-pessoas.svg`](docs/diagramas/03a-classes-catalogo-pessoas.svg) |
| Classes — parte 2: pedidos, pagamento, fidelidade, campanhas e auditoria | [`docs/diagramas/03b-classes-pedidos-pagamento.svg`](docs/diagramas/03b-classes-pedidos-pagamento.svg) |
| Sequência do fluxo crítico | [`docs/diagramas/04-sequencia-fluxo-critico.png`](docs/diagramas/04-sequencia-fluxo-critico.png) |
| Arquitetura em camadas | [`docs/diagramas/05-arquitetura-camadas.png`](docs/diagramas/05-arquitetura-camadas.png) |
| Estados do pedido | [`docs/diagramas/06-estados-pedido.png`](docs/diagramas/06-estados-pedido.png) |
| Implantação proposta (escala e alta disponibilidade) | [`docs/diagramas/07-implantacao.png`](docs/diagramas/07-implantacao.png) |

O DER e o diagrama de classes são divididos em duas partes para caber em página A4. Entidades/classes em cinza, marcadas «ref», são apenas referência e estão detalhadas na outra parte.

Os fontes PlantUML (`.puml`) e SVG estão na mesma pasta. O DER corresponde exatamente ao esquema gerado pelas migrations
`1792200000000-EsquemaInicial.ts` e `1792300000000-EvolucaoEstudoDeCaso.ts` (em `src/infrastructure/database/migrations/`).

---

Projeto acadêmico: UNINTER · Projeto Multidisciplinar (Trilha Back-End) · 2026.
