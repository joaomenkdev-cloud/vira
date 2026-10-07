# Roadmap

Quatro marcos. Cada linha é **uma entrega do tamanho de um PR**, com um critério de pronto verificável. A ordem dentro de cada marco é a ordem planejada de execução; o estado atual fica no [PROGRESS.md](../PROGRESS.md).

**Pronto, para qualquer PR de código** (vale para todas as entregas e não é repetido abaixo): testes cobrindo o comportamento novo, CI verde (lint, tipos, testes, build), documentação e ADRs afetados atualizados, `PROGRESS.md` atualizado, PR aberto como draft e revisado. PRs de interface trazem prints de desktop e mobile e não mexem em lógica de negócio.

Legenda: ⬜ a fazer · 🟨 em andamento · ✅ concluído.

## Marco 0 — Fundação

Objetivo: repositório, ferramentas e esqueletos prontos para construir com segurança.

| # | Entrega | Branch sugerida | Critério de pronto | Status |
| --- | --- | --- | --- | --- |
| F1 | Planejamento técnico e de design | `docs/planejamento-inicial` | Documentos de `docs/`, ADRs, arquivos de comunidade, templates, Dependabot e CI de markdown + gitleaks no ar. | 🟨 |
| F2 | Ferramentas do workspace | `chore/workspace-tooling` | Turborepo, `packages/config` (tsconfig estrito, ESLint flat config com regras de fronteira, Prettier, Vitest); scripts `lint`, `typecheck`, `test`, `build` na raiz; CI roda os quatro com cache; CodeQL passa a analisar `javascript-typescript`. | 🟨 |
| F3 | Esqueleto da API | `feat/api-skeleton` | NestJS em `apps/api`; config validada com Zod (boot falha com env inválida — teste); logs pino com `requestId` e redação de PII (teste); filtro RFC 9457 (teste); `/health/live` e `/health/ready`; Helmet, CORS restrito, limite de body; OpenAPI em `/docs`; guard "negar por padrão" com teste que varre todas as rotas; `dependency-cruiser` no CI validando camadas e módulos por caminho real (complementa as regras de import do ESLint). | ⬜ |
| F4 | Banco e infraestrutura local | `feat/api-database` | `docker-compose.yml` com Postgres 16, Redis, MinIO e Mailpit; Prisma configurado com primeira migration (extensões `citext`, `pg_trgm`); harness de Testcontainers com teste de exemplo; `.env.example` completo; guia de setup no CONTRIBUTING. | ⬜ |
| F5 | Módulo de auditoria | `feat/audit-log` | Tabela `audit_logs` append-only (trigger + `REVOKE`); serviço `AuditLog` na camada `application`; teste provando que `UPDATE`/`DELETE` falham; schema de `metadata` por ação sem PII. | ⬜ |
| F6 | Worker, filas e outbox | `feat/worker-outbox` | Entrypoint `main.worker.ts`; BullMQ com Redis; `outbox_messages` com despacho `FOR UPDATE SKIP LOCKED`; modo `WORKER_MODE=embedded`; teste de integração: mensagem gravada em transação é despachada exatamente uma vez; rollback não gera mensagem. | ⬜ |
| F7 | Esqueleto do web | `feat/web-skeleton` | Next.js App Router + Tailwind em `apps/web`; proxy `/api/v1/*` para a API; CSP com nonce e cabeçalhos de segurança; Playwright + axe com um teste de fumaça; `packages/shared` consumido pelos dois lados. | ⬜ |

## Marco 1 — Núcleo

Objetivo: design system, contas, eventos e vitrine funcionando de ponta a ponta (ainda sem compra).

