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

Os testes em `apps/api/test/integration` sobem Postgres e Redis reais com Testcontainers. Sem Docker, eles são pulados com aviso; no CI (`CI=true`) a falta de Docker é erro.

### Worker e filas

O trabalho em segundo plano (hoje: despachar a outbox para as filas BullMQ) roda no **worker**, que usa o mesmo código da API:

```bash
pnpm --filter @vira/api dev:worker     # desenvolvimento, com recarga
pnpm --filter @vira/api build && pnpm --filter @vira/api start:worker
```

`WORKER_MODE` define onde o trabalho roda:

| Valor | Comportamento |
| --- | --- |
| `separate` (padrão) | Só o processo do worker despacha. A API apenas grava na outbox |
| `embedded` | O despacho roda dentro da própria API, para hospedagem sem background worker ([ADR-0011](docs/adr/0011-hospedagem.md)) |

`OUTBOX_POLL_INTERVAL_MS` (padrão 5000, de 50 a 60000) define a frequência da verificação. Para gravar um efeito colateral, um módulo injeta `Outbox` (`modules/outbox/application/public-api.ts`) e chama `publish(evento, tx)` dentro da transação que muda o estado, obtida de `TransactionRunner`.

### Rodando o web

```bash
pnpm --filter @vira/web dev        # http://localhost:3001 (proxy de /api/v1 para a API local)
pnpm --filter @vira/web build && pnpm --filter @vira/web start
pnpm --filter @vira/web test:e2e   # Playwright + axe, em desktop e mobile
pnpm --filter @vira/web screenshots  # prints para PRs de interface (servidor com VIRA_DESIGN_SYSTEM=true)
```

- `API_ORIGIN` (veja `apps/web/.env.example`) define para onde `/api/v1` é encaminhado. É lido **no build**: rebuilde ao mudá-lo.
- O E2E sobe uma API falsa na porta 3000 e o web na 3101. Rode `pnpm --filter @vira/web build` antes; no primeiro uso, `pnpm --filter @vira/web exec playwright install chromium`.
- Toda página é renderizada a cada requisição (a CSP usa nonce, veja [ARCHITECTURE.md](docs/ARCHITECTURE.md#8-aplicação-web)). Não use estilos inline nem scripts inline sem nonce: a CSP os bloqueia.

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
