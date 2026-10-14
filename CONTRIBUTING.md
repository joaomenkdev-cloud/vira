# Como contribuir

Obrigado pelo interesse no Vira. Este guia resume como o projeto é desenvolvido.

## Antes de começar

1. Leia o [`PROGRESS.md`](PROGRESS.md) e o [`docs/ROADMAP.md`](docs/ROADMAP.md) para saber o estado atual.
2. Leia os ADRs em [`docs/adr/`](docs/adr/) — eles explicam por que as coisas são como são.
3. Para mudanças grandes, abra uma issue antes de escrever código.

## Ambiente

- Node.js 22 LTS (`.nvmrc`)
- pnpm 9 (`corepack enable`)
- Docker (PostgreSQL, Redis, SeaweedFS e Mailpit locais, via `docker-compose.yml`)
- [gitleaks](https://github.com/gitleaks/gitleaks#installing) no `PATH` para o hook de pre-commit

```bash
corepack enable
pnpm install
```

`pnpm install` instala os hooks de Git (lefthook): gitleaks, Prettier e lint de Markdown nos arquivos em stage.

### Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm check` | Tudo o que o CI roda: formatação, Markdown, lint, tipos, testes e build |
| `pnpm lint` | ESLint em todos os workspaces (via Turborepo) |
| `pnpm typecheck` | `tsc --noEmit` em todos os workspaces |
| `pnpm test` | Vitest em todos os workspaces |
| `pnpm build` | Build de todos os workspaces, na ordem de dependência |
| `pnpm format` / `pnpm format:check` | Prettier (código, JSON, YAML) |
| `pnpm lint:md` | markdownlint na documentação |

Rode `pnpm check` antes de abrir um PR.

### Infraestrutura local

```bash
pnpm infra:up     # Postgres 16, Redis, SeaweedFS (S3) e Mailpit, esperando os healthchecks
pnpm infra:down   # para tudo (os dados ficam nos volumes do Docker)
```

| Serviço | Endereço | Uso |
| --- | --- | --- |
| PostgreSQL 16 | `127.0.0.1:5432` (`vira` / `vira_local`) | Banco |
| Redis | `127.0.0.1:6379` | Filas e rate limit |
| SeaweedFS (S3) | `http://127.0.0.1:8333` | Imagens dos eventos ([ADR-0012](docs/adr/0012-armazenamento-local-seaweedfs.md)) |
| Mailpit | SMTP `127.0.0.1:1025`, UI `http://localhost:8025` | E-mails locais |

As credenciais acima só existem no ambiente local e estão no `.env.example`.

### Banco de dados

```bash
pnpm --filter @vira/api db:deploy    # aplica as migrations
pnpm --filter @vira/api db:migrate   # cria uma migration nova a partir do schema.prisma
```

O client do Prisma é gerado em `apps/api/src/generated` (ignorado pelo Git) pela tarefa `db:generate`, que o Turborepo roda antes de `lint`, `typecheck`, `test` e `build`. Invariantes que o Prisma não expressa (`CHECK`, índices parciais, triggers) são escritos em SQL nas migrations.

### Testes de integração

Os testes em `apps/api/test/integration` sobem Postgres, Redis e, nos testes de e-mail, o Mailpit reais com Testcontainers. Sem Docker, eles são pulados com aviso; no CI (`CI=true`) a falta de Docker é erro.

### Worker e filas

O trabalho em segundo plano (despachar a outbox para as filas BullMQ e consumir a fila `email`) roda no **worker**, que usa o mesmo código da API:

```bash
pnpm --filter @vira/api dev:worker     # desenvolvimento, com recarga
pnpm --filter @vira/api build && pnpm --filter @vira/api start:worker
```

`WORKER_MODE` define onde o trabalho roda:

| Valor | Comportamento |
| --- | --- |
| `separate` (padrão) | Só o processo do worker despacha. A API apenas grava na outbox |
| `embedded` | O despacho **e o consumo das filas** (e-mails) rodam dentro da própria API, para hospedagem sem background worker ([ADR-0011](docs/adr/0011-hospedagem.md)) |

Quem consome uma fila registra um handler por tipo de mensagem (`JobHandlerRegistry`, em `platform/queue`); o worker de cada fila encaminha o job ao handler do tipo. Exemplo: `modules/auth/infra/auth-job-handlers.ts`.

`OUTBOX_POLL_INTERVAL_MS` (padrão 5000, de 50 a 60000) define a frequência da verificação. Para gravar um efeito colateral, um módulo injeta `Outbox` (`modules/outbox/application/public-api.ts`) e chama `publish(evento, tx)` dentro da transação que muda o estado, obtida de `TransactionRunner`.

### Rodando o web

```bash
pnpm turbo run dev --filter=@vira/web  # http://localhost:3001; compila o @vira/shared antes (proxy de /api/v1 para a API local)
pnpm --filter @vira/web build && pnpm --filter @vira/web start
pnpm --filter @vira/web test:e2e   # Playwright + axe, em desktop e mobile
pnpm --filter @vira/web screenshots  # prints para PRs de interface (servidor com VIRA_DESIGN_SYSTEM=true)
```

- `API_ORIGIN` (veja `apps/web/.env.example`) define para onde `/api/v1` é encaminhado. É lido **no build**: rebuilde ao mudá-lo.
- O E2E sobe uma API falsa na porta 3000 e o web na 3101. Rode `pnpm --filter @vira/web build` antes; no primeiro uso, `pnpm --filter @vira/web exec playwright install chromium`.
- O web importa o `@vira/shared` compilado (`dist/`). `pnpm --filter @vira/web dev` direto usa o que estiver lá, que pode estar velho ("Export ... doesn't exist in target module"); o `turbo run dev` compila antes.
- **Sem a API (e sem Docker):** suba a API falsa do E2E (`node e2e/fake-api.ts` em `apps/web`, Node 22.18+) e abra `http://localhost:3001`. Ela não manda e-mail: os links ficam em `http://127.0.0.1:3000/__test/mail?to=<email>`. `VIRA_OAUTH_PROVIDERS=google,github` mostra os botões sociais (GitHub entra numa conta de teste, Google mostra o erro).
- Toda página é renderizada a cada requisição (a CSP usa nonce, veja [ARCHITECTURE.md](docs/ARCHITECTURE.md#8-aplicação-web)). Não use estilos inline nem scripts inline sem nonce: a CSP os bloqueia.

### E-mails locais (Mailpit)

Nenhum e-mail sai da sua máquina em desenvolvimento: a API envia por SMTP para o Mailpit (`SMTP_URL=smtp://127.0.0.1:1025` no `.env.example`), que guarda tudo e mostra em **<http://localhost:8025>**. Para ver o fluxo de cadastro de ponta a ponta:

1. `pnpm infra:up`, aplique as migrations e suba a API com `WORKER_MODE=embedded` (ou rode também o worker: `pnpm --filter @vira/api dev:worker`). Sem um dos dois ninguém consome a fila `email`.
2. `POST /api/v1/auth/register` (pelo `/docs` ou com `curl`).
3. Abra o Mailpit: o e-mail "Confirme seu e-mail na Vira" traz o link `.../verificar-email#token=...`. Copie o token (depois de `#token=`) e envie em `POST /api/v1/auth/email/verify`.

Os testes de integração fazem exatamente isso, lendo as mensagens pela API HTTP do Mailpit (`apps/api/test/support/mailpit-inbox.ts`). `MAIL_FROM` (opcional fora de produção) define o remetente; em produção `SMTP_URL` precisa de `smtps://` ou `requireTLS=true`.

### Login social local (Google e GitHub)

Opcional: sem credenciais, as rotas `/api/v1/auth/oauth/*` respondem `404` e o resto funciona. Para testar de verdade, crie um app de teste em cada provedor e preencha as variáveis comentadas no `apps/api/.env.example`:

- **Google:** Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth do tipo "Aplicativo da Web", com a URI de redirecionamento `http://localhost:3001/api/v1/auth/oauth/google/callback`.
- **GitHub:** Settings → Developer settings → OAuth Apps, com a callback `http://localhost:3001/api/v1/auth/oauth/github/callback`.

A callback fica na origem do web porque o navegador só fala com ele (o web encaminha `/api/v1` para a API). Abra `http://localhost:3001/api/v1/auth/oauth/google` no navegador para começar. Os testes não usam os provedores reais: os adaptadores são testados contra servidores HTTP falsos e o fluxo completo usa um provedor falso (`apps/api/test/support/fake-oauth-provider.ts`).

### Rodando a API

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @vira/api dev
```

- `http://localhost:3000/api/v1/health/live` — o processo está no ar;
- `http://localhost:3000/docs` — OpenAPI (desligado por padrão em produção).

A API não sobe com variáveis de ambiente inválidas: a mensagem lista cada variável e a regra quebrada, nunca o valor.

Toda rota nova precisa declarar `@Public()` ou `@RequireRole(...)`; um teste varre as rotas e falha se alguma não declarar. Erros esperados são lançados como `ProblemException` com um tipo documentado em [`docs/API.md`](docs/API.md#tipos-de-problema).

### Configuração compartilhada

Todo workspace estende `@vira/config` (`packages/config`):

- `@vira/config/tsconfig/base.json` (e `library.json` para `packages/*`) — TypeScript estrito;
- `@vira/config/eslint` — `viraConfig({ kind: "app" | "package", tsconfigRootDir })`, com as regras de fronteira entre workspaces e camadas;
- `@vira/config/prettier` e `@vira/config/vitest`.

O TypeScript fica fixado em `~6.0` enquanto o typescript-eslint não suportar a 7.

## Fluxo de trabalho

- Nunca faça commit direto na `main`. Crie uma branch por entrega:
  - `feat/<escopo>-<resumo>`, `fix/...`, `docs/...`, `chore/...`
- Um PR por entrega do roadmap, pequeno e revisável.
- Commits por responsabilidade, seguindo [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

  ```text
  feat(orders): reserve inventory with expiry
  fix(checkin): reject tickets from another event
  docs(adr): supersede ADR-0005 with rotating keys
  ```

  Escopos comuns: `api`, `web`, `ui`, `shared`, `config`, `auth`, `users`, `events`, `catalog`, `orders`, `payments`, `tickets`, `checkin`, `audit`, `worker`, `ci`, `deps`.
- Sem squash ou amend automático: o histórico conta a história do trabalho.

## Definição de pronto de um PR de código

- [ ] Testes cobrindo o comportamento novo (unitários no `domain`/`application`, integração na `http`/`infra`).
- [ ] CI verde: lint, tipos, testes e build.
- [ ] Autorização testada para rotas novas (quem pode e quem **não** pode).
- [ ] Documentação afetada atualizada (`docs/*`, ADR novo ou substituído se uma decisão mudou).
- [ ] `PROGRESS.md` atualizado.
- [ ] PR de interface: prints de desktop e mobile, e nenhuma mudança de lógica de negócio.
- [ ] Nenhum segredo, `.env` ou dado pessoal real no diff.

## Idiomas

- Código, identificadores, mensagens de commit e de log: **inglês**.
- Documentação: **português**. O README também tem versão em inglês (`README.en.md`).
- Textos da interface: português (pt-BR).

## Arquitetura em uma frase

Cada módulo do backend tem as camadas `domain` → `application` → `infra`/`http`, e as dependências apontam para dentro. Detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Código de conduta

Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).
