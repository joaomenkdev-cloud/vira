# ADR-0002: Monólito modular em NestJS com worker separado

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O domínio tem fronteiras claras (auth, users, events, catalog, orders, payments, tickets, checkin, audit), mas o volume e a equipe não justificam a complexidade operacional de microsserviços. Algumas tarefas são assíncronas (expirar reservas, enviar e-mails, reembolsar) e não devem rodar no ciclo da requisição.

## Decisão

- **Um processo de API** NestJS com um módulo por contexto de negócio.
- Cada módulo em camadas `domain` → `application` → `infra`/`http`, com dependências apontando para dentro; `domain` não conhece NestJS nem Prisma.
- Comunicação entre módulos só pela API pública do módulo ou por **eventos de domínio** gravados numa **outbox transacional**.
- **Um worker** com o mesmo código e outro entrypoint (`main.worker.ts`), consumindo filas BullMQ.
- Fronteiras verificadas no CI com `dependency-cruiser`.

## Alternativas consideradas

- **Microsserviços** — transações distribuídas para reserva, pagamento e emissão, mais infraestrutura e mais custo; sem benefício nessa escala.
- **Monólito em camadas sem módulos** — mais simples no início, mas tende a acoplar tudo e dificulta extrair partes no futuro.
- **Jobs dentro do processo da API** — simples, mas um pico de e-mails afetaria a latência da API. Mantido apenas como modo opcional de custo zero ([ADR-0011](0011-hospedagem.md)).

## Consequências

- Transações ACID locais para os fluxos críticos (reserva, pagamento, emissão).
- Módulos podem virar serviços no futuro sem reescrever o domínio.
- Mais arquivos e cerimônia por funcionalidade, compensados por testes de domínio rápidos e sem mocks.
