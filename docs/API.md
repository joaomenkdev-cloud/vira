# API

API REST versionada em **`/api/v1`**, documentada em OpenAPI 3.1 em **`/docs`** (gerada a partir dos schemas Zod de `packages/shared`). Decisão em [ADR-0003](adr/0003-api-rest.md).

Este documento é o contrato planejado. Mudanças incompatíveis exigem `/api/v2`; mudanças compatíveis (campos novos opcionais) não.

## Convenções

### Formato

- JSON (`application/json; charset=utf-8`), campos em `camelCase`.
- Datas em ISO 8601 UTC (`2026-03-14T00:00:00Z`); eventos também retornam `timezone` (IANA).
- Dinheiro como objeto: `{ "amountCents": 8000, "currency": "BRL" }`.
- IDs são UUID v7 em texto.
- Corpo máximo: 100 kB, inclusive no webhook do Stripe (que é verificado sobre o body bruto; eventos de PaymentIntent têm poucos kB).

### Autenticação

| Mecanismo | Uso |
| --- | --- |
| Cookie `__Host-vira_at` | JWT de acesso (10 min), `HttpOnly; Secure; SameSite=Lax; Path=/`. Enviado automaticamente pelo navegador via proxy de mesma origem. |
| Cookie `__Secure-vira_rt` | Refresh token opaco (rotativo), `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`. |
| `Authorization: Bearer <jwt>` | Aceito para clientes não-navegador (testes, futuros apps). Não exige CSRF. |
| Header `X-CSRF-Token` | Obrigatório em `POST`/`PUT`/`PATCH`/`DELETE` de rotas que exigem papel quando a sessão vem do cookie de acesso. Padrão double-submit com token assinado (HMAC com o id da sessão), obtido em `GET /auth/csrf`; o valor do header precisa ser igual ao do cookie `__Host-vira_csrf`. Em **todo** método que altera dados, a API também confere `Origin` (igual ao do web) ou, sem ele, `Sec-Fetch-Site: same-origin`. |

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
- Status 4xx sem tipo próprio na tabela usam `type: "about:blank"` (RFC 9457, seção 4.2.1).
- Todo response traz o header `X-Request-Id`; um id enviado pelo cliente é mantido se tiver de 8 a 64 caracteres `[A-Za-z0-9_-]`.
- Rate limit responde `429` com `Retry-After` e headers `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset`.

#### Tipos de problema

| `type` (âncora) | Status | Quando |
| --- | --- | --- |
| <a id="validation-failed"></a>`validation-failed` | 400 | Corpo, query ou params inválidos |
| <a id="breached-password"></a>`breached-password` | 400 | Senha nova encontrada em vazamentos conhecidos (Have I Been Pwned); `errors[0].path` aponta o campo |
| <a id="incorrect-password"></a>`incorrect-password` | 400 | Senha atual errada numa troca de senha ou de e-mail (a sessão continua válida, por isso não é `401`) |
| <a id="unauthenticated"></a>`unauthenticated` | 401 | Sem sessão ou token expirado |
| <a id="reauthentication-required"></a>`reauthentication-required` | 401 | Excluir conta só de login social com o login da sessão feito há mais de 5 minutos: entrar de novo com o provedor |
| <a id="invalid-credentials"></a>`invalid-credentials` | 401 | Login falhou. Mensagem genérica: vale para e-mail inexistente, senha errada, conta sem senha e **conta bloqueada** (nunca diz qual) |
| <a id="csrf-failed"></a>`csrf-failed` | 403 | Token CSRF ausente/inválido ou origem não permitida |
| <a id="email-not-verified"></a>`email-not-verified` | 403 | Senha correta, mas e-mail ainda não verificado (só revelado a quem acertou a senha) |
| <a id="forbidden"></a>`forbidden` | 403 | Papel insuficiente para a **função** (ex.: BUYER chamando rota de organizador) |
| <a id="not-found"></a>`not-found` | 404 | Recurso inexistente **ou de outra pessoa** |
| <a id="conflict"></a>`conflict` | 409 | Genérico: a operação conflita com o estado atual do recurso |
| <a id="password-not-set"></a>`password-not-set` | 409 | Conta só de login social, sem senha para confirmar ou trocar (crie uma por "esqueci a senha") |
| <a id="already-organizer"></a>`already-organizer` | 409 | A conta já tem perfil de organizador |
| <a id="organizer-has-upcoming-events"></a>`organizer-has-upcoming-events` | 409 | Excluir a conta de quem organiza evento publicado que ainda não terminou: cancele-o antes |
| <a id="token-expired"></a>`token-expired` | 410 | Link de uso único expirado, já usado ou desconhecido (não diz qual) |
| <a id="insufficient-inventory"></a>`insufficient-inventory` | 409 | Estoque não comporta a quantidade |
| <a id="pending-order-exists"></a>`pending-order-exists` | 409 | Já existe pedido PENDING do comprador para o evento |
| <a id="invalid-state-transition"></a>`invalid-state-transition` | 409 | Ex.: pagar pedido expirado, publicar evento incompleto (o que falta vem em `errors`), editar evento cancelado |
| <a id="request-in-progress"></a>`request-in-progress` | 409 | Mesma `Idempotency-Key` em processamento |
| <a id="idempotency-key-reused"></a>`idempotency-key-reused` | 422 | Mesma chave com outro corpo |
| <a id="sales-closed"></a>`sales-closed` | 422 | Fora da janela de vendas ou evento não publicado/encerrado |
| <a id="invalid-image"></a>`invalid-image` | 422 | O arquivo enviado para a imagem do evento não chegou, não é uma imagem JPEG/PNG/WebP, não confere com o tipo informado ou é pequeno ou grande demais; `detail` diz qual |
| <a id="payload-too-large"></a>`payload-too-large` | 413 | Corpo acima de 100 kB |
| <a id="unsupported-media-type"></a>`unsupported-media-type` | 415 | `Content-Type` não aceito pela rota |
| <a id="rate-limited"></a>`rate-limited` | 429 | Limite excedido |
| <a id="internal-error"></a>`internal-error` | 500 | Falha inesperada |
| <a id="payments-unavailable"></a>`payments-unavailable` | 503 | Não deu para iniciar o pagamento: o Stripe não respondeu ou recusou a chamada, ou o ambiente não tem chaves do Stripe (desenvolvimento e testes); no webhook, o ambiente não tem `STRIPE_WEBHOOK_SECRET` |
| <a id="invalid-signature"></a>`invalid-signature` | 400 | Webhook do Stripe sem `Stripe-Signature`, com assinatura que não confere com o body bruto ou com timestamp a mais de 5 minutos |

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
| GET | `/auth/csrf` | sessão (cookie de acesso ou de refresh) | — | `200 { csrfToken }` + cookie `__Host-vira_csrf` | 401 | — |
| POST | `/auth/register` | PUBLIC | `{ name, email, password }` | `202 { status: "accepted" }` sempre, com a mesma resposta para e-mail novo ou existente; envia link de verificação (ou aviso "você já tem conta") | 400 (inclusive `breached-password`), 429 | 5/h/ip |
| POST | `/auth/login` | PUBLIC | `{ email, password }` | `200 { user }` + cookies da sessão | 400, 401 `invalid-credentials`, 403 `email-not-verified`, 429 | 10/15 min/ip e 5/15 min/conta |
| POST | `/auth/refresh` | cookie de refresh | — | `204` + cookies rotacionados | 401 (inclusive reuso detectado → família revogada) | 30/min/ip |
| POST | `/auth/logout` | BUYER | — | `204`, revoga a sessão e limpa cookies | 401 | — |
| POST | `/auth/logout-all` | BUYER | — | `204`, revoga todas as sessões e limpa cookies | 401 | — |
| GET | `/auth/sessions` | BUYER | — | `200 { data: [{ id, authenticatedAt, lastRefreshedAt, expiresAt, current }] }` | 401 | — |
| DELETE | `/auth/sessions/{id}` | BUYER | — | `204`, revoga a sessão (e limpa os cookies se for a atual) | 400, 401, 404 (de outra conta, inexistente ou já encerrada) | — |
| GET | `/auth/oauth/{provider}` | PUBLIC | `provider ∈ google, github`; `next` opcional (caminho do web) | `302` para o provedor (state + PKCE) + cookie da tentativa | 404 (provedor desconhecido ou sem credenciais), 429 | 20/min/ip |
| GET | `/auth/oauth/{provider}/callback` | PUBLIC | `code`, `state` (ou `error`) | `302` para o web (`next` ou `/`) + cookies da sessão | `302` para `/entrar?erro=<código>`; 404, 429 | 20/min/ip |
| POST | `/auth/email/verify` | PUBLIC | `{ token }` | `200 { user }` + cookies da sessão (verificar o e-mail inicia a sessão) | 400, 410 `token-expired` (expirado/usado/desconhecido), 429 | 10/h/ip |
| POST | `/auth/email/resend` | BUYER | — | `204` | 429 | 3/h/conta |
| POST | `/auth/password/forgot` | PUBLIC | `{ email }` | `202 { status: "accepted" }` sempre (não revela se o e-mail existe) | 400, 429 | 5/h/ip; 3/h por e-mail, silencioso |
| POST | `/auth/password/reset` | PUBLIC | `{ token, password }` | `204`; revoga todas as sessões e limpa os cookies | 400 (inclusive `breached-password`), 410, 429 | 10/h/ip |
| POST | `/auth/email/change/confirm` | PUBLIC | `{ token }` | `204`; a conta passa ao novo e-mail | 400, 410, 429 | 10/h/ip |

