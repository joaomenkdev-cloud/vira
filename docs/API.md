# API

API REST versionada em **`/api/v1`**, documentada em OpenAPI 3.1 em **`/docs`** (gerada a partir dos schemas Zod de `packages/shared`). Decisão em [ADR-0003](adr/0003-api-rest.md).

Este documento é o contrato planejado. Mudanças incompatíveis exigem `/api/v2`; mudanças compatíveis (campos novos opcionais) não.

## Convenções

### Formato

- JSON (`application/json; charset=utf-8`), campos em `camelCase`.
- Datas em ISO 8601 UTC (`2026-03-14T00:00:00Z`); eventos também retornam `timezone` (IANA).
- Dinheiro como objeto: `{ "amountCents": 8000, "currency": "BRL" }`.
- IDs são UUID v7 em texto.
- Corpo máximo: 100 kB (o webhook aceita até 1 MB, body bruto).

### Autenticação

| Mecanismo | Uso |
| --- | --- |
| Cookie `__Host-vira_at` | JWT de acesso (10 min), `HttpOnly; Secure; SameSite=Lax; Path=/`. Enviado automaticamente pelo navegador via proxy de mesma origem. |
| Cookie `__Secure-vira_rt` | Refresh token opaco (rotativo), `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`. |
| `Authorization: Bearer <jwt>` | Aceito para clientes não-navegador (testes, futuros apps). Não exige CSRF. |
| Header `X-CSRF-Token` | Obrigatório em `POST`/`PUT`/`PATCH`/`DELETE` autenticados por cookie. Padrão double-submit com token assinado (HMAC com o id da sessão), obtido em `GET /auth/csrf`. A API também confere `Origin`/`Sec-Fetch-Site`. |

Detalhes em [ADR-0005](adr/0005-autenticacao-e-tokens.md).

### Papéis

| Papel | Pode |
| --- | --- |
| `PUBLIC` | Sem login: vitrine, página do evento, cadastro, login. |
| `BUYER` | Comprar, ver os **próprios** pedidos e ingressos, gerenciar a própria conta. Todo usuário logado é BUYER. |
| `ORGANIZER` | Tudo de BUYER + gerenciar os **próprios** eventos e fazer check-in neles. |
| `ADMIN` | Tudo + consultar auditoria e gerenciar papéis. |

**Regra de autorização em recursos:** além do papel, todo acesso a recurso confere a **posse** (pedido → `buyerId`, ingresso → pedido do usuário, evento → `organizerId`). Recurso de outra pessoa responde **`404`**, não `403`, para não revelar existência (OWASP API1 — BOLA). A verificação acontece na camada `application`, nunca só no controller.

### Paginação por cursor

```http
GET /api/v1/events?limit=12&cursor=eyJzIjoiMjAyNi0wMy0xNFQwMDowMDowMFoiLCJpZCI6Ii4uLiJ9
```

```json
{
  "data": [ /* ... */ ],
  "page": { "nextCursor": "eyJ...", "limit": 12 }
}
```

- `limit`: 1–50, padrão 20.
- `cursor` é opaco (base64url de `{ chave de ordenação, id }`), assinado com HMAC para não ser forjado. `nextCursor: null` indica fim.
- A ordenação é sempre estável (chave + `id` como desempate).

### Idempotência

`POST /orders` exige o header `Idempotency-Key` (UUID gerado pelo cliente por tentativa de compra).

| Situação | Resposta |
| --- | --- |
| Primeira requisição | `201 Created` |
| Mesma chave e mesmo corpo | `200 OK` com o mesmo pedido (header `Idempotent-Replayed: true`) |
| Mesma chave, corpo diferente | `422` `idempotency-key-reused` |
| Requisição com a mesma chave ainda em processamento | `409` `request-in-progress` |

`POST /orders/{id}/payment` é idempotente pelo próprio pedido (sempre devolve o mesmo PaymentIntent).

### Erros — RFC 9457

Todo erro é `application/problem+json`:

```json
{
  "type": "https://github.com/joaomenkdev-cloud/vira/blob/main/docs/API.md#insufficient-inventory",
  "title": "Ingressos insuficientes",
  "status": 409,
  "detail": "Restam 1 ingresso(s) de \"Pista – Lote 1\".",
  "instance": "/api/v1/orders",
  "requestId": "01J9Z7K3Q8...",
  "errors": []
}
```

- `type` aponta para a âncora correspondente na tabela abaixo.
- `errors` aparece em `validation-failed`: `[{ "path": "items.0.quantity", "message": "..." }]`.
- `5xx` nunca expõe detalhes internos; o `requestId` permite achar o log.
- Rate limit responde `429` com `Retry-After` e headers `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset`.

#### Tipos de problema