| # | Entrega | Branch sugerida | Critério de pronto | Status |
| --- | --- | --- | --- | --- |
| N1 | Fundação visual | `feat/ui-foundation` | `packages/ui` com `tokens.css` e `@theme` do [DESIGN.md](DESIGN.md); Inter via `next/font`; teste que recalcula o contraste dos pares de cor e falha abaixo de AA; lint proibindo valores arbitrários; rota `/dev/design-system`. Commit `feat(ui): establish visual foundation`. | ⬜ |
| N2 | Componentes base | `feat/ui-components` | Button, Input (e variações), Badge, Alert, Toast, Modal/Bottom sheet, Dropdown, Skeleton, Spinner, Empty state, Header e Footer, todos nos estados da seção 3 do DESIGN.md; teste axe por componente; prints na página de design system. | ⬜ |
| N3 | Cadastro e login por senha | `feat/auth-password` | `register` (202 anti-enumeração), verificação de e-mail (Mailpit), `login`, argon2id; bloqueio progressivo; rate limit em login e cadastro; auditoria; testes de enumeração, rate limit e bloqueio. | ⬜ |
| N4 | Sessões e CSRF | `feat/auth-sessions` | JWT de acesso em cookie `__Host-`; refresh rotativo com hash e detecção de reuso (teste: token antigo revoga a família); `logout` e `logout-all`; CSRF double-submit (testes de 403); flags de cookie verificadas em teste. | ⬜ |
| N5 | Login social | `feat/auth-oauth` | Google e GitHub com PKCE e `state`; vínculo só com e-mail verificado; testes com provedor falso; nenhum token do provedor persistido. | ⬜ |
| N6 | Redefinição de senha e conta | `feat/users-account` | `forgot`/`reset` com token de uso único (revoga sessões); `GET/PATCH /me`; troca de senha; `POST /me/organizer`; testes de autorização e mass assignment. | ⬜ |
| N7 | Telas de autenticação | `feat/web-auth` | Login, cadastro, verificação, esqueci a senha e conta, com o design system; erros acessíveis; E2E Playwright + axe do cadastro ao login; prints desktop e mobile. | ⬜ |
| N8 | Eventos do organizador (API) | `feat/events-management` | CRUD de rascunho, publicar (com validação de completude), cancelar; tipos de ingresso com invariantes (`CHECK`); markdown sanitizado no servidor (teste com payloads XSS); testes provando que um organizador não acessa eventos de outro (`404`). | ⬜ |
| N9 | Upload de imagem | `feat/events-image-upload` | URL pré-assinada (MinIO/R2) com tipo e tamanho fixados; confirmação valida magic bytes, re-encoda sem EXIF e gera `blurDataURL`; bucket privado; job limpa uploads pendentes; testes com arquivo falso e grande demais. | ⬜ |
| N10 | Vitrine (API) | `feat/catalog` | `GET /events` com busca, filtros e cursor assinado; `GET /events/featured`; `GET /events/{slug}`; só eventos publicados; teste de estabilidade da paginação. | ⬜ |
| N11 | Home, card e página do evento | `feat/web-storefront` | Home, card de evento e página do evento conforme os wireframes; estados vazios e de carregamento; SEO básico (metadata, Open Graph); E2E + axe; prints desktop e mobile. | ⬜ |
| N12 | Painel do organizador | `feat/web-organizer` | Lista, criação e edição de eventos e tipos de ingresso, upload de imagem, publicar/cancelar; E2E do fluxo de publicação; prints. | ⬜ |
| N13 | Seed de demonstração | `feat/demo-seed` | `pnpm db:seed:demo` cria eventos com `is_demo`, fotos de licença livre e créditos; `--reset` remove só esses dados; selo "Demonstração" visível no card e na página (E2E). | ⬜ |

## Marco 2 — MVP público v1.0

Objetivo: comprar, receber e usar um ingresso, com a demo publicada.

