# Deploy da demo

Como a demo pública é montada e atualizada ([ADR-0011](adr/0011-hospedagem.md)). Tudo cabe nos planos gratuitos. Nenhum push publica nada sozinho: cada deploy é feito à mão, com autorização do mantenedor.

```text
navegador ──► Vercel (web, Next.js) ──/api/v1/*──► Render (API + worker embutido)
                    │                                   ├─► Neon (PostgreSQL)
                    └─ fotos pelo otimizador ◄── R2 ◄───┼─► Upstash (Redis)
                                                        ├─► Cloudflare R2 (fotos)
                                                        ├─► Resend (e-mail)
                                                        └─► Stripe (modo de teste) ──webhook──► API
```

O navegador só fala com o domínio do web. A Vercel repassa `/api/v1/*` para a API, então os cookies da sessão são do próprio site ([ADR-0005](adr/0005-autenticacao-e-tokens.md)).

## Ordem

Cada serviço entrega um valor que o próximo usa. Os segredos vão direto no painel de cada serviço (Render, Vercel e GitHub), nunca no repositório nem em mensagens.

1. [Neon](#1-neon-postgresql)
2. [Upstash](#2-upstash-redis)
3. [Cloudflare R2](#3-cloudflare-r2)
4. [Resend](#4-resend)
5. [Stripe](#5-stripe-modo-de-teste)
6. [Chave do QR](#6-chave-do-qr)
7. [Render](#7-render-api)
8. [Vercel](#8-vercel-web)
9. [Login social](#9-login-social-google-e-github)
10. [Webhook do Stripe](#10-webhook-do-stripe)
11. [Eventos de demonstração](#11-eventos-de-demonstração)
12. [Smoke test](#12-smoke-test)

Todos os serviços ficam no leste dos EUA (AWS `us-east-1`, Render `virginia`): cada requisição da API fala com o banco e com o Redis, e a distância entre eles pesa mais do que a distância até o visitante.

## 1. Neon (PostgreSQL)

- Projeto `vira`, PostgreSQL 16, região **AWS US East (N. Virginia)**.
- Copie a connection string **direta** (sem pooling: as migrations usam advisory locks, que o PgBouncer em modo transação não suporta) e confira que termina com `sslmode=require`.
- Vira o `DATABASE_URL` do Render e o segredo `DATABASE_URL` do ambiente `demo` no GitHub.

## 2. Upstash (Redis)

- Banco Redis na região **us-east-1**, com TLS.
- Em _Eviction_, deixe **desligado** (`noeviction`): o BullMQ não pode perder chaves.
- Copie a URL `rediss://default:<senha>@<host>:6379`. Vira o `REDIS_URL` do Render.

## 3. Cloudflare R2

- Bucket **`vira-events`**, privado (sem acesso público nem domínio `r2.dev`).
- Em _Settings → CORS policy_, cole a regra abaixo com o endereço do web (o mesmo `WEB_ORIGIN` do Render; dá para trocar depois de criar o projeto na Vercel):

  ```json
  [
    {
      "AllowedOrigins": ["https://<projeto>.vercel.app"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type"],
      "MaxAgeSeconds": 600
    }
  ]
  ```

- Em _R2 → Manage API tokens_, crie um token **Object Read & Write** restrito ao bucket `vira-events`. Ele entrega o par de chaves e o endpoint `https://<account id>.r2.cloudflarestorage.com`.
- No Render: `S3_ENDPOINT` (o endpoint), `S3_BUCKET=vira-events`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. A região fica no padrão `auto`.
- Na Vercel, o mesmo endpoint vira o `STORAGE_ORIGIN`.

## 4. Resend

- Crie uma API key com permissão **Sending access**.
- No Render: `SMTP_URL=smtps://resend:<api key>@smtp.resend.com:465` e `MAIL_FROM=Vira <onboarding@resend.dev>`.
- **Limite da demo (decisão de 27/10):** sem domínio próprio verificado, o Resend só entrega e-mail para o endereço da conta do Resend. Por isso a demo divulga o login com Google e GitHub, e o cadastro por e-mail só completa para o mantenedor. Com um domínio, basta verificá-lo no Resend e trocar o `MAIL_FROM`.

## 5. Stripe (modo de teste)

- No painel em **modo de teste**, copie `sk_test_…` e `pk_test_…` para `STRIPE_SECRET_KEY` e `STRIPE_PUBLISHABLE_KEY` no Render. A API recusa chaves live ([ADR-0006](adr/0006-stripe-e-idempotencia.md)).
- O webhook só pode ser criado depois que a API tiver endereço (passo 10).

## 6. Chave do QR

```sh
echo "q1:$(openssl rand -base64 32)"
```

A saída inteira é o `QR_SIGNING_KEYS` do Render. Para trocar a chave sem invalidar ingressos já emitidos, ponha a nova na frente (`q2:…,q1:…`) ([ADR-0008](adr/0008-qr-code-assinado.md)).

## 7. Render (API)

- _New → Blueprint_, escolha o repositório: o Render lê o [`render.yaml`](../render.yaml) e pede cada variável marcada `sync: false`.
- `JWT_SECRET` e `CSRF_SECRET` são gerados pelo próprio Render.
- `WEB_ORIGIN`: o endereço do web (`https://<projeto>.vercel.app`). Se ainda não existir, use um provisório e corrija depois do passo 8.
- As variáveis opcionais (`GOOGLE_*`, `GITHUB_*`, `SENTRY_DSN`, `STRIPE_WEBHOOK_SECRET` até o passo 10) podem ficar vazias: valor vazio conta como não definido.
- O primeiro deploy roda as migrations (`prisma migrate deploy`) antes de subir. O health check é `/api/v1/health/ready`, que confere banco e Redis.
- Para publicar uma versão nova: _Manual Deploy → Deploy latest commit_ (o `autoDeploy` está desligado).

No plano gratuito o serviço dorme depois de 15 minutos sem tráfego, e a primeira requisição leva até um minuto. Os consumidores das filas rodam dentro da API (`WORKER_MODE=embedded`) e dormem junto: um e-mail ou uma expiração de reserva atrasa até alguém acordar a API. Num plano pago, troque para `WORKER_MODE=separate` e acrescente um _background worker_ com `startCommand: cd apps/api && node dist/main.worker.js`.

## 8. Vercel (web)

- Projeto `vira` com _Root Directory_ `apps/web`. O [`vercel.json`](../apps/web/vercel.json) define a instalação e o build pelo Turborepo e desliga o deploy por push.
- Variáveis de produção:

  | Variável | Valor |
  | --- | --- |
  | `API_ORIGIN` | `https://vira-api.onrender.com` (o endereço do serviço no Render) |
  | `STORAGE_ORIGIN` | o endpoint do R2 |
  | `VIRA_OAUTH_PROVIDERS` | `google,github` (só os provedores com credenciais no Render) |
  | `SITE_URL` | opcional; sem ela vale o domínio de produção da Vercel |

  `API_ORIGIN` e `STORAGE_ORIGIN` são lidas no build: depois de mudá-las, faça um deploy novo.
- Para publicar: _Deployments → Create deployment_ com a `main`, ou `vercel deploy --prod` na pasta `apps/web`.
- Depois do primeiro deploy, confira que o `WEB_ORIGIN` do Render e a regra de CORS do R2 usam o endereço final.

## 9. Login social (Google e GitHub)

O endereço de retorno passa pelo web: `https://<web>/api/v1/auth/oauth/<provedor>/callback`.

- **Google:** em _Google Cloud → APIs & Services → Credentials_, crie um _OAuth client ID_ do tipo _Web application_, com a origem `https://<web>` e o redirect `https://<web>/api/v1/auth/oauth/google/callback`. A tela de consentimento pede só `openid`, `email` e `profile`.
- **GitHub:** em _Settings → Developer settings → OAuth Apps_, _Homepage URL_ `https://<web>` e _Authorization callback URL_ `https://<web>/api/v1/auth/oauth/github/callback`.
- Ponha as credenciais no Render (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`) e o `VIRA_OAUTH_PROVIDERS` na Vercel.

## 10. Webhook do Stripe

- Em _Developers → Webhooks_ (modo de teste), crie o endpoint `https://vira-api.onrender.com/api/v1/payments/stripe/webhook` com os eventos `payment_intent.succeeded`, `payment_intent.payment_failed` e `charge.refunded`.
- O _signing secret_ (`whsec_…`) vai para `STRIPE_WEBHOOK_SECRET` no Render. Sem ele, a API recusa todo evento (`503`).
- Teste com um cartão de teste (`4242 4242 4242 4242`) numa compra da demo: o ingresso aparece em "Meus ingressos" quando o webhook chega.

## 11. Eventos de demonstração

O seed roda pelo GitHub Actions, para não precisar de máquina com acesso ao banco ([ADR-0010](adr/0010-dados-da-demo.md)).

- No repositório, _Settings → Environments → New environment_ `demo`, com os segredos `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` (os mesmos valores do Render).
- _Actions → Demo data → Run workflow_ com `seed`: baixa as fotos de licença livre, grava no R2 e publica os eventos com o selo "Demonstração". Rodar de novo não duplica nada.
- `reset` apaga os eventos de demonstração e o organizador de demonstração, sem tocar em outros dados.

## 12. Smoke test

_Actions → Smoke test → Run workflow_ com o endereço do web e o da API, ou localmente:

```sh
WEB_URL=https://<web> API_URL=https://vira-api.onrender.com node scripts/smoke.mjs
```

O [`scripts/smoke.mjs`](../scripts/smoke.mjs) só lê páginas e rotas públicas, sem criar conta nem comprar nada, e confere:

- a API acorda, alcança o banco e o Redis, esconde o `/docs` e responde com `Cache-Control: no-store`;
- a página inicial sai com CSP com nonce, HSTS e `X-Frame-Options`;
- o web repassa `/api/v1` para a API e lista só eventos de demonstração;
- a página do evento mostra o selo, a foto passa pelo otimizador e o aviso de modo de teste aparece;
- a conta recusa quem não entrou (`401` em `application/problem+json`).

Rode depois de cada deploy.

## Operação

- **Voltar uma versão:** _Rollback_ no deploy anterior do Render; na Vercel, _Promote to Production_ no deploy anterior. As migrations só andam para frente: a versão antiga continua funcionando com o banco novo enquanto as migrations do meio só acrescentarem coisas. Se uma delas removeu ou mudou uma coluna, volte também o banco pelo _restore_ do Neon, que guarda o histórico recente.
- **Trocar segredos:** `JWT_SECRET` encerra os access tokens (10 min) e o `CSRF_SECRET` invalida os tokens de formulário em uso; os dois se trocam no Render, seguidos de um deploy. Chaves do Stripe, do R2 e do Resend se trocam no painel do serviço e depois no Render. A chave do QR segue o passo 6.
- **Sessões:** para derrubar todas, `UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;` no console SQL do Neon.
- **Erros:** com `SENTRY_DSN` no Render, os erros da API chegam ao Sentry sem dados pessoais ([SECURITY_MODEL.md](SECURITY_MODEL.md#4-controles-transversais)). Os logs ficam no painel do Render e da Vercel.
- **Limites dos planos gratuitos:** o Upstash conta comandos (o BullMQ consulta as filas em intervalo), o Neon suspende o banco ocioso (a primeira consulta leva alguns segundos), o Resend tem cota diária e o R2 tem 10 GB.
