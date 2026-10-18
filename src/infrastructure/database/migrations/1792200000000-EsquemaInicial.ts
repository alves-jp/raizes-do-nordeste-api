import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial da Rede Raízes do Nordeste.
 *
 * - Chaves estrangeiras com ON DELETE explícito (RESTRICT protege histórico de pedidos).
 * - Domínios fechados (perfil, canal, status...) garantidos por CHECK no banco, além da validação na API.
 * - Regras de integridade no banco: estoque nunca negativo, preço > 0, total = subtotal - descontos,
 *   unicidade de e-mail, de cardápio/estoque por unidade+produto e das chaves de idempotência.
 */
export class EsquemaInicial1792200000000 implements MigrationInterface {
  name = 'EsquemaInicial1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "unidades" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "nome" varchar(120) NOT NULL,
        "cidade" varchar(80) NOT NULL,
        "uf" varchar(2) NOT NULL,
        "tipo" varchar CHECK( "tipo" IN ('PROPRIA','FRANQUIA') ) NOT NULL,
        "horario_funcionamento" varchar(20),
        "ativa" boolean NOT NULL DEFAULT (1),
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')))
    `);
    await queryRunner.query(`
      CREATE TABLE "produtos" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "nome" varchar(120) NOT NULL,
        "descricao" varchar(400),
        "categoria" varchar CHECK( "categoria" IN ('TAPIOCAS','CUSCUZ','PRATOS','SALGADOS','DOCES','BEBIDAS') ) NOT NULL,
        "sazonal" boolean NOT NULL DEFAULT (0),
        "mes_inicio" integer,
        "mes_fim" integer,
        "ativo" boolean NOT NULL DEFAULT (1),
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')),
        "atualizado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "CHK_produto_sazonalidade" CHECK (sazonal = 0 OR mes_inicio BETWEEN 1 AND 12 AND mes_fim BETWEEN 1 AND 12))
    `);
    await queryRunner.query(`
      CREATE TABLE "logs_auditoria" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "acao" varchar CHECK( "acao" IN ('LOGIN_SUCESSO','LOGIN_FALHA','USUARIO_CADASTRADO','FUNCIONARIO_CADASTRADO','CONSENTIMENTO_ALTERADO','DADOS_PESSOAIS_ACESSADOS','DADOS_PESSOAIS_EXPORTADOS','USUARIO_ANONIMIZADO','PRODUTO_CRIADO','PRODUTO_ATUALIZADO','CARDAPIO_ATUALIZADO','ESTOQUE_MOVIMENTADO','CAMPANHA_CRIADA','PEDIDO_CRIADO','PEDIDO_STATUS_ALTERADO','PEDIDO_CANCELADO','PAGAMENTO_APROVADO','PAGAMENTO_RECUSADO','PAGAMENTO_FALHA_COMUNICACAO','PAGAMENTO_ESTORNADO') ) NOT NULL,
        "entidade" varchar(40) NOT NULL,
        "entidade_id" integer,
        "usuario_id" integer,
        "perfil" varchar CHECK( "perfil" IN ('CLIENTE','ATENDENTE','COZINHA','GERENTE','ADMIN','TOTEM') ),
        "unidade_id" integer,
        "detalhes" text,
        "ip" varchar(45),
        "request_id" varchar(64),
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')))
    `);
    await queryRunner.query(`
      CREATE TABLE "campanhas" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "codigo" varchar(30) NOT NULL,
        "descricao" varchar(200) NOT NULL,
        "percentual_desconto" integer NOT NULL,
        "inicio" datetime NOT NULL,
        "fim" datetime NOT NULL,
        "unidade_id" integer,
        "canal_pedido" varchar CHECK( "canal_pedido" IN ('APP','TOTEM','BALCAO','PICKUP','WEB') ),
        "valor_minimo_centavos" integer NOT NULL DEFAULT (0),
        "ativa" boolean NOT NULL DEFAULT (1),
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "CHK_campanha_periodo" CHECK (fim > inicio),
        CONSTRAINT "CHK_campanha_percentual" CHECK (percentual_desconto BETWEEN 1 AND 50),
        CONSTRAINT "FK_50de8f6866677d9097862db8b80" FOREIGN KEY ("unidade_id") REFERENCES "unidades" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "nome" varchar(120) NOT NULL,
        "email" varchar(160) NOT NULL,
        "senha_hash" varchar(100) NOT NULL,
        "telefone" varchar(20),
        "perfil" varchar CHECK( "perfil" IN ('CLIENTE','ATENDENTE','COZINHA','GERENTE','ADMIN','TOTEM') ) NOT NULL,
        "unidade_id" integer,
        "ativo" boolean NOT NULL DEFAULT (1),
        "versao_termos_aceita" varchar(10),
        "termos_aceitos_em" datetime,
        "anonimizado_em" datetime,
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')),
        "atualizado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_824563678d5b43bf09729ce7217" FOREIGN KEY ("unidade_id") REFERENCES "unidades" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "consentimentos" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "usuario_id" integer NOT NULL,
        "finalidade" varchar CHECK( "finalidade" IN ('FIDELIDADE','MARKETING') ) NOT NULL,
        "concedido" boolean NOT NULL,
        "versao_termo" varchar(10) NOT NULL,
        "origem" varchar(40) NOT NULL,
        "registrado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_b51a207e22948028a386d4c4936" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "estoques" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "unidade_id" integer NOT NULL,
        "produto_id" integer NOT NULL,
        "quantidade" integer NOT NULL DEFAULT (0),
        "estoque_minimo" integer NOT NULL DEFAULT (5),
        "atualizado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_estoque_unidade_produto" UNIQUE ("unidade_id", "produto_id"),
        CONSTRAINT "CHK_estoque_nao_negativo" CHECK (quantidade >= 0),
        CONSTRAINT "FK_084e8cf81d85c7fb48f775f6341" FOREIGN KEY ("unidade_id") REFERENCES "unidades" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_e0dba432144d295dbbc1e909e09" FOREIGN KEY ("produto_id") REFERENCES "produtos" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "itens_cardapio" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "unidade_id" integer NOT NULL,
        "produto_id" integer NOT NULL,
        "preco_centavos" integer NOT NULL,
        "disponivel" boolean NOT NULL DEFAULT (1),
        "atualizado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_cardapio_unidade_produto" UNIQUE ("unidade_id", "produto_id"),
        CONSTRAINT "CHK_cardapio_preco" CHECK (preco_centavos > 0),
        CONSTRAINT "FK_ebdfe3ace68c51138e050789dc6" FOREIGN KEY ("unidade_id") REFERENCES "unidades" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_344db14fa52e1f760b7226bd2d8" FOREIGN KEY ("produto_id") REFERENCES "produtos" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "pedidos" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "unidade_id" integer NOT NULL,
        "cliente_id" integer,
        "criado_por_id" integer NOT NULL,
        "canal_pedido" varchar CHECK( "canal_pedido" IN ('APP','TOTEM','BALCAO','PICKUP','WEB') ) NOT NULL,
        "status" varchar CHECK( "status" IN ('AGUARDANDO_PAGAMENTO','PAGAMENTO_RECUSADO','PAGO','EM_PREPARO','PRONTO','ENTREGUE','CANCELADO') ) NOT NULL DEFAULT ('AGUARDANDO_PAGAMENTO'),
        "forma_pagamento" varchar CHECK( "forma_pagamento" IN ('PIX','CARTAO_CREDITO','CARTAO_DEBITO') ) NOT NULL,
        "subtotal_centavos" integer NOT NULL,
        "desconto_campanha_centavos" integer NOT NULL DEFAULT (0),
        "desconto_pontos_centavos" integer NOT NULL DEFAULT (0),
        "total_centavos" integer NOT NULL,
        "campanha_id" integer,
        "pontos_resgatados" integer NOT NULL DEFAULT (0),
        "observacao" varchar(200),
        "motivo_cancelamento" varchar(200),
        "chave_idempotencia" varchar(80),
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')),
        "atualizado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_pedido_idempotencia" UNIQUE ("criado_por_id", "chave_idempotencia"),
        CONSTRAINT "CHK_pedido_total" CHECK (total_centavos >= 0 AND total_centavos = subtotal_centavos - desconto_campanha_centavos - desconto_pontos_centavos),
        CONSTRAINT "FK_69d9ae8645077aaf547dfa0e074" FOREIGN KEY ("unidade_id") REFERENCES "unidades" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_2fc639de84f845569ac2c9f78aa" FOREIGN KEY ("cliente_id") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_4608742065d4e9a5d4af2508f4c" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_08d5f6b0292f1c37fc355cbf677" FOREIGN KEY ("campanha_id") REFERENCES "campanhas" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "itens_pedido" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "pedido_id" integer NOT NULL,
        "produto_id" integer NOT NULL,
        "nome_produto" varchar(120) NOT NULL,
        "quantidade" integer NOT NULL,
        "preco_unitario_centavos" integer NOT NULL,
        "subtotal_centavos" integer NOT NULL,
        CONSTRAINT "CHK_item_quantidade" CHECK (quantidade > 0),
        CONSTRAINT "FK_4857bab44b0ffd40ac76c2d89c8" FOREIGN KEY ("pedido_id") REFERENCES "pedidos" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_62858ad64cfe45434e204e01fe6" FOREIGN KEY ("produto_id") REFERENCES "produtos" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "movimentacoes_estoque" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "unidade_id" integer NOT NULL,
        "produto_id" integer NOT NULL,
        "tipo" varchar CHECK( "tipo" IN ('ENTRADA','SAIDA','RESERVA_PEDIDO','ESTORNO_PEDIDO') ) NOT NULL,
        "quantidade" integer NOT NULL,
        "saldo_apos" integer NOT NULL,
        "motivo" varchar(200),
        "pedido_id" integer,
        "usuario_id" integer,
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "CHK_movimentacao_quantidade_positiva" CHECK (quantidade > 0),
        CONSTRAINT "FK_a4f8509ed677ba3df0e95a654f4" FOREIGN KEY ("unidade_id") REFERENCES "unidades" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cbf0295808218b67acd6350f6ee" FOREIGN KEY ("produto_id") REFERENCES "produtos" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_899fde31a377336e6314493e41a" FOREIGN KEY ("pedido_id") REFERENCES "pedidos" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_62b838983430a7e7ed43896de89" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "pagamentos" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "pedido_id" integer NOT NULL,
        "valor_centavos" integer NOT NULL,
        "forma" varchar CHECK( "forma" IN ('PIX','CARTAO_CREDITO','CARTAO_DEBITO') ) NOT NULL,
        "status" varchar CHECK( "status" IN ('PENDENTE','APROVADO','RECUSADO','FALHA_COMUNICACAO','ESTORNADO') ) NOT NULL DEFAULT ('PENDENTE'),
        "transacao_externa_id" varchar(80),
        "codigo_retorno" varchar(40),
        "mensagem_retorno" varchar(200),
        "resposta_gateway" text,
        "chave_idempotencia" varchar(80),
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')),
        "atualizado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_33b0e6b3fa2c22175d11e45367a" FOREIGN KEY ("pedido_id") REFERENCES "pedidos" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`
      CREATE TABLE "transacoes_fidelidade" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "cliente_id" integer NOT NULL,
        "pedido_id" integer,
        "tipo" varchar CHECK( "tipo" IN ('ACUMULO','RESGATE','ESTORNO_ACUMULO','ESTORNO_RESGATE') ) NOT NULL,
        "pontos" integer NOT NULL,
        "descricao" varchar(160) NOT NULL,
        "criado_em" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_4af8857f8689518b774a6128e71" FOREIGN KEY ("cliente_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_e354a8d2ca30ff0f6b5a29e1aba" FOREIGN KEY ("pedido_id") REFERENCES "pedidos" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_750b0e1ec48b90640360b3df8f" ON "produtos" ("nome")`);
    await queryRunner.query(`CREATE INDEX "IDX_9b55cc67c5195277908f829e83" ON "logs_auditoria" ("unidade_id", "criado_em")`);
    await queryRunner.query(`CREATE INDEX "IDX_4ba913e00f845957b5c12af220" ON "logs_auditoria" ("entidade", "entidade_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_401e33476c06a96fe36e9a3908" ON "logs_auditoria" ("acao", "criado_em")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d4a462e2383b0dde13e88d2860" ON "campanhas" ("codigo")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_446adfc18b35418aac32ae0b7b" ON "usuarios" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_b84d5862959430705087246f0a" ON "consentimentos" ("usuario_id", "finalidade", "registrado_em")`);
    await queryRunner.query(`CREATE INDEX "IDX_13d4be717c00cc7262288420a2" ON "pedidos" ("cliente_id", "criado_em")`);
    await queryRunner.query(`CREATE INDEX "IDX_96f6754256eb73233b7a519312" ON "pedidos" ("canal_pedido", "criado_em")`);
    await queryRunner.query(`CREATE INDEX "IDX_da89b0fb6675775398edba51b4" ON "pedidos" ("unidade_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_3a3c2f14a33c20c0c60ff961ac" ON "movimentacoes_estoque" ("unidade_id", "criado_em")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6a69514eedfeec785d45fa9fc6" ON "pagamentos" ("chave_idempotencia")`);
    await queryRunner.query(`CREATE INDEX "IDX_e8e245a46f5be7f4c977fc5ff4" ON "pagamentos" ("pedido_id", "criado_em")`);
    await queryRunner.query(`CREATE INDEX "IDX_72a0607482e9f5dcfcc40d6bbf" ON "transacoes_fidelidade" ("cliente_id", "criado_em")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transacoes_fidelidade"`);
    await queryRunner.query(`DROP TABLE "pagamentos"`);
    await queryRunner.query(`DROP TABLE "movimentacoes_estoque"`);
    await queryRunner.query(`DROP TABLE "itens_pedido"`);
    await queryRunner.query(`DROP TABLE "pedidos"`);
    await queryRunner.query(`DROP TABLE "itens_cardapio"`);
    await queryRunner.query(`DROP TABLE "estoques"`);
    await queryRunner.query(`DROP TABLE "consentimentos"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TABLE "campanhas"`);
    await queryRunner.query(`DROP TABLE "logs_auditoria"`);
    await queryRunner.query(`DROP TABLE "produtos"`);
    await queryRunner.query(`DROP TABLE "unidades"`);
  }
}