| `type` (âncora) | Status | Quando |
| --- | --- | --- |
| <a id="validation-failed"></a>`validation-failed` | 400 | Corpo, query ou params inválidos |
| <a id="unauthenticated"></a>`unauthenticated` | 401 | Sem sessão ou token expirado |
| <a id="invalid-credentials"></a>`invalid-credentials` | 401 | Login falhou (mensagem genérica, sem dizer se o e-mail existe) |
| <a id="csrf-failed"></a>`csrf-failed` | 403 | Token CSRF ausente/inválido ou origem não permitida |
| <a id="email-not-verified"></a>`email-not-verified` | 403 | Senha correta, mas e-mail ainda não verificado (só revelado a quem acertou a senha) |
| <a id="forbidden"></a>`forbidden` | 403 | Papel insuficiente para a **função** (ex.: BUYER chamando rota de organizador) |
| <a id="not-found"></a>`not-found` | 404 | Recurso inexistente **ou de outra pessoa** |
| <a id="insufficient-inventory"></a>`insufficient-inventory` | 409 | Estoque não comporta a quantidade |
| <a id="pending-order-exists"></a>`pending-order-exists` | 409 | Já existe pedido PENDING do comprador para o evento |
| <a id="invalid-state-transition"></a>`invalid-state-transition` | 409 | Ex.: pagar pedido expirado, publicar evento incompleto |
| <a id="request-in-progress"></a>`request-in-progress` | 409 | Mesma `Idempotency-Key` em processamento |
| <a id="idempotency-key-reused"></a>`idempotency-key-reused` | 422 | Mesma chave com outro corpo |
| <a id="sales-closed"></a>`sales-closed` | 422 | Fora da janela de vendas ou evento não publicado/encerrado |
| <a id="rate-limited"></a>`rate-limited` | 429 | Limite excedido |
| <a id="internal-error"></a>`internal-error` | 500 | Falha inesperada |

## Endpoints

Legenda de papel: `PUBLIC`, `BUYER` (qualquer usuário autenticado), `ORGANIZER*` (organizador **dono** do recurso), `OWNER` (dono do recurso), `ADMIN`, `STRIPE` (assinatura do webhook). Rate limits por IP (`/ip`), por conta (`/conta`) ou por operador.

### Saúde e documentação

| Método | Rota | Papel | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| GET | `/health/live` | PUBLIC | `200 { status: "ok" }` | — |
| GET | `/health/ready` | PUBLIC | `200` (banco e Redis acessíveis) | `503` |
| GET | `/docs` | PUBLIC (dev) / ADMIN (prod) | `200` OpenAPI UI | `404` |

### Autenticação (`auth`)