#### Cadastro, verificação e login (N3)

**Cadastro.** O corpo é estrito: qualquer campo além de `name` (1–120), `email` (até 254, normalizado em minúsculas) e `password` (8–128 caracteres) é `400`, e o papel nunca vem do corpo (toda conta nasce BUYER). A resposta é `202 { "status": "accepted" }` **para qualquer e-mail**; a diferença só aparece na caixa de entrada de quem é dono do endereço:

| E-mail | O que acontece | E-mail enviado |
| --- | --- | --- |
| Novo | Conta criada (sem verificar) e pedido de e-mail gravado na outbox, na mesma transação | "Confirme seu e-mail" com o link `<WEB_ORIGIN>/verificar-email#token=<token>` |
| Já cadastrado | Nada muda na conta; só o aviso na outbox | "Você já tem uma conta" com o link para entrar |

O token vai no **fragmento** (`#token=`) para não chegar a logs de servidor nem ao `Referer`; a página do web (N7) o lê no navegador e o envia no corpo de `POST /auth/email/verify`. Ele tem 256 bits, vale 24 h, é de uso único e só o hash SHA-256 fica no banco; quem o gera é o consumidor da fila `email`, na hora de enviar, então ele nunca passa pela outbox nem pelo Redis. O cadastro faz o hash da senha antes de consultar o e-mail, para que o tempo de resposta não revele se ele já existe.

**Login.** Valida o par, inicia a sessão (cookies) e responde `200 { user }`. `user` é `{ id, name, email, role, emailVerified }`.

| Situação | Resposta |
| --- | --- |
| E-mail inexistente, senha errada, conta sem senha, **conta bloqueada** (mesmo com a senha certa) | `401 invalid-credentials`, mesmo corpo e mesmo custo (uma verificação argon2id contra um hash fictício quando não há hash real) |
| Senha certa, e-mail não verificado | `403 email-not-verified` (só quem acertou a senha vê isto) |
| Mais de 5 tentativas em 15 min na mesma conta (existente ou não) | `429`, antes de qualquer hash |

**Bloqueio progressivo.** A 5ª falha seguida bloqueia a conta por 1 min e cada nova falha dobra o bloqueio, até 1 h. Tentativas durante o bloqueio não contam (não dá para prolongá-lo de fora). Login com sucesso zera o contador.

**Rate limit.** Por IP, antes de validar o corpo: cadastro 5/h, verificação 10/h, login 10/15 min. Por conta (chave: hash do e-mail), no caso de uso e antes do hash: login 5/15 min. Toda resposta dessas rotas traz `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset` (segundos); o `429` acrescenta `Retry-After`. Se o Redis estiver fora, a requisição passa e o aviso vai para o log (o bloqueio por conta, no banco, continua valendo).

