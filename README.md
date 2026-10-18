# Raízes do Nordeste: API Back-end

API REST da **Rede Raízes do Nordeste** (rede de lanchonetes de comida nordestina com unidades próprias e franquias), desenvolvida para o
**Projeto Multidisciplinar (Trilha Back-End)** do curso de Análise e Desenvolvimento de Sistemas da UNINTER.

Uma plataforma única de pedidos atende os canais **APP, TOTEM, BALCÃO, PICKUP e WEB**, com cardápio e estoque por unidade, pagamento por
provedor externo **simulado (mock)**, programa de fidelidade "Cliente Raiz", campanhas promocionais, trilha de auditoria e controles de LGPD.

| | |
|---|---|
| **Repositório** | https://github.com/alves-jp/raizes-do-nordeste-api |
| **Swagger (local, com a API rodando)** | http://localhost:3000/docs |
| **Swagger público (GitHub Pages)** | https://alves-jp.github.io/raizes-do-nordeste-api/swagger/ |
| **OpenAPI (JSON)** | [`docs/openapi.json`](docs/openapi.json) · local: http://localhost:3000/docs-json |
| **Coleção Postman** | [`postman/raizes-do-nordeste.postman_collection.json`](postman/raizes-do-nordeste.postman_collection.json) + [`postman/local.postman_environment.json`](postman/local.postman_environment.json) |
| **Diagramas (DER, casos de uso, classes, sequência)** | [`docs/diagramas/`](docs/diagramas) |

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
| `npm run openapi:export` | Regera `docs/openapi.json` a partir do código |

## 3. Usuários de teste (seed)

Senha de **todos**: `Raizes@2026`

| Perfil | E-mail | Unidade | Observação |
|---|---|---|---|
| ADMIN (matriz) | admin@raizesdonordeste.com.br | — | acesso à rede toda |
| GERENTE | gerente.salvador@raizesdonordeste.com.br | 1 — Salvador | |
| ATENDENTE | atendente.salvador@raizesdonordeste.com.br | 1 — Salvador | pedidos de BALCÃO |
| COZINHA | cozinha.salvador@raizesdonordeste.com.br | 1 — Salvador | preparo |
| TOTEM | totem01.salvador@raizesdonordeste.com.br | 1 — Salvador | conta do dispositivo de autoatendimento |
| GERENTE | gerente.fortaleza@raizesdonordeste.com.br | 2 — Fortaleza | usado no teste de acesso a outra unidade (403) |
| CLIENTE | ana.souza@email.com | — | id 7 · participa da fidelidade · 120 pontos iniciais |
| CLIENTE | bruno.costa@email.com | — | id 8 · **não** consentiu com a fidelidade |

Dados do seed: 3 unidades (Salvador/BA própria, Fortaleza/CE e Belo Horizonte/MG franquias), 13 produtos (tapiocas, cuscuz, baião de dois,
acarajé só em Salvador, itens juninos sazonais), cardápio e preços por unidade, estoque por unidade (Bolo de rolo com 4 unidades e Cartola
zerada em Salvador para demonstrar as regras) e 3 campanhas (`APPRAIZ10` só no App, `FORTALEZA15` só em Fortaleza e `ARRAIA2026` encerrada).

## 4. Como testar

### 4.1 Testes automatizados (recomendado)

```bash
npm test
```

**78 testes** (Jest + Supertest): regras de domínio isoladas (unitários) e a API completa de ponta a ponta, cada suíte com banco SQLite
**em memória**, migrations e seed próprios, sem tocar no banco de desenvolvimento. Cobrem o fluxo crítico, idempotência, pagamento
aprovado/recusado/indisponível, estorno, concorrência no estoque, multicanalidade, sazonalidade, autenticação/autorização, LGPD e auditoria.

### 4.2 Coleção Postman (plano de testes T01–T36)

1. Rode a API com o seed aplicado (`npm run setup` e `npm run start`).
2. No Postman: **Import** → selecione `postman/raizes-do-nordeste.postman_collection.json` e `postman/local.postman_environment.json`.
3. Selecione o environment **"Raízes do Nordeste - Local"**.
4. Execute a coleção **inteira, na ordem** (Collection Runner). Os tokens e IDs são encadeados automaticamente por variáveis.

