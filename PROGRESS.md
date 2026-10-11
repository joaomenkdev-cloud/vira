# Diário de bordo

Arquivo para retomar o trabalho em outra sessão. **No início de cada sessão:** ler este arquivo e o [docs/ROADMAP.md](docs/ROADMAP.md), confirmar o estado do repositório (`git status`, PRs abertos) e dizer qual é o próximo passo antes de começar.

## Estado atual

- **Marco:** 0 — Fundação
- **Concluído (mergeado):** F1 a F6 e N3 (PRs #1, #2, #8, #10, #11, #12, #16) e Dependabot (#4–#7, #9 CodeQL v4).
- **Entregas abertas (pilha do web):** F7 (#13, base `main`), N1 (#14) e N2 (#15), sendo mergeadas nessa ordem; depois de cada merge, mudar a base do PR seguinte para `main` antes de apagar a branch mergeada.
- **Próximo passo:** **N4 — Sessões e CSRF** (`feat/auth-sessions`).
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

### 2026-10-11 — N3: cadastro e login por senha

Auditoria (antes de codar): não existia nenhum consumidor de fila (só o despachante da outbox), então o e-mail precisava de um; o `@nestjs/throttler` do desenho original não faz limite por conta (que depende do corpo); o `SMTP_URL` estava só comentado no `.env.example`; o `audit-catalog` já previa `auth.login_succeeded` e `auth.login_failed` (inclusive sem entidade, para e-mail desconhecido). Sem Docker local, o SQL da migration foi validado num Postgres em processo (PGlite) e a integração foi conferida só no CI.

Feito (API; a N3 não mexe no web):

- Migration `users` (`citext`, `CHECK`s de e-mail normalizado, tamanho e formato, nome de 1–120 sem espaços nas pontas, hash só argon2id, contador não negativo) e `verification_tokens` (hash SHA-256 de 32 bytes `UNIQUE`, validade depois da criação).
- `@vira/shared`: schemas Zod estritos de cadastro, verificação e login; senha de 8–128 caracteres.
- `platform/rate-limit`: limitador de janela fixa em Redis, guard por IP (`@RateLimit`) que roda antes da validação do corpo, `RateLimit-*` e `Retry-After`. `platform/mail`: porta `Mailer` com adaptador SMTP (nodemailer). `platform/queue`: `JobHandlerRegistry` e `QueueConsumers` (um worker BullMQ por fila com handlers).
- Módulo `auth` em camadas: `RegisterUser`, `VerifyEmail`, `LoginUser`, `SendVerificationEmail`, `SendAccountExistsNotice`; repositórios Prisma; hasher argon2id (19 MiB, t=2, p=1) com hash fictício; `AuthController` com as três rotas `@Public()`; módulos separados para a API e para o worker.
- Auditoria: `auth.registered`, `auth.email_verified`, `auth.account_locked` (novas), `auth.login_succeeded` e `auth.login_failed`.
- Testes: unitários (domínio; casos de uso com repositórios em memória; limitador; SMTP contra um servidor SMTP real; hasher), e2e sem infraestrutura (senha gigante → 400 sem hash, `role` no corpo → 400, limites por IP antes da validação, rotas públicas, quem consome a fila) e integração com Postgres, Redis e Mailpit reais (cadastro novo e conhecido idênticos, e-mail lido pela API do Mailpit, token de uso único com 6 pedidos simultâneos, expirado, só o hash no banco e nada na outbox, login indistinguível e com o mesmo custo, bloqueio e desbloqueio, todos os rate limits, auditoria sem dado pessoal, `CHECK`s).

Decisões tomadas por conta própria:

- **Login só valida (200 `{ user }`), sem cookies nem sessão:** isso é da N4. A verificação de e-mail também responde só `200 { user }` (a API.md previa cookies, que entram com a N4).
- **Um módulo `auth`** é dono de `users` e `verification_tokens` por ora; o `users` se separa na N6 (`/me`).
- **Conta bloqueada responde `401 invalid-credentials`**, igual a e-mail inexistente (um `account-locked` mostraria que a conta existe). Mesmo com a senha certa durante o bloqueio, e sem comparar a senha com o hash real.
- **Bloqueio:** a 5ª falha seguida bloqueia 1 min, cada falha seguinte dobra, máximo 1 h; tentativas durante o bloqueio não contam (senão dá para prolongá-lo de fora) e o contador só zera no login com sucesso (sem decaimento no tempo).
- **Cadastro faz o hash antes de consultar o e-mail**, para o tempo não revelar se ele existe. O login faz uma verificação argon2id em todos os caminhos; o hasher recebe `null` e verifica contra um hash fictício.
- **O token de verificação é criado pelo consumidor da fila `email`** (a outbox leva só o `userId`). A entrega é pelo menos uma vez; um reenvio apaga os tokens antigos não usados, então só o último link vale. O link usa o **fragmento** (`/verificar-email#token=...`), que não chega a logs nem a `Referer`; a página (N7) o lê no navegador. As rotas `/verificar-email` e `/entrar` ainda não existem no web.
- **Limitador próprio em vez do `@nestjs/throttler`**, porque o limite por conta precisa do corpo. Com **Redis fora, o limitador deixa passar** e registra um aviso (o bloqueio por conta no banco é a barreira que sobra). As chaves do Redis guardam só o hash do IP ou do e-mail.
- **`RedisService.ensureReady()`:** a conexão é preguiçosa e, com `enableOfflineQueue: false`, comandos não esperam a conexão; requisições simultâneas logo depois do boot falhavam e o limitador as deixava passar. Agora os chamadores compartilham uma tentativa de conexão e esperam o `ready` (o limitador e a checagem de prontidão usam isso). O CI não pegaria isso: apareceu na revisão do código.
- **`JobHandlerRegistry` + `QueueConsumers`:** a fila `email` vai ser compartilhada (e-mails de ingresso, V5), então cada módulo registra handlers por tipo e o worker da fila encaminha. Job sem handler falha de forma visível. No encerramento cada worker tem 10 s: sem Redis, o BullMQ nunca termina de fechar.
- **`INSERT ... ON CONFLICT DO NOTHING`** (`createMany` com `skipDuplicates`) no lugar de capturar o erro do Prisma: e-mail já usado, inclusive por um pedido simultâneo, vira contagem 0 e não uma transação abortada. O token é reivindicado por um `UPDATE` condicional.
- **`@node-rs/argon2`** (binários prontos, sem compilar nada): o `crypto.argon2` do Node só existe a partir da 24.7 e o projeto fixa a 22. Ele declara um `const enum`, então o algoritmo fica no padrão da biblioteca (argon2id) e um teste confere o prefixo `$argon2id$v=19$m=19456,t=2,p=1$`.
- **`login` aceita senha de 1 a 128 caracteres** (a política de 8–128 vale para senhas novas): uma falha de login não deve revelar a política. Corpo com senha acima de 128 → 400 antes de qualquer hash.
- **E-mails em texto puro, em português**, sem HTML (nada a escapar). `SMTP_URL` passa a ser obrigatório; em produção exige `smtps://` ou `requireTLS=true` e `MAIL_FROM` explícito.
- **Auditoria:** em `auth.login_failed` o ator é o sistema (a pessoa ainda não provou quem é) e a entidade é a conta, quando existe. O registro é gravado logo depois da operação, não na mesma transação.
- **Novo tipo de problema `token-expired` (410)**; o mapa de status para tipo passou a manter o primeiro tipo de cada status, para um 401 ou 403 genérico continuar `unauthenticated`/`forbidden`.
- Fakes dos testes unitários ficam em `*.fakes.ts` (fora do build); o Mailpit entrou no harness de Testcontainers (`startInfrastructure({ mail: true })`).

Pendências para o mantenedor decidir ou priorizar:

- **HIBP (senhas vazadas)** ficou fora desta entrega, como combinado. Sugestão: entra com a N6, que também define senhas, e vale no cadastro.
- **Quem perdeu o e-mail de verificação não tem como pedir outro:** `POST /auth/email/resend` exige sessão (API.md) e sem e-mail verificado não há sessão; cadastrar de novo só manda o aviso "você já tem conta". Opções: mandar um link novo no lugar do aviso quando a conta existe e não foi verificada (sem risco de enumeração, o conteúdo só aparece na caixa do dono) ou abrir o reenvio por e-mail com rate limit.
- **O aviso "você já tem conta" pode ser usado para encher a caixa de alguém** (5/h por IP, sem limite por destinatário). Um limite silencioso por e-mail resolveria.
- A contagem de falhas não decai; o bloqueio pode ser provocado por terceiros por até 1 h (ver SECURITY_MODEL, "Limites conhecidos do login por senha").
- As páginas `/verificar-email` e `/entrar` (N7) precisam existir para os links dos e-mails funcionarem.

### 2026-10-10 — N2: componentes base

Auditoria (antes de codar): a documentação do Next.js 16 diz que Turbopack e webpack já transpilam pacotes do workspace (então nada de `transpilePackages`), o Tailwind 4 não varre pacotes do workspace (precisa de `@source`) e a CSP de produção (`style-src` só com nonce) afeta o Radix de duas formas: ele grava atributos `style` no HTML do servidor e injeta um `<style>` para travar a rolagem do modal. As duas coisas aparecem no navegador (violação de CSP e rolagem que não trava), e o teste que as pegou foi uma sonda com Playwright contra o build de produção.

Feito:

- `@vira/ui` agora exporta componentes (`src/index.ts`): Button e IconButton, Tooltip, Spinner, Skeleton, Badge, Alert, Input (texto, e-mail, telefone, data e hora nativos), PasswordInput, SearchInput, Textarea, Select, Checkbox, RadioGroup/Radio, QuantityStepper, Modal (bottom sheet no celular), DropdownMenu, Toast (`ToastProvider` e `useToast`), EmptyState, Header e Footer, mais `CspNonce`.
- Radix para Dialog, DropdownMenu, Select, Toast, Tooltip e Slot; ícones Lucide com traço 1,75 num único `Icon`; sem `tailwind-merge` (ver decisões); nenhum valor arbitrário nem `style` inline (a regra de lint passa).
- O web consome o pacote (`@source` no `globals.css`); o `EmptyState` saiu do web para o pacote; header e footer do web usam `Header`/`Footer` do pacote, mas continuam com o conteúdo de hoje (só o logo; o texto de modo de teste). As páginas 404 e de erro usam o `Button`.
- `/dev/design-system` mostra cada componente em todos os estados (hover, foco e pressionado desenhados com os mesmos tokens; os componentes seguem interativos).
- Testes: 250+ unitários no `@vira/ui` (variantes, estados, teclado, ARIA: `aria-busy` no botão, `aria-invalid`/`aria-describedby` nos campos, foco preso e `Esc` no modal, `aria-live` no stepper e no toast) e um E2E por bloco da página com axe, mais um com cada camada aberta (modal, menu, select, tooltip, toast), em desktop e mobile. Outros testes de navegador: nenhuma violação de CSP ao abrir todas as camadas, HTML do servidor sem `style`, rolagem travada e foco preso no modal, bottom sheet no celular, select abrindo acima do modal.
- Prints novos de modal e menu em `docs/assets/screenshots/` (desktop e mobile); o script `pnpm --filter @vira/web screenshots` agora tira os dois.

Decisões tomadas por conta própria:

- **Checkbox e radio nativos em vez de Radix.** O Radix escreve inputs "bolha" com `style` inline no HTML do servidor; a CSP bloqueia e os controles nativos ficam visíveis até hidratar. Nativo mantém teclado, formulário e leitor de tela do navegador e funciona sem JavaScript. O grupo de radio é `fieldset role="radiogroup"` com `legend`.
- **Select:** botão estático no servidor, Radix depois de montar. **Toast:** a região de notificações só nasce no navegador.
- **`CspNonce` + `get-nonce`:** o `react-remove-scroll` (usado pelo Radix) injeta um `<style>`; o layout entrega o nonce da requisição ao pacote, que o repassa ao `react-remove-scroll` e ao viewport do Select. `get-nonce` entrou como dependência direta do `@vira/ui` (já era transitiva).
- **`z-dropdown` de 20 para 45** (acima do modal, abaixo do toast): senão um select aberto dentro de um modal ficava escondido atrás dele. Documentado no DESIGN 2.7.
- **Tokens novos pedidos pelo DESIGN.md:** `duration-pulse` (1,2 s do skeleton), `delay-skeleton` (150 ms), larguras do modal (`max-w-dialog`/`dialog-wide`, 480/640 px) e as animações das camadas; mais dois utilitários que leem as variáveis do Radix (`min-w-menu-trigger`, `max-h-menu-available`) para não precisar de valor arbitrário.
- **Sem `tailwind-merge`:** ele confunde `text-label` (tamanho) com `text-ink` (cor), pois ambos são tokens. Aparência e caixa são `cva`s separados com classes que não se sobrepõem.
- **Stepper de quantidade:** nos limites o botão fica `aria-disabled`, não `disabled`, para o foco do teclado não se perder.
- **Tooltip** entrou (não estava na lista da N2) porque o DESIGN 3.1 manda todo botão só com ícone ter um.
- **O header do web ficou `sticky`, com a borda inferior só depois de rolar**, como diz o DESIGN 3.11 (antes tinha borda fixa). O estado vazio ganhou o respiro de 64 px do DESIGN 3.9 e passou a ser `h3` por padrão (`h2` nas páginas 404 e de erro, que têm `h1` oculto).
- **Pendente de propósito:** menus com mais de 6 itens virarem bottom sheet no celular (DESIGN 3.6). Nenhum menu do MVP chega a isso; entra com o primeiro que precisar. Registrado no ROADMAP.

Sobre o processo: o commit `fix(ui): give the select viewport style the CSP nonce` levou junto, por um `git add -A`, os arquivos da página `/dev/design-system` (`feat(web)`). Não reescrevi o histórico (regra: sem amend automático); a mensagem do commit descreve só o conserto do Select.

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