#### Sessões e CSRF (N4)

**Cookies.** Login e verificação de e-mail gravam:

| Cookie | Conteúdo | Atributos | Vida |
| --- | --- | --- | --- |
| `__Host-vira_at` | JWT de acesso HS256 (`sub`, `role`, `sid`, `iss: vira-api`, `aud: vira`, `iat`, `exp`) | `HttpOnly; Secure; SameSite=Lax; Path=/` | 10 min |
| `__Secure-vira_rt` | Refresh token opaco (32 bytes, base64url); no banco, só o SHA-256 | `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` | 7 dias sem uso, 30 no máximo |
| `__Host-vira_csrf` | Token CSRF (`GET /auth/csrf`) | `HttpOnly; Secure; SameSite=Lax; Path=/` | Sessão do navegador |

Um novo login apaga o cookie CSRF anterior (ele valia para a sessão antiga) e encerra a sessão cujo refresh token o navegador ainda tinha.

**Refresh.** Cada refresh token vale **uma vez**: `POST /auth/refresh` responde `204` com os dois cookies novos e o mesmo id de sessão. Reapresentar um token já trocado revoga a sessão inteira (inclusive o token mais novo, de quem quer que esteja com ele), responde `401`, limpa os cookies e registra `auth.refresh_reuse_detected`. Dois refreshes simultâneos com o mesmo cookie caem nessa regra, então o web faz um de cada vez. O papel é relido do banco a cada refresh.

**CSRF.** A página chama `GET /auth/csrf` depois do login (ou quando o cookie sumir) e manda o `csrfToken` no header `X-CSRF-Token`. Sem o header, com valor diferente do cookie ou com o token de outra sessão: `403 csrf-failed`. Rotas públicas (login, cadastro, verificação, refresh) não pedem o token, só a origem certa. `Authorization: Bearer` não pede token.

**Logout.** `logout` revoga a sessão atual, `logout-all` todas (auditado com quantas estavam ativas), `DELETE /auth/sessions/{id}` uma específica (auditado como `auth.session_revoked`). O refresh para na hora; um token de acesso já emitido vale até expirar (no máximo 10 min).

#### Login social (N5)

