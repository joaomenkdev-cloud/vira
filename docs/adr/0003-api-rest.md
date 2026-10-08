# ADR-0003: API REST versionada com OpenAPI e erros RFC 9457

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

A API serve o próprio web app, mas é pública e faz parte do portfólio: precisa ser fácil de entender, testar e consumir por terceiros.

## Decisão

- REST sob `/api/v1`, JSON em `camelCase`.
- OpenAPI 3.1 gerado a partir dos schemas **Zod** de `packages/shared`, servido em `/docs`.
- Erros sempre em `application/problem+json` (**RFC 9457**) com `requestId`.
- Paginação por **cursor** opaco e assinado (estável sob inserções, sem `OFFSET` caro).
- `Idempotency-Key` obrigatório na criação de pedidos.

## Alternativas consideradas

- **GraphQL** — flexível, mas complica cache HTTP, rate limit por operação e autorização por campo; o consumo aqui é previsível.
- **tRPC** — ótimo para TypeScript ponta a ponta, mas acopla o cliente ao servidor e não gera um contrato público padrão.
- **Paginação por offset** — resultados duplicados ou pulados quando há inserções, e custo crescente em páginas profundas.

## Consequências

- Contrato único (Zod) para validação, tipos e documentação.
- Clientes tratam erros de forma uniforme.
- Mudanças incompatíveis exigem `/api/v2`.