Ou pela linha de comando (sem abrir o Postman):

```bash
npm run test:postman
```

A coleção tem **42 requisições** em 10 pastas (Autenticação, Cardápio, Pedidos, Pagamento, Status, Multicanal, Estoque, Fidelidade e LGPD,
Auditoria, Erros) com **36 cenários numerados** (20 positivos e 16 negativos), todos com asserções automáticas. Pode ser executada várias vezes seguidas.
Evidência de execução: [`docs/evidencias/newman-execucao.txt`](docs/evidencias/newman-execucao.txt).

### 4.3 Swagger

Em http://localhost:3000/docs: faça `POST /auth/login`, clique em **Authorize**, cole o `accessToken` e use **Try it out**.

### 4.4 Tokens de teste do pagamento (mock)

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
│   ├── pedidos/            #   usuários/LGPD, catálogo, campanhas, auth, auditoria
│   ├── pagamentos/         #   gateway-pagamento.port.ts → porta (interface) do provedor externo
│   └── ...
├── domain/                 # Regras de negócio puras (sem framework/banco): máquina de status,
│   ├── pedido/             #   canal × perfil, cálculo do pedido, fidelidade, campanhas,
│   ├── fidelidade/         #   sazonalidade, mascaramento LGPD, enums e erros de domínio
│   └── ...
├── infrastructure/         # Detalhes técnicos: entidades TypeORM, migrations, seed, unidade de trabalho
│   ├── database/           #   (transações), gateway de pagamento mock, hash bcrypt, limitador de login,
│   ├── pagamento/          #   configuração (.env)
│   └── seguranca/
├── app.module.ts           # Composição (injeção de dependências)
└── main.ts
test/
├── unit/                   # Regras de domínio
└── e2e/                    # API completa (banco em memória)
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
| 422 | validação de campos e regras de negócio (canal incompatível, fora de temporada, campanha inválida…) |
| 429 | muitas tentativas de login |
| 503 | provedor de pagamento indisponível (com `Retry-After`) |

## 7. Regras de negócio principais

- **Multicanalidade:** `canalPedido` é obrigatório e registrado no pedido; cada perfil só usa os canais que opera (CLIENTE: APP/WEB/PICKUP · TOTEM: TOTEM · ATENDENTE/GERENTE: BALCAO). Filtro `GET /pedidos?canalPedido=` e consolidação em `GET /pedidos/resumo-por-canal`.
- **Pedido:** valida unidade, cardápio da unidade, item pausado/inativo e **temporada** (itens juninos só em junho/julho); itens repetidos são consolidados; limite de 20 por item. O estoque é baixado na mesma transação; se faltar qualquer item, nada é baixado (409 com todos os itens faltantes). Pedidos concorrentes nunca vendem além do saldo.
- **Máquina de status:** `AGUARDANDO_PAGAMENTO → PAGO → EM_PREPARO → PRONTO → ENTREGUE`, com `PAGAMENTO_RECUSADO` e `CANCELADO`. `PAGO` só vem do pagamento; transição fora de ordem → 409; perfil errado → 403.
- **Pagamento (mock):** tentativa registrada antes da chamada; chamada externa fora da transação, com timeout e nova tentativa em falha transitória; payload do provedor guardado para conciliação; idempotência por `Idempotency-Key`; o back-end nunca recebe dados de cartão (token do SDK do provedor).
- **Cancelamento:** cliente/totem antes do pagamento; atendente até PAGO; gerente/admin até PRONTO. Se pago, estorna no provedor, devolve o estoque e desfaz os pontos.
- **Fidelidade "Cliente Raiz":** 1 ponto a cada R$ 2,00 pagos, só com consentimento FIDELIDADE vigente; resgate mínimo de 50 pontos, 1 ponto = R$ 0,10, até 30% do pedido.
- **Campanhas:** desconto percentual por código, com vigência, valor mínimo e restrição opcional por unidade e/ou canal.

## 8. Segurança e LGPD