| Método | Rota | Papel | Corpo | Sucesso | Erros | Rate limit |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/auth/csrf` | PUBLIC | — | `200 { csrfToken }` + cookie | — | — |
| POST | `/auth/register` | PUBLIC | `{ name, email, password }` | `202` sempre, com a mesma resposta para e-mail novo ou existente; envia link de verificação (ou aviso "você já tem conta") | 400, 429 | 5/h/ip |
| POST | `/auth/login` | PUBLIC | `{ email, password }` | `200 { user }` + cookies | 400, 401 `invalid-credentials`, 403 `email-not-verified`, 429 | 10/15 min/ip e 5/15 min/conta |
| POST | `/auth/refresh` | cookie de refresh | — | `204` + cookies rotacionados | 401 (inclusive reuso detectado → família revogada) | 30/min/ip |
| POST | `/auth/logout` | BUYER | — | `204`, revoga a sessão e limpa cookies | 401 | — |
| POST | `/auth/logout-all` | BUYER | — | `204`, revoga todas as sessões | 401 | — |
| GET | `/auth/oauth/{provider}` | PUBLIC | `provider ∈ google, github` | `302` para o provedor (state + PKCE) | 404 | 20/min/ip |
| GET | `/auth/oauth/{provider}/callback` | PUBLIC | `code`, `state` | `302` para o web + cookies | `302` para tela de erro | 20/min/ip |
| POST | `/auth/email/verify` | PUBLIC | `{ token }` | `200 { user }` + cookies (verificar o e-mail inicia a sessão) | 400, 410 (expirado/usado) | 10/h/ip |
| POST | `/auth/email/resend` | BUYER | — | `204` | 429 | 3/h/conta |
| POST | `/auth/password/forgot` | PUBLIC | `{ email }` | `202` sempre (não revela se o e-mail existe) | 429 | 5/h/ip |
| POST | `/auth/password/reset` | PUBLIC | `{ token, password }` | `204`; revoga todas as sessões | 400, 410 | 10/h/ip |

### Conta e privacidade (`users`)

| Método | Rota | Papel | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| GET | `/me` | BUYER | — | `200 { id, name, email, role, emailVerified, organizer? }` | 401 |
| PATCH | `/me` | BUYER | `{ name }` | `200 { user }` | 400, 401 |
| POST | `/me/password` | BUYER | `{ currentPassword, newPassword }` | `204`; revoga as outras sessões | 400, 401 |
| POST | `/me/organizer` | BUYER | `{ displayName }` | `201 { organizerProfile }`; papel → ORGANIZER | 400, 409 |
| GET | `/me/export` | BUYER | — | `200` JSON com todos os dados pessoais do titular (conta, pedidos, ingressos, perfil de organizador) — `Content-Disposition: attachment` | 401, 429 (3/dia) |
| DELETE | `/me` | BUYER + reautenticação | `{ password }` ou reautenticação OAuth recente (< 5 min), `{ confirm: "EXCLUIR" }` | `202`; conta anonimizada, sessões revogadas, ingressos futuros cancelados | 400, 401, 409 (organizador com eventos futuros publicados) |

### Vitrine (`catalog`) — somente eventos publicados

| Método | Rota | Papel | Query | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| GET | `/events` | PUBLIC | `q`, `city`, `from`, `to`, `limit`, `cursor` | `200 { data: EventSummary[], page }` ordenado por `startsAt` | 400 |
| GET | `/events/featured` | PUBLIC | — | `200 { data: EventSummary[] }` (até 6 próximos com vendas abertas) | — |
| GET | `/events/{slug}` | PUBLIC | — | `200 EventDetail` (inclui `ticketTypes` com `available`, `priceFrom`, `isDemo`, crédito da imagem) | 404 |

`EventSummary`: `{ id, slug, title, startsAt, endsAt, timezone, venue: { name, city }, image: { url, alt, blurDataUrl }, priceFrom: Money \| null, status, isDemo, soldOut }`.

`available` é calculado (`capacity − sold − reserved`) e pode ser arredondado para faixas ("últimos ingressos") para não expor números exatos, a critério do organizador.

### Eventos do organizador (`events`)

| Método | Rota | Papel | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| GET | `/organizer/events` | ORGANIZER | `status`, `limit`, `cursor` | `200 { data, page }` — só eventos do próprio organizador | 401, 403 |
| POST | `/organizer/events` | ORGANIZER | `{ title, descriptionMd, startsAt, endsAt, timezone, venue }` | `201 Event` (DRAFT) | 400, 401, 403 |
| GET | `/organizer/events/{id}` | ORGANIZER* | — | `200 Event` | 404 |
| PATCH | `/organizer/events/{id}` | ORGANIZER* | campos parciais | `200 Event` | 400, 404, 409 |
| DELETE | `/organizer/events/{id}` | ORGANIZER* | — | `204` (só DRAFT) | 404, 409 |
| POST | `/organizer/events/{id}/publish` | ORGANIZER* | — | `200 Event` | 404, 409 `invalid-state-transition` (com a lista do que falta) |
| POST | `/organizer/events/{id}/cancel` | ORGANIZER* | `{ reason }` | `200 Event` | 404, 409 |
| POST | `/organizer/events/{id}/image/upload-url` | ORGANIZER* | `{ contentType, sizeBytes }` | `201 { uploadId, url, headers, expiresAt }` (PUT pré-assinado, 5 min) | 400 (tipo/tamanho), 404, 429 |
| POST | `/organizer/events/{id}/image` | ORGANIZER* | `{ uploadId, alt }` | `200 Event` (após validar o objeto) | 400, 404, 422 (arquivo não confere) |
| POST | `/organizer/events/{id}/ticket-types` | ORGANIZER* | `{ name, description?, priceCents, capacity, maxPerOrder?, salesStartAt?, salesEndAt? }` | `201 TicketType` | 400, 404 |
| PATCH | `/organizer/ticket-types/{id}` | ORGANIZER* | campos parciais | `200 TicketType` | 400, 404, 409 (capacidade < vendidos + reservados) |
| DELETE | `/organizer/ticket-types/{id}` | ORGANIZER* | — | `204` (só sem vendas e reservas) | 404, 409 |
| GET | `/organizer/events/{id}/sales` | ORGANIZER* | — | `200 { byTicketType: [{ sold, reserved, capacity, grossCents }], checkedIn }` — agregados, sem dados pessoais | 404 |

### Pedidos (`orders`)

| Método | Rota | Papel | Corpo | Sucesso | Erros | Rate limit |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/orders` | BUYER | `{ eventId, items: [{ ticketTypeId, quantity }] }` + `Idempotency-Key` | `201 Order` (PENDING, `expiresAt`) | 400, 401, 404, 409, 422, 429 | 10/min/conta, 30/min/ip |
| GET | `/orders` | BUYER | `limit`, `cursor` | `200 { data: OrderSummary[], page }` — **só os próprios** | 401 | — |
| GET | `/orders/{id}` | OWNER | — | `200 Order` | 404 | — |
| PUT | `/orders/{id}/holders` | OWNER | `{ holders: [{ orderItemId, names: string[] }] }` | `200 Order` | 400, 404, 409 (não PENDING) | — |
| POST | `/orders/{id}/payment` | OWNER | — | `200 { clientSecret, publishableKey }` | 404, 409 (não PENDING ou titulares faltando) | 10/min/conta |
| POST | `/orders/{id}/extend` | OWNER | — | `200 Order` (novo `expiresAt`) | 404, 409 (já estendido, fora da janela de 2 min) | — |
| POST | `/orders/{id}/cancel` | OWNER | — | `200 Order` (CANCELED) | 404, 409 | — |