Google (OpenID Connect) e GitHub (OAuth App), os dois com Authorization Code + PKCE (S256). Cada provedor só existe quando as duas variáveis dele estão configuradas (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`); sem elas, as rotas respondem `404`. A URL de retorno registrada no provedor fica na origem do web, que repassa `/api/v1/*` para a API: `<WEB_ORIGIN>/api/v1/auth/oauth/{provider}/callback`.

**Ida.** `GET /auth/oauth/{provider}` sorteia `state`, verificador PKCE e `nonce` (256 bits cada) e os guarda no cookie `__Secure-vira_oauth` (`HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth/oauth`, 10 min), cifrado e autenticado com AES-256-GCM. O provedor recebe só o desafio (`SHA-256` do verificador). `next` é aceito apenas como caminho do próprio web (`/eventos/x`); `//outro.site`, URLs absolutas e barras invertidas são ignoradas (sem redirecionamento aberto).

**Volta.** A callback gasta o cookie da tentativa sempre, dê certo ou não. O `state` precisa ser o do cookie, do mesmo provedor e dentro dos 10 min (senão é um login começado por outra pessoa); o código é trocado com o verificador e a mesma URL de retorno. No Google, o perfil sai do ID token, conferido por inteiro (assinatura RS256 com as chaves publicadas pelo Google, `iss`, `aud`, `exp`, `iat` e `nonce`); no GitHub, da API (`/user` e `/user/emails`). Os tokens do provedor ficam só na memória da requisição: nada é gravado.

| Situação | Resultado |
| --- | --- |
| Conta do provedor já vinculada | Entra na conta vinculada (mesmo que o e-mail no provedor tenha mudado) |
| E-mail verificado pelo provedor e sem conta no Vira | Cria conta BUYER, com e-mail verificado e sem senha, e a vincula |
| E-mail verificado pelo provedor e conta existente verificada | Vincula e entra; a senha continua valendo |
| E-mail verificado pelo provedor e conta existente **não** verificada | Vincula, marca o e-mail como verificado e **apaga a senha**: quem cadastrou nunca provou ser dono do endereço |
| Provedor não garante o e-mail (Google `email_verified` falso; no GitHub, o e-mail **primário** não verificado) | Nada é criado nem vinculado: `302` para `/entrar?erro=oauth-email-not-verified` |
| A pessoa recusou no provedor (`error=access_denied`) | `/entrar?erro=oauth-denied` |
| `state` ausente, diferente, de outro provedor ou expirado; código recusado; resposta do provedor inválida | `/entrar?erro=oauth-failed` |

Com sucesso, a sessão abre como no login por senha (mesmos cookies, o cookie CSRF antigo é apagado e a sessão anterior do navegador é encerrada). Auditoria: `auth.registered` (conta nova), `auth.email_verified` (conta não verificada assumida), `auth.oauth_linked` (`{ provider, tookOverUnverified }`), `auth.login_succeeded` (`method: google|github`) e, sem e-mail garantido, `auth.login_failed` com `reason: provider_email_not_verified`. Os códigos de erro estão em `OAUTH_LOGIN_ERRORS` (`@vira/shared`).

#### Redefinição de senha e senhas vazadas (N6)

**Esqueci a senha.** `POST /auth/password/forgot` responde `202 { "status": "accepted" }` para qualquer e-mail. Se houver conta, o worker envia o link `<WEB_ORIGIN>/redefinir-senha#token=<token>` (30 min, uso único, só o SHA-256 no banco, gerado na hora do envio como o da verificação; um link novo invalida o anterior). Além do limite por IP, cada endereço recebe no máximo 3 links por hora: passado isso, a resposta continua `202` e nada é enviado. Contas não verificadas e contas só de login social também recebem o link: usá-lo prova o e-mail, então a conta fica verificada (e a conta social ganha a primeira senha).

**Redefinição.** `POST /auth/password/reset` grava a senha nova, zera o bloqueio, revoga **todas** as sessões (`PASSWORD_CHANGED`), limpa os cookies desta resposta e envia ao dono o aviso "sua senha foi alterada". O token é gasto na mesma transação da troca; de dois pedidos simultâneos com o mesmo token, um recebe `204` e o outro `410`. Senha vazada responde `400 breached-password` **sem gastar o token**.

**Senhas vazadas.** Cadastro, redefinição e troca de senha consultam o Pwned Passwords (Have I Been Pwned) com k-anonymity: só os 5 primeiros dígitos hexadecimais do SHA-1 da senha saem do servidor, com `Add-Padding: true`, e a comparação com o resto é local. Senha encontrada: `400 breached-password` (no cadastro, para e-mail novo ou existente, então não revela nada). Se o serviço não responder em 3 s ou responder com erro, a senha é aceita e um aviso vai para o log (sem o prefixo). `PWNED_PASSWORDS_ENABLED=false` desliga a checagem; nos testes ela vem desligada por padrão.

#### Conta (N6)

Toda rota de `/me` age sobre a conta da sessão e não recebe id nenhum: não há conta alheia para alcançar. Os corpos são estritos (`role`, `email`, `emailVerified` ou qualquer outro campo além dos listados é `400`), e as rotas que alteram dados pedem o token CSRF com o cookie de sessão, como as demais.

| Rota | Comportamento |
| --- | --- |
| `GET /me` | `hasPassword` falso indica conta só de login social; `organizer` aparece quando há perfil de organizador. |
| `PATCH /me` | Só o nome. E-mail e senha têm rotas próprias; o papel nunca vem do corpo. |
| `POST /me/password` | Pede a senha atual (5 tentativas a cada 15 min por conta; errada: `400 incorrect-password`). Revoga as **outras** sessões; a atual continua. Envia o aviso de senha alterada. |
| `POST /me/email` | Pede a senha atual. O endereço novo fica pendente e recebe o link `<WEB_ORIGIN>/confirmar-email#token=<token>` (24 h, uso único); o atual recebe um aviso sem link. Endereço já usado por outra conta: a resposta é a mesma `202`, nada muda, e o dono do endereço recebe um aviso. Até 3 pedidos por hora por conta. |
| `POST /auth/email/change/confirm` | Troca o e-mail pelo endereço que o link recebeu, já verificado. O token guarda o endereço: um link de um pedido anterior (para outro endereço) não confirma nada, e um endereço tomado por outra conta nesse meio-tempo responde `410`. As sessões continuam. |
| `POST /me/organizer` | Cria o perfil (o `slug` sai do nome: "Coletivo São João" → `coletivo-sao-joao`, com sufixo se já existir) e passa BUYER a ORGANIZER (ADMIN continua ADMIN). O token de acesso atual ainda tem o papel antigo; o próximo `POST /auth/refresh` traz o novo. |

Auditoria: `auth.password_reset_requested`, `auth.password_changed` (`via: reset|change`), `auth.email_change_requested`, `auth.email_changed` e `user.organizer_profile_created`.

Páginas do web (N7) que os e-mails apontam: `/redefinir-senha` e `/confirmar-email`, que leem o token do fragmento como `/verificar-email`, e `/esqueci-a-senha`.

### Conta e privacidade (`users`)

| Método | Rota | Papel | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| GET | `/me` | BUYER | — | `200 { id, name, email, role, emailVerified, hasPassword, organizer?: { displayName, slug } }` | 401 |
| PATCH | `/me` | BUYER | `{ name }` | `200 { user }` (mesmo formato do `GET /me`) | 400, 401 |
| POST | `/me/password` | BUYER | `{ currentPassword, newPassword }` | `204`; revoga as outras sessões | 400 (`incorrect-password`, `breached-password`), 401, 409 `password-not-set`, 429 (5/15 min/conta) |
| POST | `/me/email` | BUYER | `{ email, currentPassword }` | `202 { status: "accepted" }`; link de confirmação para o novo endereço | 400 (`incorrect-password`, mesmo e-mail), 401, 409 `password-not-set`, 429 (3/h/conta) |
| POST | `/me/organizer` | BUYER | `{ displayName }` | `201 { organizerProfile: { displayName, slug } }`; papel → ORGANIZER | 400, 409 `already-organizer` |
| GET | `/me/export` | BUYER | — | `200` JSON `DataExport` (`format: "vira.data-export.v1"`): conta, logins sociais, sessões ativas, perfil de organizador e seus eventos, pedidos e ingressos — `Content-Disposition: attachment`, `Cache-Control: no-store`; auditado (`user.data_exported`) | 401, 429 (3/dia/conta) |
| DELETE | `/me` | BUYER + reautenticação | `{ password, confirm: "EXCLUIR" }`; conta sem senha manda só `confirm` e precisa de login feito há menos de 5 min | `202 { status: "accepted" }`; conta anonimizada (PRIVACY.md), sessões apagadas, ingressos futuros cancelados, cookies limpos; auditado (`user.anonymized`) | 400 (`validation-failed`, `incorrect-password` em `password`), 401 (`reauthentication-required`), 409 `organizer-has-upcoming-events`, 429 (o mesmo limite da senha atual) |

### Vitrine (`catalog`) — somente eventos publicados

| Método | Rota | Papel | Query | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| GET | `/events` | PUBLIC | `q`, `city`, `from`, `to`, `limit`, `cursor` | `200 { data: EventSummary[], page }` ordenado por `startsAt` | 400 |
| GET | `/events/featured` | PUBLIC | — | `200 { data: EventSummary[] }` (até 6 próximos com vendas abertas) | — |
| GET | `/events/{slug}` | PUBLIC | — | `200 EventDetail` (inclui `ticketTypes` com `available`, `priceFrom`, `isDemo`, crédito da imagem) | 400, 404 |

`EventSummary`: `{ id, slug, title, status, startsAt, endsAt, timezone, venue: { name, city, state }, image: { url, alt, width, height, blurDataUrl }, priceFrom: Money | null, soldOut, isDemo }`.

`EventDetail`: os campos do `EventSummary` com `venue` completo (`address` também), `descriptionHtml`, `image.credit` (`{ author, url, license }` nas fotos de demonstração, senão `null`), `organizer: { name }` (o nome público do perfil) e `ticketTypes: [{ id, name, description, price, maxPerOrder, available, salesStartAt, salesEndAt, salesStatus }]`.

#### Como funciona (N10)

| Rota | Comportamento |
| --- | --- |
| `GET /events` | Só eventos `PUBLISHED` que ainda não terminaram (um evento em andamento continua na lista), por `startsAt` e `id`. `q` (2–80 caracteres) busca no título; `city` compara a cidade inteira; as duas ignoram maiúsculas, e `%` e `_` valem como os próprios caracteres. `from` (inclusive) e `to` (exclusive) filtram o início. Qualquer outro parâmetro é `400`. O cursor é assinado e preso à busca: levado para outra busca, adulterado ou vindo do painel do organizador, é `400`. |
| `GET /events/featured` | Até 6 eventos que ainda vão começar e têm algum tipo de ingresso à venda **agora** (dentro da janela de vendas e com ingresso restante), os mais próximos primeiro. |
| `GET /events/{slug}` | Evento publicado, inclusive encerrado, ou cancelado (`status: "CANCELED"`, para o link de quem comprou continuar funcionando; o motivo do cancelamento vai só para quem comprou). Rascunho e slug desconhecido: `404`; slug fora do formato: `400`. |

- `available` é `capacity − sold − reserved`, exato; vendidos e reservados nunca aparecem separados. A opção de mostrar faixas ("últimos ingressos") a critério do organizador fica para quando o painel tiver onde configurá-la.
- `salesStatus`: `ON_SALE`; `NOT_STARTED` (antes de `salesStartAt`); `SOLD_OUT` (janela aberta, nada restante); `CLOSED` (depois de `salesEndAt` ou, sem ela, do fim do evento, e sempre num evento cancelado).
- `priceFrom` é o menor preço entre os tipos com ingresso restante; `null` quando não resta nenhum, e aí `soldOut` é `true` (um evento sem tipos de ingresso não é "esgotado").
- A imagem sai por endereço assinado de `GET` (1 hora), como na visão do organizador; o bucket continua privado.
- Sem rate limit próprio: quem chama em produção é o servidor do web (renderização no servidor), e um limite por IP o atingiria. As respostas seguem com `Cache-Control: no-store`; o cache fica a cargo do web.

### Eventos do organizador (`events`)

| Método | Rota | Papel | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| GET | `/organizer/events` | ORGANIZER | `status`, `limit`, `cursor` | `200 { data, page }` — só eventos do próprio organizador | 401, 403 |
| POST | `/organizer/events` | ORGANIZER | `{ title, descriptionMd, startsAt, endsAt, timezone, venue }` | `201 Event` (DRAFT) | 400, 401, 403, 429 (30 rascunhos/h/conta) |
| GET | `/organizer/events/{id}` | ORGANIZER* | — | `200 Event` | 404 |
| PATCH | `/organizer/events/{id}` | ORGANIZER* | campos parciais | `200 Event` | 400, 404, 409 |
| DELETE | `/organizer/events/{id}` | ORGANIZER* | — | `204` (só DRAFT) | 404, 409 |
| POST | `/organizer/events/{id}/publish` | ORGANIZER* | — | `200 Event` | 404, 409 `invalid-state-transition` (com a lista do que falta) |
| POST | `/organizer/events/{id}/cancel` | ORGANIZER* | `{ reason }` | `200 Event` | 404, 409 |
| POST | `/organizer/events/{id}/image/upload-url` | ORGANIZER* | `{ contentType, sizeBytes }` | `201 { uploadId, url, headers, expiresAt }` (PUT pré-assinado, 5 min) | 400 (tipo/tamanho), 404, 409, 429 |
| POST | `/organizer/events/{id}/image` | ORGANIZER* | `{ uploadId, alt }` | `200 Event` (após validar o objeto) | 400, 404, 409, 422 `invalid-image` |
| POST | `/organizer/events/{id}/ticket-types` | ORGANIZER* | `{ name, description?, priceCents, capacity, maxPerOrder?, salesStartAt?, salesEndAt? }` | `201 TicketType` | 400, 404 |
| PATCH | `/organizer/ticket-types/{id}` | ORGANIZER* | campos parciais | `200 TicketType` | 400, 404, 409 (capacidade < vendidos + reservados) |
| DELETE | `/organizer/ticket-types/{id}` | ORGANIZER* | — | `204` (só sem vendas e reservas) | 404, 409 |
| GET | `/organizer/events/{id}/sales` | ORGANIZER* | — | `200 { byTicketType: [{ sold, reserved, capacity, grossCents }], checkedIn }` — agregados, sem dados pessoais | 404 |

#### Como funcionam (N8)

Implementadas na N8 todas as rotas acima menos as de imagem (N9, abaixo) e `/sales` (chega com os pedidos, no Marco 2). Todas pedem ORGANIZER **e** perfil de organizador: uma conta sem perfil (inclusive ADMIN) recebe `403 forbidden`. Evento ou tipo de ingresso de outro organizador responde `404`, idêntico a um id que não existe; ids fora do formato UUID são `400`. Os corpos são estritos: `status`, `slug`, `organizerId`, `descriptionHtml`, `isDemo`, `sold`, `reserved` ou qualquer campo não listado é `400`.

| Rota | Comportamento |
| --- | --- |
| `GET /organizer/events` | Mais novos primeiro (`createdAt`, `id` desempata); `status` filtra. O cursor é assinado e preso à conta e ao filtro: adulterado ou levado para outra lista é `400`. Cada item traz `ticketTypeCount`. |
| `POST /organizer/events` | Cria `DRAFT`. Exige `title` (3–120), `startsAt`, `endsAt` (depois do início) e `timezone` IANA; `descriptionMd` (até 20 000) e `venue` (`{ name, address, city, state }`, UF) são opcionais no rascunho. O `slug` sai do título com sufixo aleatório e é refeito ao publicar. |
| `PATCH /organizer/events/{id}` | Campos parciais, ao menos um; `venue: null` remove o local. O fim é comparado com o início já salvo. Evento publicado precisa continuar completo: tirar o local ou levar a data para o passado é `409` com o que faltaria em `errors`. Cancelado ou encerrado: `409`. |
| `DELETE /organizer/events/{id}` | Só `DRAFT`, levando os tipos de ingresso; publicado é `409` (cancele). |
| `POST /organizer/events/{id}/publish` | Só `DRAFT`. Exige data de início futura, local, imagem com texto alternativo e ao menos um tipo de ingresso; o que faltar volta em `errors` (`[{ path: "venue", message }]`). Audita `event.published`. |
| `POST /organizer/events/{id}/cancel` | Só `PUBLISHED` que não terminou; `reason` de 3 a 500 caracteres, mostrado a quem comprou. Definitivo. Audita `event.canceled` (sem o motivo, que é texto livre). |
| `POST /organizer/events/{id}/ticket-types` | Entra no fim da lista (`sortOrder`). Preço de R$ 1,00 a R$ 100.000,00 em centavos inteiros, capacidade 1–100 000, `maxPerOrder` 1–20 (padrão 10), janela de vendas que termina até o fim do evento. No máximo 20 tipos por evento (`409`). |
| `PATCH /organizer/ticket-types/{id}` | Campos parciais e `sortOrder`. Capacidade abaixo de vendidos + reservados: `409 conflict` (comparado no mesmo `UPDATE`). |
| `DELETE /organizer/ticket-types/{id}` | Só sem vendas nem reservas, e se nunca esteve num pedido (`409`; o pedido continua mostrando o nome dele); o último tipo de um evento publicado fica (`409`). |

`Event` (visão do organizador): `{ id, slug, title, status, startsAt, endsAt, timezone, venue, isDemo, descriptionMd, descriptionHtml, image: { url, alt, width, height, blurDataUrl } | null, publishedAt, canceledAt, cancelReason, ticketTypes, createdAt, updatedAt }`. `TicketType`: `{ id, name, description, price: Money, capacity, sold, reserved, maxPerOrder, salesStartAt, salesEndAt, sortOrder }`. A imagem aparece só por um endereço assinado (`url`, `GET` válido por 1 hora; o bucket é privado), nunca como campo de chave.

#### Imagem do evento (N9)

O arquivo vai do navegador direto para o bucket privado (R2 em produção, SeaweedFS local), sem passar pela API, e só vira a imagem do evento depois de conferido:

1. `POST /organizer/events/{id}/image/upload-url` com `{ contentType, sizeBytes }`: `image/jpeg`, `image/png` ou `image/webp` (SVG e GIF não), de 1 byte a 5 MB. A resposta traz uma URL de `PUT` pré-assinada por 5 minutos para uma chave gerada pelo servidor; o tipo e o tamanho exato estão na assinatura, então o armazenamento recusa (`403`) outro tipo ou outro tamanho. Até 20 URLs por hora por conta (`429`). Evento cancelado ou encerrado: `409`.
2. O navegador envia o arquivo: `fetch(url, { method: "PUT", body: file, headers })`, com os `headers` da resposta (o `Content-Type`). O bucket aceita esse `PUT` vindo do `WEB_ORIGIN` (CORS configurado por `pnpm --filter @vira/api storage:setup`).
3. `POST /organizer/events/{id}/image` com `{ uploadId, alt }` (texto alternativo de 3 a 300 caracteres). O servidor lê o objeto (nunca uma URL do cliente), confere o tamanho e o formato real pelos primeiros bytes, decodifica com limite de 40 megapixels, exige ao menos 1200 × 600, gira conforme o EXIF, reduz a no máximo 2400 px no maior lado, converte para WebP sem metadados (EXIF, GPS, XMP) e gera o `blurDataUrl` (16 px). Responde o `Event` com a imagem nova.

| Situação | Resposta |
| --- | --- |
| Confirmar antes do arquivo chegar | `422 invalid-image`; o envio continua valendo: mande o arquivo e confirme de novo |
| Arquivo que não é imagem, de outro formato, pequeno demais, corrompido ou com pixels demais | `422 invalid-image` com o motivo em `detail`; o arquivo é apagado e é preciso pedir outra URL |
| `uploadId` de outro evento, de outro organizador, já usado, recusado ou vencido | `404` |
| Confirmação até 15 min depois de a URL vencer | Aceita (um envio lento pode ter começado no fim do prazo) |
| Evento já com imagem, inclusive publicado | A imagem é trocada; a anterior sai do bucket na próxima varredura |

Um job no worker (a cada 10 min) apaga do bucket o que nada usa: envios não confirmados depois do prazo, envios recusados, imagens trocadas e imagens de rascunhos excluídos.

Publicar, editar e mexer em tipos de ingresso travam a linha do evento (`SELECT ... FOR UPDATE`) durante a checagem, então excluir o último tipo enquanto o evento é publicado não deixa um evento publicado sem ingresso.

### Pedidos (`orders`)

| Método | Rota | Papel | Corpo | Sucesso | Erros | Rate limit |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/orders` | BUYER | `{ eventId, items: [{ ticketTypeId, quantity }] }` + `Idempotency-Key` | `201 Order` (PENDING, `expiresAt`) | 400, 401, 404, 409, 422, 429 | 10/min/conta, 30/min/ip |
| GET | `/orders` | BUYER | `limit`, `cursor` | `200 { data: OrderSummary[], page }` — **só os próprios** | 401 | — |
| GET | `/orders/{id}` | OWNER | — | `200 Order` | 404 | — |
| PUT | `/orders/{id}/holders` | OWNER | `{ holders: [{ orderItemId, names: string[] }] }` | `200 Order` | 400, 404, 409 (não PENDING) | — |
| POST | `/orders/{id}/payment` | OWNER | — | `200 { clientSecret, publishableKey }` | 404, 409 (não PENDING ou titulares faltando), 429, 503 | 10/min/conta |
| POST | `/orders/{id}/extend` | OWNER | — | `200 Order` (novo `expiresAt`) | 404, 409 (já estendido, fora da janela de 2 min) | — |
| POST | `/orders/{id}/cancel` | OWNER | — | `200 Order` (CANCELED) | 404, 409 | — |

`Order`: `{ id, publicCode, status, event: { id, slug, title, startsAt, endsAt, timezone }, items: [{ id, ticketTypeId, name, quantity, unitPrice: Money, subtotal: Money, holderNames: string[] }], total: Money, expiresAt, extensionAvailable, createdAt, paidAt }`. `holderNames` fica vazio até `PUT /orders/{id}/holders` e então tem um nome por ingresso da linha. O pedido nunca mostra as cópias do nome e do e-mail do comprador nem a `Idempotency-Key`.

Entregue na V1: `POST /orders` e `GET /orders/{id}`; na V2, `POST /orders/{id}/extend` e `POST /orders/{id}/cancel`; na V3, `POST /orders/{id}/payment`; na V6, `PUT /orders/{id}/holders`.

| `POST /orders` | Regra |
| --- | --- |
| Sem `Idempotency-Key`, ou não é um UUID | `400 validation-failed` (`errors[0].path = "Idempotency-Key"`) |
| Evento inexistente ou rascunho; tipo de ingresso de outro evento | `404` |
| Evento cancelado ou encerrado; tipo fora da janela de vendas (sem fim próprio, as vendas vão até o fim do evento) | `422 sales-closed`, com o motivo em `detail` |
| Mais que o `maxPerOrder` do tipo | `400 validation-failed` apontando `items.N.quantity` |
| Total acima de R$ 999.999,99 (teto de um pagamento no Stripe) | `400 validation-failed` apontando `items` |
| Já existe pedido `PENDING` do comprador para o evento | `409 pending-order-exists`, com o `orderId` desse pedido no corpo (é do próprio comprador; o web retoma a reserva). Um pendente cujo prazo já venceu é expirado na hora (estoque devolvido) e não impede o novo |
| Estoque insuficiente em qualquer tipo | `409 insufficient-inventory` ("Restam N ingresso(s) de …" ou "… esgotaram"); nada fica reservado |
| Mesmo tipo de ingresso em dois itens | `400 validation-failed` (some as quantidades num item só) |

| Extensão e cancelamento | Regra |
| --- | --- |
| `POST /orders/{id}/extend` | Só `PENDING`, uma vez por pedido e nos 2 minutos finais: `expiresAt` ganha +10 min e `extensionAvailable` vira `false`; os ingressos continuam segurados. Cedo demais, já estendido ou reserva vencida (mesmo antes de o job rodar): `409 invalid-state-transition`, com o motivo em `detail`. Requisições simultâneas estendem uma vez só |
| `POST /orders/{id}/cancel` | `PENDING` → `CANCELED` (mesmo com o prazo vencido), estoque devolvido na mesma transação; audita `order.canceled`. Repetir devolve o pedido cancelado (`200`). Pago, expirado ou reembolsado: `409 invalid-state-transition` |
| De outro comprador | `404`, como nas outras rotas |

`POST /orders/{id}/payment` (V3, ADR-0006): só `PENDING` com a reserva em andamento (senão `409 invalid-state-transition`). Na primeira chamada cria o PaymentIntent do pedido no Stripe (modo de teste) com o **total gravado no pedido**, `metadata.orderId` e a idempotency key `pi:{orderId}`, e grava o id em `orders.stripe_payment_intent_id`; as seguintes devolvem o mesmo PaymentIntent. A resposta traz só o `clientSecret` e a chave publicável, para o Payment Element. Pagar não muda o pedido: ele só vira `PAID` pelo webhook (V4). Sem as chaves do Stripe no ambiente, ou com o Stripe fora do ar, `503 payments-unavailable`. Sem o nome de todos os titulares, `409 invalid-state-transition` ("Informe o nome do titular de cada ingresso antes de pagar.").

`PUT /orders/{id}/holders` (V6): só `PENDING` com a reserva em andamento (senão `409 invalid-state-transition`). O corpo traz todas as linhas do pedido, uma vez cada, com exatamente `quantity` nomes (1–120 caracteres, sem espaços nas pontas depois do `trim`); linha que não é do pedido, linha faltando ou contagem errada: `400 validation-failed` com o caminho (`holders.N.orderItemId`, `holders`, `holders.N.names`). Enviar de novo substitui os nomes. Na emissão (V5), cada ingresso leva o nome da sua posição na linha. O banco garante a regra com o `CHECK order_items_holder_names`.

A reserva termina sozinha: um job com delay até `expiresAt` passa o pedido para `EXPIRED` e devolve o estoque, com uma varredura a cada minuto como rede de segurança (ARCHITECTURE, seção 6). A expiração é auditada (`order.expired`, ator `SYSTEM`).

A resposta `201` traz `Location: /api/v1/orders/{id}`. O preço de cada item é lido da mesma linha que a reserva atualiza, então o pedido guarda o preço vigente no instante da reserva.

O cliente **nunca envia preço ou total**. Qualquer campo extra no corpo é rejeitado (`strict` no Zod), o que também cobre OWASP API3 (mass assignment).

### Pagamentos (`payments`)

| Método | Rota | Papel | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- | --- |
| POST | `/payments/stripe/webhook` | STRIPE | Evento do Stripe (body bruto) + `Stripe-Signature` | `200 { received: true }` (inclusive para evento repetido ou não tratado) | `400 invalid-signature` (sem assinatura, assinatura errada ou timestamp a mais de 5 min), `503 payments-unavailable` (sem `STRIPE_WEBHOOK_SECRET`) |

Fica fora do proxy do web, sem CSRF e sem cookies, e fora do OpenAPI; protegido exclusivamente pela assinatura, verificada com o SDK oficial sobre o body bruto antes de qualquer leitura (V4, ADR-0006).

- `payment_intent.succeeded`: o PaymentIntent precisa trazer `metadata.orderId`, `currency: brl`, e ser **o do pedido e do total gravado nele**; senão o evento é registrado e o pedido não muda (log de aviso). Com o pedido travado (`FOR UPDATE`): `PENDING → PAID` (os ingressos reservados viram vendidos); `EXPIRED` (pagamento tardio) volta a vender os ingressos se ainda houver, tudo ou nada → `PAID`, senão `REFUNDED`; `CANCELED` (pagou depois de desistir) → `REFUNDED`. O reembolso é pedido ao Stripe por um job (`refund:{orderId}` como idempotency key). Pedido já `PAID`/`REFUNDED`: nada.
- `payment_intent.payment_failed` e `charge.refunded`: só registrados (o Payment Element mostra a falha; a confirmação do reembolso não muda o pedido).
- Outros tipos, eventos `livemode: true` ou com formato inesperado: `200` sem registro.
- Cada evento tratado é gravado em `processed_webhook_events` na mesma transação do efeito: reenvios (inclusive simultâneos) respondem `200` sem efeito; se o efeito falhar, a resposta é `500` e o Stripe reenvia.

### Ingressos (`tickets`)

| Método | Rota | Papel | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| GET | `/tickets` | BUYER | `200 { data: TicketSummary[], page }` — só ingressos de pedidos do próprio usuário; `when=upcoming` (padrão: eventos que não terminaram, os mais próximos primeiro) ou `when=past` (os mais recentes primeiro); `limit` e `cursor` | 400, 401 |
| GET | `/tickets/{id}` | OWNER | `200 Ticket` com `qrToken`, `Cache-Control: no-store` | 401, 404 |

`TicketSummary`: `{ id, code, status, holderName, ticketType: { name }, event: { id, slug, title, startsAt, endsAt, timezone, venueName, venueCity, venueState }, orderId, issuedAt, usedAt }`. `Ticket` é o mesmo com `qrToken`, o conteúdo do QR Code (`v1.<kid>.<payload>.<sig>`, [ADR-0008](adr/0008-qr-code-assinado.md)). O `qrToken` só é devolvido ao dono e nunca aparece em listagens, logs, URLs ou e-mails. Ingresso de outra pessoa responde `404`, igual a um que não existe; o cursor da lista vale só para o mesmo comprador e o mesmo `when`.

Emissão (V5): um ingresso por unidade de cada linha, na mesma transação do webhook que marca o pedido `PAID` (inclusive o pagamento tardio que ainda encontrou estoque), com código `VIRA-XXXX-XXXX` e nonce aleatórios. Em seguida o comprador recebe um e-mail com os códigos e o link para os ingressos (`/ingressos` no web, V7), pela outbox (`tickets.issued`).

### Check-in (`checkin`)

| Método | Rota | Papel | Corpo | Sucesso | Erros | Rate limit |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/checkin/scan` | ORGANIZER* do evento | `{ eventId, token }` | `200 { result: VALID \| ALREADY_USED \| WRONG_EVENT \| INVALID, ticket?: { code, holderName, ticketType }, usedAt? }` | 400, 401, 404 (evento não é seu), 429 | 120/min/operador |
| POST | `/checkin/code` | ORGANIZER* do evento | `{ eventId, code }` | mesmo formato | 400, 401, 404, 429 | 20/min/operador |
| GET | `/organizer/events/{id}/checkin/stats` | ORGANIZER* | — | `200 { checkedIn, total, lastScans: [...] }` | 404 | — |

Implementado no V8. O resultado de uma leitura é sempre `200`; o `ticket` traz só `code`, `holderName` e `ticketType` (nada do comprador):

- `VALID`: o ingresso entrou agora. A entrada é decidida por um único `UPDATE ... WHERE status = 'VALID'` (com o `event_id` e, no QR, o `qr_nonce`): de leituras simultâneas, só uma recebe `VALID` e as outras `ALREADY_USED`.
- `ALREADY_USED`: com `ticket` e `usedAt`.
- `WRONG_EVENT`: ingresso de outro evento, sem `ticket`. Num código digitado, só quando o outro evento é do mesmo organizador; código de evento alheio responde `INVALID`, para que a digitação não revele quais códigos existem.
- `INVALID`: token que não é nosso (formato, `kid` ou assinatura; recusado sem consultar o banco), QR de antes de uma reemissão, código inexistente. Com `ticket`, é um ingresso cancelado deste evento.

O código aceita minúsculas, espaços, traços e a falta do prefixo `VIRA`, e lê O como 0 e I ou L como 1 (Crockford); fora disso, `400`. O rate limit é por operador e é gasto antes de qualquer consulta. Toda leitura que passa do rate limit e da posse do evento fica em `checkin_attempts`; cada `VALID` é auditado como `ticket.checked_in`. `total` conta os ingressos `VALID` e `USED`; `lastScans` traz as 5 últimas leituras, com o `ticket` só quando ele é deste evento. As três rotas respondem `Cache-Control: no-store`.

### Administração (`admin`)

| Método | Rota | Papel | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| GET | `/admin/audit-logs` | ADMIN | `200 { data, page }` com filtros `action`, `entityType`, `entityId`, `actorId`, `from`, `to` | 401, 403 |
| PATCH | `/admin/users/{id}/role` | ADMIN | `200 { user }` (auditado) | 400, 401, 403, 404 |

## Exemplos

### Criar pedido

```http
POST /api/v1/orders
Idempotency-Key: <uuid-gerado-pelo-cliente>
X-CSRF-Token: <token-csrf>
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
  "publicCode": "VIRA-ORD-3F8A-K2QX",
  "status": "PENDING",
  "event": { "id": "01929e7a-...", "slug": "noite-de-forro-a1b2c3", "title": "Noite de forró",
             "startsAt": "2026-03-14T22:00:00Z", "endsAt": "2026-03-15T03:00:00Z",
             "timezone": "America/Sao_Paulo" },
  "items": [{ "id": "01929e81-...", "ticketTypeId": "01929e7b-...", "name": "Pista – Lote 1", "quantity": 2,
              "unitPrice": { "amountCents": 8000, "currency": "BRL" },
              "subtotal": { "amountCents": 16000, "currency": "BRL" } }],
  "total": { "amountCents": 16000, "currency": "BRL" },
  "expiresAt": "2026-03-10T18:10:00Z",
  "extensionAvailable": true,
  "createdAt": "2026-03-10T18:00:00Z",
  "paidAt": null
}
```

### Check-in

```http
POST /api/v1/checkin/scan
Content-Type: application/json

{ "eventId": "01929e7a-...", "token": "<token-lido-do-qr>" }
```

```json
{ "result": "ALREADY_USED", "usedAt": "2026-03-14T00:42:10Z",
  "ticket": { "code": "VIRA-7KQ2-M9XD", "holderName": "Maria Souza", "ticketType": "Pista – Lote 1" } }
```
