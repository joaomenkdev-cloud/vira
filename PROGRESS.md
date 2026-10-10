# Diário de bordo

Arquivo para retomar o trabalho em outra sessão. **No início de cada sessão:** ler este arquivo e o [docs/ROADMAP.md](docs/ROADMAP.md), confirmar o estado do repositório (`git status`, PRs abertos) e dizer qual é o próximo passo antes de começar.

## Estado atual

- **Marco:** 0 — Fundação
- **Concluído (mergeado):** F1 a F6 (PRs #1, #2, #8, #10, #11, #12) e Dependabot (#4–#7; #9, CodeQL v4, no lugar do #3).
- **Entregas abertas (pilha):**
  - F7 — Esqueleto do web (`feat/web-skeleton`, PR #13, base `main`) — CI verde, aguardando autorização para mergear.
  - N1 — Fundação visual (`feat/ui-foundation`, empilhado sobre o #13) — draft.
- **Próximo passo:** quando o #13 for mergeado, mudar a base do PR da N1 para `main` (antes de apagar a branch do F7). Depois, **N2 — Componentes base** (`feat/ui-components`).
- **Bloqueios / pendências do mantenedor:** Docker Desktop não sobe nesta máquina pela sessão do agente (precisa ser iniciado pelo usuário); os testes de integração (Testcontainers) e o job de `docker compose` rodam só no CI até lá.

## Regras que valem sempre

- Nunca commitar na `main`; um PR por entrega do roadmap, aberto como draft.
- Commits por responsabilidade, Conventional Commits, em inglês; sem squash ou amend automático.
- Push da branch e PR draft são permitidos; **merge e deploy só com autorização explícita** do mantenedor.
- PRs empilhados: depois de mergear um PR, **mude a base do PR seguinte para `main` antes de apagar a branch mergeada** (apagar a base fecha o PR dependente).
- Todo PR de código: testes, CI verde, docs e `PROGRESS.md` atualizados. PRs de interface: prints de desktop e mobile, sem mudança de lógica.
- Decisão mudou → novo ADR substituindo o anterior.
- Nada de segredos, `.env` ou dados reais no repositório.
- Código e commits em inglês; documentação em português (README também em inglês).

## Registro

### 2026-10-10 — N1: fundação visual

Feito:

- `packages/ui` (`@vira/ui`): `tokens.css` (fonte única dos valores) e `theme.css` (o `@theme` do Tailwind, os utilitários de movimento e de camada e os estilos de base), importados pelo `globals.css` do web logo depois do Tailwind.
- Tokens que faltavam no DESIGN.md: `scrim`, `info`/`info-bg`, larguras de layout (`max-w-page`, `max-w-event`, `max-w-checkout`, `max-w-reading`, `max-w-empty-state`), camadas (`z-sticky` ... `z-toast`), `duration-slow`, `ease-exit`, `price`/`price-lg` e os tamanhos de mobile `h1-sm`/`h2-sm`.
- Testes no `@vira/ui`: contraste AA recalculado de `tokens.css` (agora com `info`) e coerência do tema (nenhuma referência a token inexistente, todo token exposto, nenhuma cor literal no tema).
- Regra de lint `vira/no-arbitrary-tailwind` em `@vira/config`, ligada para todo `.tsx`/`.jsx`: rejeita `bg-[#fff]`, `p-[13px]`, `h-(--x)` e propriedades arbitrárias em `className` e em `cn`/`clsx`/`cva`; variantes arbitrárias (`data-[state=open]:`) continuam valendo. Os valores arbitrários do web (`max-w-[1200px]`, `max-w-[68ch]`, `max-w-[420px]`, `scale-[0.98]`) viraram tokens.
- Rota `/dev/design-system` com cores, estados, escala tipográfica, espaçamento, raios, sombra, movimento e camadas; `noindex`; em produção só com `VIRA_DESIGN_SYSTEM=true` e nunca na Vercel. Teste unitário garante que toda cor de `tokens.css` aparece na página; E2E confere que nenhuma amostra fica transparente e roda o axe.

Corrigido de passagem: o logo usava `text-2xl`, que não existe no tema (a escala do Tailwind é zerada), então saía com 16 px. Agora usa o token `logo` (24/32, peso 800), e os prints foram refeitos.

Decisões tomadas por conta própria:

- Inter continua via `@fontsource-variable/inter` (decisão da F7); o critério da N1 no ROADMAP foi atualizado.
- `@vira/ui` exporta os arquivos CSS direto de `src/` (sem build): CSS não precisa de compilação, e os componentes da N2 entram no mesmo pacote.
- A página do design system lista os tokens com classes do Tailwind escritas por extenso, sem `style` inline (a CSP de produção bloqueia estilos inline).
- Token novo `logo` para a marca no header, documentado no DESIGN.md.

### 2026-10-09 — F7: esqueleto do web

Auditoria (antes de codar): `apps/web` vazio; `packages/ui` ainda não existe (é a entrega N1); o briefing proíbe eventos, preços, depoimentos e funcionalidades inventados; o Next.js 16 mudou convenções (`middleware` virou `proxy`) e traz a documentação do próprio pacote, que foi a fonte usada.

Plano (commits pequenos): tokens e estilos base → cabeçalhos e CSP com nonce → proxy de `/api/v1` → layout e home com estado vazio → testes unitários e E2E com axe → CI e docs.

Feito:

- `apps/web`: Next.js 16 (App Router) + Tailwind 4, Inter variável auto-hospedada, tokens do DESIGN.md em `tokens.css` mapeados no tema do Tailwind; foco visível, `prefers-reduced-motion`, link "Pular para o conteúdo", `lang="pt-BR"`.
- Home: título "Encontre seu próximo evento.", uma frase e o estado vazio "Nenhum evento por aqui ainda". Sem busca, sem navegação e sem eventos inventados (nada disso existe ainda). 404 e página de erro com o mesmo cuidado.
- `proxy.ts`: CSP estrita com nonce por requisição (`strict-dynamic`, sem `unsafe-inline`/`unsafe-eval` em produção); demais cabeçalhos via `next.config.ts`; `/api/v1/*` encaminhado para a API na mesma origem.
- Testes: 48 unitários (CSP, origem da API, config, contraste AA recalculado dos tokens) e 24 E2E (12 × desktop e mobile): axe sem violações A/AA, nonce diferente a cada requisição e em todos os scripts, nenhuma violação de CSP no navegador, proxy, teclado, alvos de 44 px, reflow a 320 px.
- CI: job de E2E (Playwright + axe); Turborepo passa a considerar `API_ORIGIN` e `VERCEL` no cache de build.

Decisões tomadas por conta própria:

- Tokens dentro do web até a N1 (o `packages/ui` é dela), com teste de contraste desde já.
- `@fontsource-variable/inter` em vez de `next/font/google`: sem requisição ao Google no build nem em execução (LGPD) e build offline.
- Todas as páginas dinâmicas (nonce por requisição), abrindo mão de cache estático e PPR; é o custo de uma CSP estrita.
- `API_ORIGIN` lido no build; obrigatório e https quando `VERCEL` está definido; `http` só para loopback.
- Sem navegação e sem busca no header/home: só existem quando as páginas e a API que as sustentam existirem.
- `eslint-plugin-jsx-a11y` não entrou (ainda não suporta ESLint 10); a acessibilidade é verificada pelo axe no E2E.
- CodeQL do #13 achou dois problemas reais, corrigidos: regex para ler HTML no teste E2E (trocada por `DOMParser`) e actions de terceiros presas a tag mutável (`pnpm/action-setup` e `gitleaks-action` agora fixadas no SHA do commit).
- `AGENTS.md` do Next.js (`node_modules/next/AGENTS.md`) manda ler a documentação do pacote antes de codar: lida (CSP, proxy, rewrites).

### 2026-10-09 — F6: worker, filas e outbox

Feito:

- `outbox_messages` (migration SQL com `CHECK`s) e módulo `outbox` em camadas: catálogo de tipos (payload só com ids, fila de destino), mensagem imutável, política de retry/backoff como funções puras e `recordAttempt`.
- `Outbox.publish(evento, tx)` grava na mesma transação da mudança de estado (`TransactionRunner` na plataforma); `DispatchOutbox` com `FOR UPDATE SKIP LOCKED`, `PurgeOutbox`, publicador BullMQ (id da mensagem = id do job) e `OutboxPoller` sem sobreposição.
- Worker: `main.worker.ts`, `WorkerModule`, scripts `dev:worker` e `start:worker`; `WORKER_MODE=embedded|separate` e `OUTBOX_POLL_INTERVAL_MS`.
- Testes unitários (domínio, casos de uso, poller com timers falsos) e de integração (Postgres e Redis reais: exatamente uma vez, rollback, despachantes concorrentes, backoff, mensagens paradas, purga, CHECKs, consumidor BullMQ, modos embedded/separate e o worker real).

Decisões tomadas por conta própria:

- Poller em processo no lugar do job repetível do BullMQ (a outbox não depende do Redis para ser lida); dispensei o gatilho pós-commit.
- Máximo de 10 tentativas, backoff de 5 s a 15 min; mensagens esgotadas ficam paradas para inspeção.
- Índice composto em vez de parcial (o Prisma não expressa índices parciais).
- Catálogo de tipos já traz `orders.paid`, `tickets.issued` e `orders.refund_requested`, com roteamento inicial para as filas `tickets`, `email` e `payments`.

### 2026-10-08 — F5: módulo de auditoria

Feito:

- Tabela `audit_logs` (migration SQL): `CHECK` de formato da ação, de papel (`SYSTEM`/`BUYER`/`ORGANIZER`/`ADMIN`) e de par ator/papel, `metadata` sempre objeto; triggers que rejeitam `UPDATE`, `DELETE` e `TRUNCATE` para qualquer papel; `REVOKE` de `PUBLIC`.
- Módulo `audit` em camadas: catálogo de ações (`domain/audit-catalog.ts`) com tipo de entidade e schema estrito de `metadata` por ação; `buildAuditEntry` imutável; caso de uso `AuditLog.record()` atrás da porta `AuditLogRepository`; adaptador Prisma; `public-api.ts`.
- `platform/runtime`: portas `Clock` e `IdGenerator` (UUID v7).
- Testes: domínio (catálogo, rejeição de chaves e formatos sem ecoar valores, nenhuma chave de dado pessoal no catálogo), caso de uso com repositório em memória e integração contra Postgres real provando o append-only e os `CHECK`s.

Decisões tomadas por conta própria:

- O catálogo já declara as ações previstas no DATA_MODEL para os próximos marcos (auth, pedidos, pagamentos, check-in, LGPD), cada uma com o menor `metadata` útil e sem dado pessoal; os módulos que as usarem podem ajustar o schema no próprio PR.
- O trigger é a proteção principal (vale até para o dono da tabela); o `GRANT` só de `INSERT`/`SELECT` ao papel da aplicação fica para o deploy (V11), quando houver papéis separados.
- `entity_id` como `uuid` (todos os ids do modelo são UUID v7); ids gerados com o pacote `uuid` porque o Node 22 não tem `crypto.randomUUIDv7`.
- O endpoint `GET /admin/audit-logs` (API.md) fica para quando existir autenticação de ADMIN.
- O `prisma migrate diff` precisa de um `DATABASE_URL` (mesmo fictício) para gerar SQL; sem ele o CLI não mostra erro nenhum.

### 2026-10-08 — F4: banco e infraestrutura local

Feito:

- `docker-compose.yml` com Postgres 16.15, Redis 8.8, SeaweedFS 4.48 (S3) e Mailpit 1.31, portas só em `127.0.0.1`, healthchecks, `pnpm infra:up`/`infra:down`.
- Prisma 7.10 com o generator `prisma-client` (ESM) e driver adapter `pg`; `prisma.config.ts`; primeira migration habilita `citext` e `pg_trgm`; client gerado fora do Git pela tarefa `db:generate` do Turborepo.
- `PrismaService` (conexão preguiçosa, `statement_timeout` e timeout de conexão de 5 s) e `RedisService` (ioredis 6, sem fila offline).
- Readiness agora verifica banco e Redis de verdade.
- Config: `DATABASE_URL` e `REDIS_URL` obrigatórios; em produção, TLS obrigatório (`sslmode=require` e `rediss://`).
- Testcontainers: harness em `test/support/infrastructure.ts` (aplica as migrations) e suíte de integração (extensões, timeout, readiness up/down).
- CI: job novo sobe o `docker compose` e aplica as migrations nele.

Decisões tomadas por conta própria:

- **SeaweedFS no lugar do MinIO** no ambiente local: a imagem `minio/minio` saiu do Docker Hub. Registrado no [ADR-0012](docs/adr/0012-armazenamento-local-seaweedfs.md), que substitui essa parte do ADR-0011.
- **Prisma 7.10.0**, não a tag `latest` do CLI (que aponta para uma `8.0.0-rc`).
- TLS obrigatório em produção para banco e Redis (ASVS V12) validado na configuração.
- Testes de integração são pulados localmente sem Docker e falham no CI sem Docker.
- Allowlist do gitleaks só para os dois valores exatos de credenciais locais.
- Lição registrada nas regras: ao mergear o #2 apaguei a branch base do #8 antes de mudar a base, e o GitHub fechou o #8; recriei a branch, reabri e mudei a base.

### 2026-10-08 — F3: esqueleto da API

Feito:

- `apps/api`: NestJS 12 (ESM) com `AppModule.register({ config })`, prefixo `/api/v1`, `run()` que recusa subir com env inválida.
- `platform/config`: env validada com Zod no boot; erros citam variável e regra, nunca o valor.
- `platform/logging`: pino com `requestId` no topo de toda linha, redação de dados pessoais e credenciais em qualquer profundidade, sem headers, corpo, query string ou IP.
- `platform/errors`: RFC 9457 para tudo (inclusive body-parser e rotas inexistentes); 500 genérico sem detalhes internos; validação Zod lista os campos inválidos.
- `platform/security`: `@Public()`/`@RequireRole()` e guard "negar por padrão" (papéis cumulativos).
- `platform/http`: Helmet (CSP `default-src 'none'` na API, CSP própria para `/docs`), `Cache-Control: no-store`, CORS só para `WEB_ORIGIN`, limite de 100 kB.
- `platform/openapi`: `/docs` e `/docs/json` gerados dos schemas Zod (Standard Schema).
- `modules/health`: `/health/live` e `/health/ready` (checks plugáveis com timeout; banco e Redis no F4).
- `packages/shared`: schemas de problem details e saúde, hierarquia de papéis.
- `dependency-cruiser`: camadas, acesso entre módulos só por `public-api.ts`/`*.module.ts`, `platform` sem módulos, sem ciclos; provado com fixtures.
- 65 testes no monorepo (44 na API), smoke test do build real (`node dist/main.js`).

Decisões tomadas por conta própria:

- **NestJS 12** (ESM). Usei o suporte nativo a Standard Schema (`@Body({ schema })`, `StandardSchemaValidationPipe`, `@ApiResponse({ standardSchema })`) em vez do `nestjs-zod`, que ainda não suporta o Nest 12.
- **Sem SWC:** os testes usam o transformador Oxc do Vite 8 com `emitDecoratorMetadata`. O binário nativo do SWC não funciona nesta máquina (verificação de permissão do cache) e o Oxc evita a dependência nativa.
- Config própria (`ConfigModule.forRoot(config)`) em vez de `@nestjs/config`: o env é lido uma vez, antes do Nest, e o container nunca lê `process.env`.
- `requestId` de entrada aceito só com 8–64 caracteres `[A-Za-z0-9_-]`; caso contrário um UUID novo.
- Novos tipos de problema documentados: `payload-too-large` (413) e `unsupported-media-type` (415); 4xx sem tipo próprio usam `about:blank`.
- `application` pode importar `@nestjs/common` (injeção de dependência); confirmado na regra do ESLint.

### 2026-10-07 — F2: ferramentas do workspace

Feito:

- Turborepo (`turbo.json`) com as tarefas `build`, `typecheck`, `lint` e `test`; scripts na raiz e `pnpm check` reproduzindo o CI.
- `packages/config` (`@vira/config`): tsconfig estrito (`base`, `library`), ESLint flat config (typescript-eslint strict type-checked + regras de fronteira), Prettier e preset do Vitest.
- Regras de fronteira testadas (16 testes): apps não importam apps, pacotes não importam apps, `domain` sem framework nem SDK de infraestrutura, `application` e `http` sem SDK de infraestrutura.
- CI: job único com format, Markdown, lint, typecheck, test e build, com cache do Turborepo; CodeQL analisando `javascript-typescript`.
- Pre-commit: Prettier nos arquivos em stage.
- `AGENTS.md` (bloco gerenciado pelo Turborepo, orienta agentes de IA a ler a documentação da versão instalada) entrou junto no commit do Prettier; mantido de propósito.
- PR #1: falsos positivos do gitleaks nos exemplos da API.md corrigidos (placeholders + `.gitleaksignore` por fingerprint para o commit antigo).

Decisões tomadas por conta própria:

- TypeScript fixado em `~6.0` (a 7.0 já saiu, mas o typescript-eslint suporta só `< 6.1`). Revisar quando houver suporte.
- `viraConfig` recebe `kind: "app" | "package"`: os globs do ESLint são relativos ao `eslint.config.js` de cada workspace, então o tipo de workspace não pode ser inferido pelo caminho.
- Regras de import por **pacote** ficam no ESLint; regras por **caminho** (camadas e módulos, ex. `application` → `../infra`) ficam para o `dependency-cruiser`, que entra no F3 junto com o primeiro código da API (critério adicionado ao ROADMAP).
- `application` pode importar `@nestjs/*` (injeção de dependência); só o `domain` é livre de framework.

### 2026-10-07 — F1: planejamento inicial

Feito:

- Repositório criado (`joaomenkdev-cloud/vira`, público) com `main` vazia e branch `docs/planejamento-inicial`.
- Configuração base: `.editorconfig`, `.gitattributes`, `.gitignore`, `.nvmrc` (22), `package.json` raiz, `pnpm-workspace.yaml`, markdownlint, lefthook com gitleaks no pre-commit.
- Arquivos de comunidade: LICENSE (MIT), SECURITY, CONTRIBUTING, CODE_OF_CONDUCT.
- `.github/`: templates de PR e issue, Dependabot (npm e actions), CI com lint de markdown e gitleaks, CodeQL (por enquanto só `actions`).
- Documentação: ARCHITECTURE, DATA_MODEL, API, SECURITY_MODEL, PRIVACY, DESIGN_BRIEF (verbatim), DESIGN, ROADMAP e 11 ADRs.

Decisões tomadas por conta própria (todas registradas em ADR ou doc):

- Render para API e worker, com modo `WORKER_MODE=embedded` para custo zero (ADR-0011).
- Proxy de mesma origem no Next.js para os cookies de sessão; CSRF double-submit (ADR-0005).
- Comprar exige conta com e-mail verificado; cadastro anti-enumeração (202 sempre) (ADR-0005, API.md).
- Extensão única de +10 min da reserva para atender WCAG 2.2.1 (ADR-0007).
- Pagamento após expiração: re-reserva ou reembolso automático (ADR-0006).
- MVP só com ingressos pagos (mínimo R$ 1,00) e moeda BRL (DATA_MODEL).
- Erros com tons próprios (sem azul) e `accent-ink` para texto vermelho sobre fundo claro, por contraste (DESIGN.md).

Observações:

- O binário do gitleaks não está instalado na máquina local; o hook avisa e segue, e o CI aplica a verificação. Instalar: <https://github.com/gitleaks/gitleaks#installing>.
- Node local é 24; o projeto fixa 22 LTS no `.nvmrc` e no CI.
