# Registros de decisão de arquitetura (ADRs)

Cada ADR registra **uma** decisão: o contexto, o que foi decidido, as alternativas e as consequências. ADRs não são editados depois de aceitos; quando uma decisão muda, um novo ADR **substitui** o anterior e o antigo recebe o status `Substituído por ADR-XXXX`.

Formato: [template](0000-template.md), inspirado no MADR.

| # | Decisão | Status |
| --- | --- | --- |
| [0001](0001-monorepo.md) | Monorepo com pnpm workspaces e Turborepo | Aceito |
| [0002](0002-monolito-modular.md) | Monólito modular em NestJS com worker separado | Aceito |
| [0003](0003-api-rest.md) | API REST versionada com OpenAPI e erros RFC 9457 | Aceito |
| [0004](0004-prisma.md) | PostgreSQL 16 com Prisma e migrations versionadas | Aceito |
| [0005](0005-autenticacao-e-tokens.md) | Autenticação: JWT curto, refresh rotativo e cookies de mesma origem | Aceito |
| [0006](0006-stripe-e-idempotencia.md) | Stripe Payment Intents, webhooks e idempotência | Aceito |
| [0007](0007-controle-de-estoque.md) | Controle de estoque com reserva e update condicional | Aceito |
| [0008](0008-qr-code-assinado.md) | QR Code com token assinado por HMAC | Aceito |
| [0009](0009-design-system-proprio.md) | Design system próprio sobre shadcn/ui | Aceito |
| [0010](0010-dados-da-demo.md) | Dados de demonstração só via seed, sinalizados | Aceito |
| [0011](0011-hospedagem.md) | Hospedagem: Vercel, Render, Neon, Upstash, R2 | Aceito (armazenamento local substituído pelo 0012) |
| [0012](0012-armazenamento-local-seaweedfs.md) | SeaweedFS como armazenamento S3 local | Aceito |