| # | Entrega | Branch sugerida | Critério de pronto | Status |
| --- | --- | --- | --- | --- |
| V1 | Reserva de estoque | `feat/orders-reservation` | `POST /orders` com update condicional e `Idempotency-Key`; limites (1 pendente por evento, `max_per_order`); rate limit; **teste de concorrência da última vaga** contra Postgres real; testes de replay idempotente. Commit `feat(orders): reserve inventory with expiry`. | ⬜ |
| V2 | Expiração e extensão | `feat/orders-expiry` | Job com delay + varredura periódica; extensão única de +10 min; cancelamento pelo comprador; testes com relógio controlado; estoque sempre devolvido uma única vez. | ⬜ |
| V3 | Pagamento | `feat/payments-intents` | Porta `PaymentGateway` com adaptador Stripe e fake; `POST /orders/{id}/payment` idempotente; valor lido do banco (teste); recusa de chaves live no boot (teste). | ⬜ |
| V4 | Webhook do Stripe | `feat/payments-webhook` | Assinatura verificada no body bruto; `processed_webhook_events`; `PENDING → PAID` só pelo webhook; pagamento tardio (re-reserva ou reembolso); testes com fixtures assinadas, reenvio e ordem invertida; roteiro com Stripe CLI documentado. | ⬜ |
| V5 | Emissão de ingressos | `feat/tickets-issuance` | Tickets criados na transação do pagamento (trigger impede emissão para pedido não pago — teste); token HMAC com `kid` e nonce; e-mail com link do ingresso via outbox; `GET /tickets` e `/tickets/{id}` com testes de posse. | ⬜ |
| V6 | Checkout | `feat/web-checkout` | Fluxo seleção → dados → pagamento com Payment Element; contador de reserva acessível com extensão; tela de confirmação; reserva expirada tratada; E2E com cartão de teste e webhook simulado; prints. | ⬜ |
| V7 | Meus ingressos e ingresso digital | `feat/web-tickets` | Lista e componente de ingresso conforme o DESIGN.md (recortes, QR em destaque, estados `VALID`/`USED`/`CANCELED`, tela cheia, impressão); E2E + axe; prints. | ⬜ |
| V8 | Check-in | `feat/checkin` | `POST /checkin/scan` e `/checkin/code`; uso único (teste de duas leituras simultâneas); respostas `VALID`/`ALREADY_USED`/`WRONG_EVENT`/`INVALID`; rate limit; tela com câmera e resultado inconfundível; E2E. | ⬜ |
| V9 | Direitos LGPD | `feat/users-privacy` | `GET /me/export` e `DELETE /me` (anonimização) com testes que provam a ausência dos dados originais; jobs de retenção; página `/privacidade`; telas de conta. | ⬜ |
| V10 | Endurecimento | `chore/security-hardening` | Revisão de rate limits e CSP; checklist ASVS do SECURITY_MODEL atualizado; varredura OWASP ZAP baseline sem achados altos; Sentry configurado sem PII (teste do `beforeSend`). | ⬜ |
| V11 | Deploy da demo e v1.0.0 | `chore/deploy` | `render.yaml`, configuração da Vercel, Neon, Upstash, R2 e Resend; variáveis documentadas; seed de demo aplicado; smoke test pós-deploy; README com link da demo e prints; tag `v1.0.0`. **Somente com autorização explícita do mantenedor.** | ⬜ |

## Marco 3 — Evolução

Sem ordem fixa; cada item vira uma ou mais entregas quando priorizado, com ADR quando mudar uma decisão.

- Eventos e ingressos gratuitos (sem Stripe).
- Checkout de convidado (substituiria parte do ADR-0005).
- Reembolso e cancelamento de pedidos pelo organizador.
- Lista de participantes para o organizador, com base legal revisada no PRIVACY.md.
- Transferência de titularidade do ingresso.
- Cupons de desconto e lotes com virada automática.
- Pix via Stripe.
- Check-in offline (PWA) com assinatura Ed25519 (substituiria parte do ADR-0008).
- Operadores de check-in delegados pelo organizador.
- Passes para Apple Wallet e Google Wallet.
- Modo escuro (tokens semânticos já preparados).
- Internacionalização (inglês).
- Métricas de vendas para o organizador.
- Fila virtual para vendas muito disputadas.
