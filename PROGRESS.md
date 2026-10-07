# Diário de bordo

Arquivo para retomar o trabalho em outra sessão. **No início de cada sessão:** ler este arquivo e o [docs/ROADMAP.md](docs/ROADMAP.md), confirmar o estado do repositório (`git status`, PRs abertos) e dizer qual é o próximo passo antes de começar.

## Estado atual

- **Marco:** 0 — Fundação
- **Entregas abertas:**
  - F1 — Planejamento (`docs/planejamento-inicial`, PR #1 draft) — aguardando revisão e merge.
  - F2 — Ferramentas do workspace (`chore/workspace-tooling`, PR #2 draft, empilhado sobre o #1) — aguardando revisão.
- **Próximo passo:** depois do merge do #1, mudar a base do #2 para `main`; depois do merge do #2, iniciar **F3 — Esqueleto da API** (`feat/api-skeleton`).
- **Bloqueios:** nenhum técnico. As entregas estão empilhadas porque a `main` ainda não tem o F1.

## Regras que valem sempre

- Nunca commitar na `main`; um PR por entrega do roadmap, aberto como draft.
- Commits por responsabilidade, Conventional Commits, em inglês; sem squash ou amend automático.
- Push da branch e PR draft são permitidos; **merge e deploy só com autorização explícita** do mantenedor.
- Todo PR de código: testes, CI verde, docs e `PROGRESS.md` atualizados. PRs de interface: prints de desktop e mobile, sem mudança de lógica.
- Decisão mudou → novo ADR substituindo o anterior.
- Nada de segredos, `.env` ou dados reais no repositório.
- Código e commits em inglês; documentação em português (README também em inglês).

## Registro

### 2026-10-07 — F2: ferramentas do workspace

Feito:

- Turborepo (`turbo.json`) com as tarefas `build`, `typecheck`, `lint` e `test`; scripts na raiz e `pnpm check` reproduzindo o CI.
- `packages/config` (`@vira/config`): tsconfig estrito (`base`, `library`), ESLint flat config (typescript-eslint strict type-checked + regras de fronteira), Prettier e preset do Vitest.
- Regras de fronteira testadas (16 testes): apps não importam apps, pacotes não importam apps, `domain` sem framework nem SDK de infraestrutura, `application` e `http` sem SDK de infraestrutura.
- CI: job único com format, Markdown, lint, typecheck, test e build, com cache do Turborepo; CodeQL analisando `javascript-typescript`.
- Pre-commit: Prettier nos arquivos em stage.
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
