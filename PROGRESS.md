# Diário de bordo

Arquivo para retomar o trabalho em outra sessão. **No início de cada sessão:** ler este arquivo e o [docs/ROADMAP.md](docs/ROADMAP.md), confirmar o estado do repositório (`git status`, PRs abertos) e dizer qual é o próximo passo antes de começar.

## Estado atual

- **Marco:** 0 — Fundação
- **Entrega em andamento:** F1 — Planejamento técnico e de design (`docs/planejamento-inicial`, PR draft)
- **Próximo passo:** depois da revisão e do merge do F1 pelo mantenedor, iniciar **F2 — Ferramentas do workspace** (`chore/workspace-tooling`).
- **Bloqueios:** nenhum.

## Regras que valem sempre

- Nunca commitar na `main`; um PR por entrega do roadmap, aberto como draft.
- Commits por responsabilidade, Conventional Commits, em inglês; sem squash ou amend automático.
- Push da branch e PR draft são permitidos; **merge e deploy só com autorização explícita** do mantenedor.
- Todo PR de código: testes, CI verde, docs e `PROGRESS.md` atualizados. PRs de interface: prints de desktop e mobile, sem mudança de lógica.
- Decisão mudou → novo ADR substituindo o anterior.
- Nada de segredos, `.env` ou dados reais no repositório.
- Código e commits em inglês; documentação em português (README também em inglês).

## Registro

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
