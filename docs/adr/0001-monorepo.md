# ADR-0001: Monorepo com pnpm workspaces e Turborepo

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O Vira tem uma API, um worker e uma aplicação web que compartilham contratos (schemas de validação, tipos de resposta, constantes de domínio) e um design system. Mudanças de contrato precisam chegar aos dois lados no mesmo PR, com a mesma checagem de tipos.

## Decisão

Um único repositório com **pnpm workspaces** e **Turborepo**:

- `apps/api` (API + worker), `apps/web`;
- `packages/shared` (schemas Zod e tipos de contrato), `packages/ui` (design system), `packages/config` (tsconfig, ESLint, Vitest, Prettier).

`apps/web` nunca importa de `apps/api`; o único código compartilhado passa por `packages/*`. O Turborepo orquestra `lint`, `typecheck`, `test` e `build` com cache local e no CI.

## Alternativas consideradas

- **Repositórios separados** — contratos duplicados ou publicados como pacote, PRs coordenados entre repositórios; atrito alto para um projeto mantido por uma pessoa.
- **Nx** — mais poderoso, mas com mais conceitos e geradores do que o projeto precisa.
- **npm/yarn workspaces** — o pnpm é mais rápido, economiza disco e o `node_modules` estrito evita dependências fantasmas.

## Consequências

- Um PR muda contrato, API e web de forma atômica e tipada.
- O CI roda só o que mudou (filtro do Turborepo).
- Exige disciplina de fronteiras: regras de lint impedem imports entre apps.
