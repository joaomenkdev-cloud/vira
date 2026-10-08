# Como contribuir

Obrigado pelo interesse no Vira. Este guia resume como o projeto é desenvolvido.

## Antes de começar

1. Leia o [`PROGRESS.md`](PROGRESS.md) e o [`docs/ROADMAP.md`](docs/ROADMAP.md) para saber o estado atual.
2. Leia os ADRs em [`docs/adr/`](docs/adr/) — eles explicam por que as coisas são como são.
3. Para mudanças grandes, abra uma issue antes de escrever código.

## Ambiente

- Node.js 22 LTS (`.nvmrc`)
- pnpm 9 (`corepack enable`)
- Docker (PostgreSQL, Redis, MinIO e Mailpit locais — a partir do marco Fundação)
- [gitleaks](https://github.com/gitleaks/gitleaks#installing) no `PATH` para o hook de pre-commit

```bash
corepack enable
pnpm install
```

`pnpm install` instala os hooks de Git (lefthook): gitleaks nos arquivos em stage e lint de Markdown.

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
