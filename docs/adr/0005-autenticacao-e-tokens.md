# ADR-0005: Autenticação com JWT curto, refresh rotativo e cookies de mesma origem

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

Precisamos de login por senha e social (Google, GitHub), papéis (BUYER, ORGANIZER, ADMIN), sessões revogáveis e páginas renderizadas no servidor que conheçam o usuário. Web (Vercel) e API (Render) ficam em domínios diferentes, o que quebraria cookies `SameSite=Lax` em chamadas cross-site.

## Decisão

- **Senhas:** argon2id (parâmetros OWASP: 19 MiB, t=2, p=1), 8–128 caracteres, checagem contra senhas vazadas (HIBP com k-anonymity).
- **Acesso:** JWT HS256 de **10 min** (`sub`, `role`, `sid`, `iss`, `aud`) em cookie `__Host-vira_at` (`HttpOnly; Secure; SameSite=Lax; Path=/`). `Authorization: Bearer` é aceito para clientes que não são navegador.
- **Refresh:** token opaco de 32 bytes em cookie `__Secure-vira_rt` (`Path=/api/v1/auth`), guardado **só como hash** SHA-256; **rotação a cada uso**; **detecção de reuso** revoga a família inteira; expiração ociosa de 7 dias e absoluta de 30.
- **Mesma origem:** o Next.js faz proxy de `/api/v1/*` para a API. O navegador só fala com o domínio do web, então os cookies são first-party. O webhook do Stripe vai direto para a API.
- **CSRF:** `SameSite=Lax` + token double-submit assinado (HMAC com o id da sessão) em métodos inseguros + verificação de `Origin`/`Sec-Fetch-Site`.
- **OAuth:** Authorization Code + PKCE + `state`; vínculo automático com conta existente só se o provedor garantir e-mail verificado; tokens do provedor não são guardados.
- **Cadastro anti-enumeração:** `POST /auth/register` responde sempre `202`; a sessão começa ao verificar o e-mail.
- **Papéis cumulativos:** todo usuário é BUYER; ORGANIZER é obtido por autosserviço (`POST /me/organizer`); ADMIN só é concedido por outro ADMIN.
- **Comprar exige login** com e-mail verificado (sem checkout de convidado no MVP).

## Alternativas consideradas

- **Access token em memória no front** — mais resistente a CSRF, mas não funciona com Server Components e se perde ao recarregar a página.
- **Sessão só no servidor (cookie com id opaco)** — simples e revogável, mas cada requisição consulta banco ou Redis; JWT curto + refresh revogável dá o equilíbrio pedido.
- **Auth.js ou provedor gerenciado (Clerk, Auth0)** — menos código, mas esconde exatamente o que o projeto quer demonstrar e adiciona um terceiro com dados pessoais.
- **CORS com credenciais entre domínios** — exige `SameSite=None`, aumenta a exposição a CSRF e esbarra no bloqueio de cookies de terceiros dos navegadores.
- **Checkout de convidado** — reduz atrito, mas complica a posse de pedidos e ingressos; fica para o marco Evolução.

## Consequências

- Revogação efetiva em até 10 min (vida do access token); logout global imediato para o refresh.
- O proxy no web adiciona um salto de rede; aceitável e cacheável nas rotas públicas.
- Exigir conta verificada para comprar também reduz abuso de reservas.
