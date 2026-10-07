# ADR-0004: PostgreSQL 16 com Prisma e migrations versionadas

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

Os fluxos críticos dependem de transações, `CHECK` constraints, índices parciais e updates condicionais. O schema precisa evoluir de forma reprodutível em todos os ambientes.

## Decisão

- **PostgreSQL 16** como única fonte da verdade.
- **Prisma** como ORM e ferramenta de migrations (`prisma migrate`), com migrations SQL versionadas no repositório e revisadas em PR.
- O que o schema do Prisma não expressa (`CHECK`, índices parciais, `pg_trgm`, triggers do log de auditoria, `REVOKE`) entra como SQL dentro das migrations.
- Operações que exigem SQL preciso (reserva condicional, `FOR UPDATE SKIP LOCKED` da outbox) usam `$queryRaw` com template tagged (parametrizado), encapsuladas em repositórios da camada `infra`.
- Testes de integração rodam contra Postgres real via Testcontainers, aplicando as migrations.

## Alternativas consideradas

- **Drizzle** — mais próximo do SQL e leve; o Prisma foi escolhido pela maturidade das migrations e do ecossistema, e porque o SQL cru fica restrito a poucos pontos.
- **TypeORM** — histórico de problemas em migrations e API menos tipada.
- **Knex ou SQL puro** — máximo controle, menos produtividade e tipagem manual.

## Consequências

- Tipos gerados do schema; migrations reproduzíveis.
- Parte das invariantes vive em SQL manual nas migrations, documentadas no [DATA_MODEL.md](../DATA_MODEL.md).
- O Prisma Client fica restrito à camada `infra`; o domínio não depende dele.