- Senhas com **bcrypt**; o hash nunca é devolvido. Autenticação **JWT** (1 h) e verificação de usuário ativo a cada requisição.
- **RBAC** em todas as rotas (guard global, rotas públicas explícitas) + **escopo por unidade** nos casos de uso.
- **Minimização:** só nome, e-mail e telefone opcional (sem CPF/endereço). Listagens administrativas com e-mail/telefone mascarados.
- **Consentimento** por finalidade (FIDELIDADE, MARKETING), com versão do termo, origem e histórico (concessão e revogação).
- **Direitos do titular:** exportação dos dados (`GET /usuarios/me/dados`) e exclusão por **anonimização** (`DELETE /usuarios/me`), preservando pedidos sem identificação (obrigação fiscal).
- **Auditoria** de ações sensíveis (login, acesso a dados pessoais, pedidos, status, pagamentos, estoque, cardápio, campanhas) com autor, perfil, unidade, IP e `requestId`, sem dados pessoais em claro.
- Proteção contra força bruta no login (429), validação estrita (campos desconhecidos rejeitados), cabeçalhos de segurança (helmet), limite de 100 KB no corpo e erros 500 sem detalhes internos.

## 9. Decisões técnicas e limitações

- **SQLite via sql.js:** escolhido para que o projeto rode em qualquer máquina só com `npm install`. As escritas são serializadas pela unidade de trabalho (isolamento serializável). Para produção: PostgreSQL (trocar `type` em `opcoes-banco.ts` e gerar as migrations; entidades e serviços não mudam) e `SELECT ... FOR UPDATE`.
- **Pagamento síncrono no sandbox:** num PSP real o PIX seria confirmado por webhook assinado (HMAC), evolução documentada.
- **Proposta, não implementado:** refresh token/logout com revogação, expiração automática de pedidos não pagos (liberando estoque), webhook de pagamento, rate limiting global, cache do cardápio e relatórios consolidados assíncronos.

## 10. Diagramas

| Diagrama | Arquivo |
|---|---|
| Casos de uso | [`docs/diagramas/01-casos-de-uso.png`](docs/diagramas/01-casos-de-uso.png) |
| DER (modelo de dados) — completo | [`docs/diagramas/02-der.png`](docs/diagramas/02-der.png) |
| DER — parte 1: rede, catálogo, cardápio, estoque e campanhas | [`docs/diagramas/02a-der-catalogo-estoque.svg`](docs/diagramas/02a-der-catalogo-estoque.svg) |
| DER — parte 2: usuários e LGPD, pedidos, pagamentos, fidelidade e auditoria | [`docs/diagramas/02b-der-pedidos-pagamentos.svg`](docs/diagramas/02b-der-pedidos-pagamentos.svg) |
| Classes (domínio) — completo | [`docs/diagramas/03-classes.png`](docs/diagramas/03-classes.png) |
| Classes — parte 1: rede, catálogo, estoque, pessoas e LGPD | [`docs/diagramas/03a-classes-catalogo-pessoas.svg`](docs/diagramas/03a-classes-catalogo-pessoas.svg) |
| Classes — parte 2: pedidos, pagamento, fidelidade, campanhas e auditoria | [`docs/diagramas/03b-classes-pedidos-pagamento.svg`](docs/diagramas/03b-classes-pedidos-pagamento.svg) |
| Sequência do fluxo crítico | [`docs/diagramas/04-sequencia-fluxo-critico.png`](docs/diagramas/04-sequencia-fluxo-critico.png) |
| Arquitetura em camadas | [`docs/diagramas/05-arquitetura-camadas.png`](docs/diagramas/05-arquitetura-camadas.png) |
| Estados do pedido | [`docs/diagramas/06-estados-pedido.png`](docs/diagramas/06-estados-pedido.png) |

As versões divididas em duas partes são as usadas no documento PDF (cabem em página A4 em pé). Entidades/classes em cinza, marcadas «ref», são apenas referência e estão detalhadas na outra parte.

Os fontes PlantUML (`.puml`) e SVG estão na mesma pasta. O DER corresponde exatamente à migration `src/infrastructure/database/migrations/1792200000000-EsquemaInicial.ts`.

---

Projeto acadêmico: UNINTER · Projeto Multidisciplinar (Trilha Back-End) · 2026.