`Order`: `{ id, publicCode, status, event: EventSummary, items: [{ ticketTypeId, name, quantity, unitPrice: Money, subtotal: Money }], total: Money, expiresAt, extensionAvailable, holders, paidAt }`.

O cliente **nunca envia preço ou total**. Qualquer campo extra no corpo é rejeitado (`strict` no Zod), o que também cobre OWASP API3 (mass assignment).

### Pagamentos (`payments`)

| Método | Rota | Papel | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| POST | `/payments/stripe/webhook` | STRIPE | Evento do Stripe (body bruto) + `Stripe-Signature` | `200` (inclusive para evento repetido ou não tratado) | `400` assinatura inválida/timestamp fora da tolerância |

Eventos tratados: `payment_intent.succeeded`, `payment_intent.payment_failed` (só registro), `charge.refunded` (confirma reembolso). Fica fora do proxy do web, sem CSRF e sem cookies; protegido exclusivamente pela assinatura.

### Ingressos (`tickets`)

| Método | Rota | Papel | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| GET | `/tickets` | BUYER | `200 { data: TicketSummary[], page }` — só ingressos de pedidos do próprio usuário; filtro `when=upcoming\|past` | 401 |
| GET | `/tickets/{id}` | OWNER | `200 Ticket` com `qrToken` | 404 |

`Ticket`: `{ id, code, status, holderName, ticketType: { name }, event: EventSummary, usedAt, qrToken }`. O `qrToken` só é devolvido ao dono e nunca aparece em listagens, logs ou URLs.

### Check-in (`checkin`)

| Método | Rota | Papel | Corpo | Sucesso | Erros | Rate limit |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/checkin/scan` | ORGANIZER* do evento | `{ eventId, token }` | `200 { result: VALID \| ALREADY_USED \| WRONG_EVENT \| INVALID, ticket?: { code, holderName, ticketType }, usedAt? }` | 400, 401, 404 (evento não é seu), 429 | 120/min/operador |
| POST | `/checkin/code` | ORGANIZER* do evento | `{ eventId, code }` | mesmo formato | 400, 401, 404, 429 | 20/min/operador |
| GET | `/organizer/events/{id}/checkin/stats` | ORGANIZER* | — | `200 { checkedIn, total, lastScans: [...] }` | 404 | — |

### Administração (`admin`)

| Método | Rota | Papel | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| GET | `/admin/audit-logs` | ADMIN | `200 { data, page }` com filtros `action`, `entityType`, `entityId`, `actorId`, `from`, `to` | 401, 403 |
| PATCH | `/admin/users/{id}/role` | ADMIN | `200 { user }` (auditado) | 400, 401, 403, 404 |

## Exemplos

### Criar pedido

```http
POST /api/v1/orders
Idempotency-Key: 3b6f1c5e-0a52-4c39-9e5f-0f6d0a0b9c2a
X-CSRF-Token: <token>
Content-Type: application/json

{
  "eventId": "01929e7a-...",
  "items": [{ "ticketTypeId": "01929e7b-...", "quantity": 2 }]
}
```

```http
HTTP/1.1 201 Created
Location: /api/v1/orders/01929e80-...

{
  "id": "01929e80-...",
  "publicCode": "VIRA-ORD-3F8A",
  "status": "PENDING",
  "items": [{ "ticketTypeId": "01929e7b-...", "name": "Pista – Lote 1", "quantity": 2,
              "unitPrice": { "amountCents": 8000, "currency": "BRL" },
              "subtotal": { "amountCents": 16000, "currency": "BRL" } }],
  "total": { "amountCents": 16000, "currency": "BRL" },
  "expiresAt": "2026-03-10T18:10:00Z",
  "extensionAvailable": true
}
```

### Check-in

```http
POST /api/v1/checkin/scan
Content-Type: application/json

{ "eventId": "01929e7a-...", "token": "v1.k1.AZKeexXq....Q2h4" }
```

```json
{ "result": "ALREADY_USED", "usedAt": "2026-03-14T00:42:10Z",
  "ticket": { "code": "VIRA-7KQ2-M9XD", "holderName": "Maria Souza", "ticketType": "Pista – Lote 1" } }
```
