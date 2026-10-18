import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErroPadraoDto } from './swagger';

const DESCRICAO = `
API Back-end da **Rede Raízes do Nordeste** — plataforma única de pedidos para os canais **APP, TOTEM, BALCÃO, PICKUP e WEB**,
com cardápio e estoque por unidade, pagamento via provedor externo (simulado), programa de fidelidade "Cliente Raiz" e controles de LGPD.

### Como autenticar
1. \`POST /auth/login\` com um dos usuários de teste abaixo.
2. Clique em **Authorize** e cole o \`accessToken\`.

| Perfil | E-mail | Senha |
|---|---|---|
| ADMIN (matriz) | admin@raizesdonordeste.com.br | Raizes@2026 |
| GERENTE — Salvador | gerente.salvador@raizesdonordeste.com.br | Raizes@2026 |
| ATENDENTE — Salvador | atendente.salvador@raizesdonordeste.com.br | Raizes@2026 |
| COZINHA — Salvador | cozinha.salvador@raizesdonordeste.com.br | Raizes@2026 |
| TOTEM — Salvador | totem01.salvador@raizesdonordeste.com.br | Raizes@2026 |
| GERENTE — Recife | gerente.recife@raizesdonordeste.com.br | Raizes@2026 |
| CLIENTE (participa da fidelidade) | ana.souza@email.com | Raizes@2026 |
| CLIENTE (não participa) | bruno.costa@email.com | Raizes@2026 |

### Fluxo crítico
\`POST /pedidos\` → \`POST /pagamentos\` → \`PATCH /pedidos/{id}/status\` (EM_PREPARO → PRONTO → ENTREGUE)

### Padrão de erro (todas as rotas)
\`\`\`json
{ "error": "CODIGO", "message": "Mensagem legível", "details": [{ "field": "campo", "issue": "problema" }],
  "timestamp": "2026-10-17T15:04:05.000Z", "path": "/rota", "requestId": "uuid" }
\`\`\`
400 malformado · 401 sem token · 402 pagamento recusado · 403 sem permissão · 404 não encontrado · 409 conflito/regra · 422 validação · 429 limite · 503 provedor indisponível
`;

export function gerarDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Raízes do Nordeste API')
    .setDescription(DESCRICAO)
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer('http://localhost:3000', 'Local')
    .build();
  return SwaggerModule.createDocument(app, config, { extraModels: [ErroPadraoDto] });
}

export function configurarSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, gerarDocumentoOpenApi(app), {
    customSiteTitle: 'Raízes do Nordeste API — Swagger',
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
  });
}
