# Diário de bordo

Arquivo para retomar o trabalho em outra sessão. **No início de cada sessão:** ler este arquivo e o [docs/ROADMAP.md](docs/ROADMAP.md), confirmar o estado do repositório (`git status`, PRs abertos) e dizer qual é o próximo passo antes de começar.

## Estado atual

- **Marco:** 2 — MVP público v1.0 (o Marco 1 terminou com a N13).
- **Concluído (mergeado):** F1 a F7, N1 a N13, V1 a V9 (PRs #1, #2, #8, #10–#17, #26–#30, #32–#44) e Dependabot (#4–#7, #9 CodeQL v4). V10 no PR do endurecimento (`chore/security-hardening`).
- **Entregas abertas:** V10.
- **Próximo passo:** V11 — Deploy da demo e v1.0.0 (`chore/deploy`), **só com autorização explícita do mantenedor**.
- **Bloqueios / pendências do mantenedor:** Docker Desktop não sobe nesta máquina pela sessão do agente (precisa ser iniciado pelo usuário); os testes de integração (Testcontainers) e o job de `docker compose` rodam só no CI até lá.

## Regras que valem sempre

- Nunca commitar na `main`; um PR por entrega do roadmap, aberto como draft.
- Commits por responsabilidade, Conventional Commits, em inglês; sem squash ou amend automático.
- Push da branch e PR draft são permitidos; **merge e deploy só com autorização explícita** do mantenedor.
- PRs empilhados: depois de mergear um PR, **mude a base do PR seguinte para `main` antes de apagar a branch mergeada** (apagar a base fecha o PR dependente).
- Todo PR de código: testes, CI verde, docs e `PROGRESS.md` atualizados. PRs de interface: prints de desktop e mobile, sem mudança de lógica.
- Decisão mudou → novo ADR substituindo o anterior.
- Nada de segredos, `.env` ou dados reais no repositório.
- Código e commits em inglês; documentação em português (README também em inglês).

## Registro

### 2026-10-22 — V10: endurecimento

Auditoria (antes de codar): o SECURITY_MODEL prometia Sentry sem PII, `pnpm audit` no CI e timeout de requisição de 10 s, e nenhum dos três existia; o checklist ASVS ainda tinha onze capítulos em ⬜ ou 🟨 já entregues.

Feito:

- Sentry na API e no worker (`@sentry/node`), ligado só com `SENTRY_DSN` (`SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` ou `RENDER_GIT_COMMIT`): só as integrações de exceção não capturada e promessa rejeitada, `dataCollection` todo desligado, sem breadcrumbs nem tracing, e `beforeSend` puro (`scrubEvent`) que apaga usuário, requisição, extras, breadcrumbs, servidor e variáveis dos frames e mascara e-mails. Um hook do pino manda ao Sentry todo log `error` com `err` (menos a linha de acesso); job que esgota as tentativas também vai. Testes do `scrubEvent`, do hook e do envelope real que sairia (transporte falso).
- Varredura OWASP ZAP 2.16.1 (planos em `security/zap`): o web, no job `zap` novo do CI, e a API, pelo OpenAPI, local. Nenhum alerta alto ou médio real. O rastreamento mostrou que um formulário enviado antes do script carregar caía em `GET` e punha e-mail e senha na URL: todos os formulários tratados por script ganharam `method="post"` (E2E com JavaScript desligado). "Absence of Anti-CSRF Tokens" é falso positivo e fica filtrado no plano com a justificativa.
- Rate limits e CSP revisados: CSP sem mudança (nonce, `strict-dynamic`, sem `unsafe-inline` em produção); novo limite de 30 rascunhos por hora por conta; 10 s para mandar a requisição inteira.
- `pnpm audit --prod --audit-level high` no CI; overrides tiram `deepmerge-ts` e `mysql2` (trazidos pelo CLI do Prisma) das versões com alerta.
- SECURITY_MODEL: checklist ASVS revisado com evidência (só V12 fica em andamento até o deploy), seção da varredura ZAP com as decisões e riscos residuais.

Decisões tomadas por conta própria:

- **Sem Sentry no web**: exigiria abrir o `connect-src` da CSP para o Sentry e mandar erros do navegador; os erros do servidor do web ficam nos logs da Vercel.
- **Vitrine sem limite por IP**: as páginas são desenhadas no servidor do web, e as chamadas chegariam de poucos IPs da Vercel.
- **`TRUST_PROXY_HOPS=2` em produção** (rewrite da Vercel + proxy do Render), a conferir no V11; o risco de forjar o IP chamando o Render direto ficou registrado.

### 2026-10-22 — V9: direitos LGPD

Auditoria (antes de codar): o desenho estava pronto em PRIVACY.md (seções 4, 5 e 9) e no API.md; `users.anonymized_at`, o motivo de revogação `ACCOUNT_DELETED` e as ações `user.data_exported`/`user.anonymized` do catálogo de auditoria já existiam. Faltavam as rotas, a varredura de retenção, a página `/privacidade` e a tela na conta.

Feito:

- API: módulo `privacy` com `GET /me/export` (JSON `vira.data-export.v1` com conta, logins sociais, sessões ativas, perfil de organizador e seus eventos, pedidos e ingressos; `Content-Disposition: attachment`; 3/dia/conta; auditado) e a anonimização, numa transação que trava a conta: nome e e-mail trocados em `users` e nos pedidos, `holder_names` e `holder_name` viram "Titular removido", ingressos `VALID` de eventos que não terminaram são cancelados, pedido pendente expira na hora, sessões, logins sociais e links apagados, perfil de organizador vira "Organizador removido" (com slug novo). `DELETE /me` fica no `auth` (reautenticação e cookies): senha de novo, ou, em conta só social, login feito há menos de 5 minutos (`401 reauthentication-required`); organizador com evento publicado por acontecer recebe `409 organizer-has-upcoming-events` e nada muda. Conta anonimizada some para `findById` (auth e users): o access token que sobrou não abre nada.
- Retenção: `RetentionSweeper` no worker (e no modo embutido) aplica a cada 6 h as regras da seção 5 do PRIVACY.md, todas idempotentes; o `ops.purge-outbox` continua no poller do outbox.
- E-mails: todos terminam com o link da política de privacidade.
- Web: `/privacidade` (inventário em linguagem simples, com data), link no rodapé, no cadastro e nos titulares do checkout; seção "Privacidade" em Minha conta com "Baixar meus dados" e "Excluir minha conta" (modal que diz o que acontece, pede senha e a palavra EXCLUIR, e explica o bloqueio do organizador e a reautenticação); `/conta-excluida`.
- Testes: unidade (casos de uso, reautenticação, limites, e-mails); integração com Postgres que **varre todas as linhas de todas as tabelas** atrás do nome, do e-mail e do nome de um terceiro titular depois da exclusão, prova o bloqueio do organizador com rollback, a reautenticação e as regras de retenção (segunda rodada não muda nada); E2E das telas com axe; prints.

Decisões tomadas por conta própria:

- **Ingresso cancelado na exclusão não devolve o lugar ao estoque nem o dinheiro**: não há reembolso automático no MVP, e o modal diz isso com todas as letras.
- **Conta com senha sempre digita a senha**; o caminho "login recente" vale só para contas sem senha.
- **Slug do organizador removido também muda**, porque vinha do nome.
- **E-mail novo pendente sai junto com o link vencido** na varredura, não só os tokens.

### 2026-10-22 — V8: check-in

Auditoria (antes de codar): o QR assinado (ADR-0008) e o `verifyQrToken` já existiam (V5), assim como a ação de auditoria `ticket.checked_in`; faltavam a tabela `checkin_attempts`, as rotas e a tela. O `Permissions-Policy` desligava a câmera em todo o site.

Feito:

- API: módulo `checkin` com `POST /checkin/scan` e `POST /checkin/code` (só o organizador dono do evento; evento alheio responde `404`) e `GET /organizer/events/{id}/checkin/stats`. A entrada é decidida por um único `UPDATE ... WHERE status = 'VALID' AND event_id AND qr_nonce`; toda leitura vai para `checkin_attempts` (migração nova, com `CHECK` de que `VALID`/`ALREADY_USED`/`WRONG_EVENT` sempre nomeiam o ingresso) e cada entrada é auditada. Rate limit por operador: 120/min no QR, 20/min no código, gasto antes de qualquer consulta. O token passa pelo `QrTokens` do módulo `tickets` (API pública nova), que verifica com todas as chaves de `QR_SIGNING_KEYS`.
- Contratos em `@vira/shared` (`checkin.ts`), com `normalizeTicketCode` (maiúsculas, prefixo, traços e O/I/L lidos como 0/1).
- Web: `/painel/eventos/{id}/check-in` (link "Abrir check-in" no evento publicado ou encerrado), câmera ligada pelo operador e lida com jsQR (carregado só nessa página), código digitado, resultado em cor + ícone + texto grande (`aria-live="assertive"`, vibração curta), "Ler próximo", contagem de entradas e últimas leituras. Só esse caminho recebe `camera=(self)`.
- Testes: unidade do `judge` e do caso de uso (corrida simulada, token forjado, limites); integração com Postgres real (duas leituras simultâneas → 1 `VALID` e 1 `ALREADY_USED`; oito misturando QR e código → 1 entrada; byte alterado, nonce trocado, outro evento, cancelado, autorização, 21º código → `429`, auditoria); E2E com a câmera falsa do Chromium lendo um QR de verdade (Y4M gerado no teste), códigos, todos os resultados, `Permissions-Policy`, axe; prints.

Decisões tomadas por conta própria:

- **Código de outro organizador responde `INVALID`**, não `WRONG_EVENT`: assim a digitação manual não serve para descobrir quais códigos existem. Entre eventos do mesmo organizador, e para QR assinado, `WRONG_EVENT`.
- **Cancelado é `INVALID` com o ingresso** (titular, tipo e código), para o operador saber o que dizer; a resposta não ganhou um quinto resultado.
- **Leitura pausa depois de cada resultado** até "Ler próximo": o mesmo QR parado na frente da câmera não vira um "Já utilizado" logo depois do "Válido".
- **Câmera só com um toque** em "Ligar câmera", nunca ao abrir a página; sem câmera ou sem permissão, a tela manda para o código digitado.
- **Check-in aberto também em evento encerrado** (há quem chegue atrasado); rascunho e cancelado mostram um aviso.

### 2026-10-22 — V7: meus ingressos e ingresso digital

Auditoria (antes de codar): a API já tinha `GET /tickets` e `GET /tickets/{id}` com o `qrToken` (V5); o e-mail já apontava para `/ingressos`, que não existia; o resumo do ingresso não traz a foto do evento.

Feito (só web; a API não mudou):

- `/ingressos`: abas Próximos/Passados, cartões com data, evento, titular, tipo, local, código e selo "Utilizado"/"Cancelado", "Carregar mais" com o cursor, estados vazios do DESIGN.
- `/ingressos/{id}`: o ingresso digital (faixa da foto no desktop, data com "Demonstração", horário, local, titular e tipo, linha picotada com recortes, QR de 240 px com nível M e zona de silêncio, código em mono), estados `USED` (QR a 25% com "Utilizado em…") e `CANCELED` (sem QR, alert), pedido e outros ingressos dele, "Como chegar", "Tela cheia" (`<dialog>` nativo, só QR, titular e código em branco) e "Imprimir" (`@media print` sem header, footer e botões).
- "Meus ingressos" no header (logado) e no menu da conta; a confirmação do checkout leva aos ingressos.
- Tokens novos: `aspect-ticket` (16:6) e `max-w-ticket` (480 px).
- Testes: unidade do QR (padrões de localização, determinismo); E2E com a API simulada (rota de teste que emite um pedido pago): vazio, lista, detalhe, outro ingresso do pedido, tela cheia com Esc e foco de volta, impressão, usado, cancelado, passados, não encontrado, sessão exigida, axe; prints.

Decisões tomadas por conta própria:

- **QR gerado no navegador** (`qrcode`) e desenhado como um `<path>` SVG: nada de HTML injetado nem estilo inline, que a CSP proíbe.
- **Foto, endereço e "Demonstração" vêm da página pública do evento** (`GET /events/{slug}`); se ela falhar, o ingresso aparece sem eles.
- **Carrossel do mobile como links anterior/próximo** (operável por botões, WCAG 2.5.1), sem gesto.
- **Lista sem a miniatura do evento** (a variante `compact` do card fica para quando a API trouxer a imagem no resumo do ingresso).
- **Cancelado sem motivo**: a API ainda não guarda o motivo do cancelamento do ingresso.

### 2026-10-22 — V6: checkout

Auditoria (antes de codar): a página do evento só listava os tipos; o cliente da API não tinha `PUT` nem cabeçalhos próprios (a `Idempotency-Key`); a API não tinha onde guardar os titulares antes do pagamento e o `pending-order-exists` não dizia qual era o pedido.

Feito:

- API: `order_items.holder_names` (`CHECK` com exatamente `quantity` nomes válidos ou vazio), `PUT /orders/{id}/holders` (pedido pendente com a reserva em andamento, todas as linhas, um nome por ingresso), pagamento recusado sem os titulares (`409`), emissão com o nome de cada posição e `orderId` no `409 pending-order-exists`.
- Web: seletor na página do evento (radio por tipo, stepper, total, "Comprar ingresso", barra fixa no mobile com área segura), login preservando a escolha no endereço (`?ingresso=&quantidade=`), reserva com `Idempotency-Key` por tentativa, retomada da reserva já existente.
- Checkout (`/checkout/{id}`): header próprio sem navegação ("Pagamento seguro"), etapas, contador da reserva (anuncia só em 5, 2 e 1 min e no fim; em `warning` com "Manter reserva" nos 2 minutos finais), resumo fixo no desktop e recolhível no mobile, titulares (o primeiro com o nome do comprador) e Payment Element do Stripe carregado só nessa etapa (`@stripe/stripe-js/pure`).
- Confirmação (`/checkout/{id}/confirmacao`): "Confirmando pagamento…" até o webhook marcar `PAID`, depois o pedido e os códigos dos ingressos; demora, pedido encerrado/estornado e retorno de 3-D Secure recusado têm telas próprias. Reserva expirada: modal "Sua reserva expirou" com "Tentar de novo" voltando à mesma escolha.
- CSP: `js.stripe.com` e `*.js.stripe.com` em `script-src`/`frame-src`, `hooks.stripe.com` em `frame-src`, `api.stripe.com` em `connect-src`.
- Testes: unidade (titulares, seleção pelo endereço, contador e anúncios, cliente com cabeçalhos, CSP); integração (titulares, recusas, `CHECK` no banco, ingressos com os nomes); E2E com a API simulada e um Stripe.js de mentira (login preservando a escolha, titulares, pagamento, webhook simulado, cartão recusado, retomada, extensão, expiração, axe); prints.

Decisões tomadas por conta própria:

- **Um tipo de ingresso por compra** (radio, como no wireframe); a API continua aceitando várias linhas.
- **Nome e e-mail do comprador só leitura no checkout** (vêm da conta; mudam em "Minha conta"), e titulares numa etapa antes do pagamento, que só é criado com eles salvos.
- **Confirmação mostra os códigos** em vez de levar ao ingresso: a página do ingresso é a V7.
- **Resumo sem a foto do evento** (o pedido não traz a imagem; evita outra chamada).
- Ficam para depois: página de ingressos (V7), cancelar o PaymentIntent quando a reserva expira.

### 2026-10-21 — V5: emissão de ingressos

Auditoria (antes de codar): não existia a tabela `tickets` nem o módulo; a outbox tinha `orders.paid` (fila `tickets`, sem consumidor) e `tickets.issued` (fila `email`). Titulares (`PUT /orders/{id}/holders`) só entram na V6.

Feito (API e docs; não mexe no web):

- Migração `tickets` (enum `ticket_status`, `CHECK`s de formato, nonce de 16 bytes, carimbos por status) e trigger `BEFORE INSERT` que recusa ingresso de pedido não `PAID`, de outra linha/tipo/evento ou além da quantidade da linha.
- Emissão na transação do webhook: `orders` expõe `OrderEvents` (API pública), `tickets` se inscreve e emite um ingresso por unidade, com código `VIRA-XXXX-XXXX` e nonce aleatórios (código já usado → sorteia outro, até 5 tentativas) e `tickets.issued` na outbox. `orders.paid` saiu do catálogo da outbox.
- Token do QR (ADR-0008): `v1.<kid>.<payload>.<sig>`, HMAC-SHA256, chaves em `QR_SIGNING_KEYS` (`kid:chave`, a primeira assina, todas verificam), só base64url canônico (sem duas grafias do mesmo token).
- `GET /tickets` (`when=upcoming|past`, cursor preso ao comprador e ao filtro) e `GET /tickets/{id}` (só o dono, com `qrToken`, `Cache-Control: no-store`).
- E-mail com os códigos dos ingressos e link para `/ingressos` (página na V7), pelo worker; sem o token do QR.
- Testes: token (assina/verifica, rotação, **cada troca de 1 caractere em qualquer posição → recusado**, kid desconhecido, formato), códigos, emissão com fakes (colisão de código, desistência após 5), e-mail; integração: webhook → 3 ingressos para 3 unidades, lista e detalhe só para o dono (`404`/lista vazia para outro, `401` sem sessão), QR verificando com a chave da config, e-mail pelo worker, paginação com cursor recusado para outro comprador, trigger recusando pedido pendente, outra linha e excesso, e pagamento reembolsado sem ingressos.

Decisões tomadas por conta própria:

- **Titular = nome do comprador** até a V6 trazer os titulares.
- **O evento do ingresso é um resumo próprio** (com local), não o `EventSummary` da vitrine, que exige a URL da imagem.
- **`orders.paid` removido da outbox** em vez de manter uma fila sem consumidor; os testes da outbox passaram a usar `tickets.issued`.
- **Lista padrão `upcoming`**; o e-mail não leva o QR (só quem entra na conta vê o token).
- Ficam para depois: titulares (V6), página de ingressos (V7), validação no check-in (V8), anonimização do titular (V9).

### 2026-10-21 — V4: webhook do Stripe

Auditoria (antes de codar): a outbox já tinha `orders.paid` e `orders.refund_requested`, a auditoria já tinha `order.paid`/`order.refunded`/`payment.webhook_processed`; não existiam a tabela de eventos processados, o segredo do webhook nem o body bruto no Nest. O `CHECK` dos carimbos não deixava um pedido cancelado virar `REFUNDED`.

Feito (API e docs; não mexe no web):

- `POST /payments/stripe/webhook` (público, fora do OpenAPI): assinatura verificada com o SDK sobre o body bruto (`rawBody: true` no Nest), tolerância de 5 min; `400 invalid-signature` sem efeito; `503` sem `STRIPE_WEBHOOK_SECRET` (exigido em produção, formato `whsec_`).
- `processed_webhook_events` (migração), gravado na transação do efeito: reenvio, inclusive simultâneo, responde `200` sem efeito; efeito que falha deixa o evento sem registro, para o Stripe reenviar.
- `payment_intent.succeeded`: o módulo `orders` aplica o pagamento (`SettlePayment`) com o pedido travado `FOR UPDATE`, conferindo PaymentIntent e valor contra o pedido. `PENDING → PAID` (reservado vira vendido, `orders.paid` na outbox, auditoria); `EXPIRED` → vende de novo, tudo ou nada → `PAID` tardio, senão `REFUNDED`; `CANCELED → REFUNDED`. O reembolso vai pela outbox para a fila `payments`, onde o worker chama o Stripe com `refund:{orderId}`.
- `payments` não depende de `orders`: expõe `PaymentEvents`, onde `orders` se inscreve.
- Testes: verificador (body alterado, outro segredo, timestamp velho, cabeçalho inválido) e caso de uso com **fixtures assinadas** (`generateTestHeaderString`), reenvio, falha no meio (evento não registrado), tipos ignorados, `livemode`; liquidação com fakes (no prazo, tardio com e sem estoque, cancelado, PaymentIntent/valor errados); integração com Postgres e Redis: 4 entregas simultâneas → um `PAID`, estoque e auditoria uma vez; assinatura errada/velha/ausente → `400` sem efeito; pagamento tardio com e sem estoque; reembolso chegando ao gateway pelo worker.

Decisões tomadas por conta própria:

- **Pagamento depois do cancelamento é reembolsado** (`CANCELED → REFUNDED`), em vez de reviver o pedido: o comprador desistiu.
- **PaymentIntent ou valor que não confere** com o pedido: evento registrado, pedido intocado, log de aviso (sem reembolso automático: não deveria acontecer e pede olho humano).
- **Body de até 100 kB também no webhook** (a doc falava em 1 MB): eventos de PaymentIntent têm poucos kB, e um parser separado só para essa rota não compensa agora.
- **`payment_intent.payment_failed` e `charge.refunded` só são registrados.**
- Ficam para depois: cancelar o PaymentIntent quando a reserva expira, e-mail ao comprador no reembolso, limpeza de `processed_webhook_events` após 90 dias (V9) e a emissão de ingressos no pagamento (V5).

### 2026-10-21 — V3: pagamento (PaymentIntents)

Auditoria (antes de codar): `orders.stripe_payment_intent_id` (único) já existia desde a V1, o catálogo de auditoria já tinha `order.paid` e a outbox já tinha `orders.paid`/`orders.refund_requested` (para a V4). Não existiam o módulo `payments`, a configuração do Stripe nem o SDK.

Feito (API e docs; não mexe no web):

- Configuração: `PAYMENTS_MODE` (só `test`), `STRIPE_SECRET_KEY` e `STRIPE_PUBLISHABLE_KEY`, juntas ou nenhuma, só `sk_test_`/`pk_test_`; chave live (`sk_live_`, `pk_live_`, `rk_live_`) **impede o processo de subir**, com a mensagem dizendo por quê e sem ecoar o valor; obrigatórias em produção.
- Módulo `payments`: porta `PaymentGateway`, adaptador com o SDK oficial (`stripe` 23, timeout de 10 s, 2 retentativas de rede, sem telemetria) que valida a resposta com Zod (`pi_...`, `client_secret`, `brl`, `livemode: false`) e reporta erros só pela classe; `PaymentIntents` na API pública.
- `POST /orders/{id}/payment`: só o dono, só `PENDING` com a reserva em andamento; cria o PaymentIntent com o total gravado no pedido, `metadata.orderId` e idempotency key `pi:{orderId}`, grava o id no pedido e devolve `{ clientSecret, publishableKey }`; chamadas seguintes devolvem o mesmo. 10/min por conta. `503 payments-unavailable` sem chaves ou com o Stripe fora.
- Testes: configuração (chaves live recusadas no boot, trocadas, sozinhas, exigidas em produção), adaptador contra um servidor HTTP falso no lugar da API do Stripe (corpo, `Idempotency-Key`, `Authorization`, resposta inesperada, erro do Stripe, Stripe fora), caso de uso com fakes e integração com Postgres: **o valor vem do pedido mesmo depois de o organizador mudar o preço**, 3 chamadas simultâneas → um PaymentIntent, outro comprador → `404`, reserva vencida → `409`, Stripe fora → `503`.

Decisões tomadas por conta própria:

- **Sem chaves, pagamentos desligados (`503`)** em vez de chaves obrigatórias em todo ambiente: desenvolvimento e testes sobem sem conta no Stripe; produção exige as chaves.
- **A resposta não traz o id do PaymentIntent**, só o `clientSecret` e a chave publicável, que é o que o Payment Element usa.
- **Titulares não são exigidos ainda:** `PUT /orders/{id}/holders` entra com o checkout (V6), junto com a regra "titulares faltando → `409`".
- **Cancelar o PaymentIntent quando a reserva expira** fica para a V4, com o pagamento tardio.
- Nada de nome ou e-mail vai para o Stripe: só `metadata.orderId`.

### 2026-10-21 — V2: expiração, extensão e cancelamento

Auditoria (antes de codar): a V1 deixou `OrderExpiry` (transição condicional + devolução do estoque), o índice parcial de pendentes por `expires_at`, `extension_count` com `CHECK` de 0 a 1, `canceled_at` amarrado ao status e as ações `order.expired`/`order.canceled` no catálogo de auditoria. Não havia fila nem job de pedidos.

Feito (API e docs; não mexe no web):

- **Job com delay:** depois do commit do pedido (e de cada extensão), a API agenda `orders.expire` na fila nova `orders`, com delay até `expires_at` e id `expire-{orderId}-{expiresAt}`. O handler roda `ExpireOrder`: transação com a transição condicional, estoque devolvido, `order.expired` auditado com ator `SYSTEM`. Pago, cancelado, estendido ou já expirado: o job só termina.
- **Varredura:** `OrderSweeper`, timer em processo a cada minuto (e ao subir), expira em lotes de 100 os pendentes vencidos cujo job se perdeu.
- **`POST /orders/{id}/extend`:** uma vez, nos 2 minutos finais, +10 min; `UPDATE` com compare-and-set no `expires_at` antigo, então requisições simultâneas estendem uma vez. O job antigo encontra o pedido com prazo e não faz nada.
- **`POST /orders/{id}/cancel`:** `PENDING` → `CANCELED` com o estoque devolvido na mesma transação; repetir devolve `200`.
- `platform/queue` dividido em `QueueClientModule` (só enfileira; sempre na API) e `QueueModule` (consome; worker ou modo embutido).
- Testes: unitários (expiração antes e depois do prazo, depois de pago ou cancelado, varredura, extensão com janela e limite, cancelamento repetido, BOLA) e integração com Postgres e Redis reais e relógio controlado: job agendado com delay de 10 min → relógio avança → job promovido expira e devolve o estoque; job adiantado ou depois do cancelamento não muda nada; varredura com job perdido; **cancelamento e expiração simultâneos devolvem o estoque uma vez**; 5 extensões simultâneas → uma `200`; cancelar e pedir de novo na hora.

Decisões tomadas por conta própria:

- **Varredura em processo, não job repetível:** como o poller da outbox; a rede de segurança dos jobs perdidos não pode depender do Redis.
- **Agendar nunca falha o pedido:** sem Redis, o pedido é criado e a varredura o expira até um minuto depois do prazo.
- **O pedido novo continua expirando o vencido na hora** (comportamento da V1): o comprador não espera o job nem a varredura para comprar de novo.
- **Mesmo envelope dos jobs da outbox** (`messageId`, `type`, `payload`) para a fila `orders`, para reaproveitar o roteamento e os logs dos consumidores.
- **Cancelar um pendente já vencido vale** (vira `CANCELED`); cancelar de novo devolve `200` em vez de `409`, para uma repetição de rede não parecer erro.

### 2026-10-21 — V1: reserva de estoque

Auditoria (antes de codar): `ticket_types` já tinha `sold`, `reserved` e o `CHECK (sold + reserved <= capacity)` (N8), o catálogo de auditoria já tinha `order.created` e os tipos de problema dos pedidos já estavam na API.md; não existiam as tabelas de pedidos nem o módulo `orders`.

Feito (API e docs; não mexe no web):

- Migration `orders` e `order_items` conforme o DATA_MODEL: índice único parcial de um `PENDING` por comprador e evento, `UNIQUE(buyer_id, idempotency_key)`, `request_hash` de 32 bytes, `CHECK` que amarra cada status aos seus carimbos, total entre R$ 0,01 e R$ 999.999,99, cópia do nome e do e-mail do comprador, chaves estrangeiras `RESTRICT` para conta, evento e tipo de ingresso.
- Módulo `orders` (domain/application/infra/http): `POST /orders` com `Idempotency-Key` (UUID) e `GET /orders/{id}` (só o dono; de outro é `404`). Numa transação: trava consultiva da chave (`409 request-in-progress`), repetição com o mesmo corpo devolve o mesmo pedido (`200`, `Idempotent-Replayed: true`) e com outro corpo `422`, `FOR KEY SHARE` no evento, janela de vendas, `max_per_order`, um pendente por evento (`409`), `UPDATE` condicional em ordem de id com o preço lido na mesma linha, `INSERT ... ON CONFLICT DO NOTHING` (conflito com o pendente de uma requisição concorrente não aborta a transação). Auditoria `order.created`.
- Rate limit: 30/min por IP (guard, antes do corpo) e 10/min por conta (caso de uso).
- `users` ganhou `AccountContacts` na API pública (nome e e-mail para a cópia do pedido).
- Excluir tipo de ingresso: agora também recusa (`409`) um tipo que já esteve num pedido, que a FK impediria de qualquer forma.
- Testes: unitários do domínio e do caso de uso (com rollback simulado), e2e sem banco (sessão, `Idempotency-Key`, mass assignment, `429` antes da validação, política de acesso) e integração com Postgres: **25 compradores simultâneos pela última vaga → 1 `201` e 24 `409`**, pedidos concorrentes de vários tipos em ordens invertidas sem deadlock nem estouro, 8 repetições simultâneas da mesma chave → um pedido só, 6 pedidos simultâneos do mesmo comprador → um pendente, expiração na hora devolvendo o estoque uma vez, `CHECK` do banco recusando overbooking.

Decisões tomadas por conta própria:

- **Pendente vencido expira na hora:** sem a V2 (job de expiração), o índice de um pendente por evento prenderia o comprador; o novo pedido expira o vencido na mesma transação, com o `UPDATE` condicional que a V2 vai reaproveitar (`OrderExpiry`).
- **Código público com 8 caracteres (`VIRA-ORD-XXXX-XXXX`)**, como o dos ingressos, em vez de 4: com 4 (cerca de um milhão de códigos) as colisões ficariam frequentes cedo; docs e o mock do DESIGN atualizados.
- **Teto de R$ 999.999,99 por pedido** (limite do Stripe para BRL), checado na API e no banco; evita também estourar o `int` do total.
- **Pedido não mostra nome nem e-mail do comprador:** a resposta não carrega dado pessoal.
- **`GET /orders/{id}` entrou já:** o `Location` do `201` aponta para ele, e o checkout (V6) vai precisar.

### 2026-10-20 — N13: seed de demonstração

Auditoria (antes de codar): a coluna `is_demo`, o `CHECK` do crédito da foto, o selo "Demonstração" no card, na página e no painel e o aviso de modo de teste já existiam (N8, N10–N12), com E2E sobre a API falsa. Faltava o seed que cria os dados de verdade e o `--reset` do ADR-0010.

Feito (API e docs; não mexe no web):

- `pnpm db:seed:demo` (raiz) → `apps/api` `db:seed:demo`, como o `storage:setup`: um organizador ("Vira Demonstração", `demo@vira.invalid`, sem senha, ninguém entra com ele) e cinco eventos publicados em cidades diferentes (jazz em São Paulo, teatro em Belo Horizonte, show em Porto Alegre, festival de dois dias em Recife, conferência em Florianópolis), com descrição em markdown, local, tipos de ingresso (meia-entrada, mesa, camarote, lotes) e foto.
- Fotos reais da Unsplash (Licença Unsplash), com autor, link e licença conferidos na página de cada uma; o seed baixa o recorte 2400 × 1600 (3:2), passa pelo mesmo `SharpImageProcessor` dos uploads da N9 (WebP sem metadados, `blurDataUrl`) e grava no bucket com a chave `events/<eventId>/<uuid>.webp`.
- Idempotente: ids derivados de nomes estáveis (UUIDv5), `upsert` de usuário, perfil, evento e tipos de ingresso; foto que já está no bucket não é baixada de novo; `sold` e `reserved` nunca são tocados; tipo de ingresso que saiu do seed só é apagado se não tiver vendas nem reservas; evento de demonstração cancelado à mão volta a ficar à venda.
- Datas relativas ao dia em que roda (dia da semana e horário no fuso do evento), para a demo nunca mostrar evento passado; na conferência o segundo lote só abre quando o primeiro fecha, para a vitrine mostrar um ingresso "em breve".
- `--reset` apaga só os eventos com `is_demo` (os tipos de ingresso vão junto), as fotos deles no bucket e o organizador de demonstração (se não sobrou evento dele).
- Testes: unitários (cada evento passa pelos schemas de criação de evento, de tipo de ingresso e de texto alternativo; slugs, créditos, dias e horários no fuso; argumentos e configuração inválida) e de integração com Postgres e S3 (vitrine e página com selo e crédito, segunda execução sem duplicar nem baixar fotos, foto que sumiu do bucket baixada de novo, evento cancelado republicado, `--reset` que preserva o evento de outro organizador e apaga as imagens).
- Docs: README (pt e en) com o passo opcional e o quadro do roadmap atualizado, CONTRIBUTING, ARCHITECTURE e ROADMAP (N7 a N12 marcadas como concluídas).

Decisões tomadas por conta própria:

- **Fotos baixadas na hora, não commitadas:** o repositório fica leve e a licença continua apontando para a página de cada foto; o seed precisa de internet (a nuvem do agente não alcança a Unsplash, então o download real não foi exercitado aqui, só com fotos geradas nos testes).
- **Locais e atrações inventados,** com o selo "Demonstração" deixando isso claro; nenhum número de vendas é inventado (`sold` fica zero).
- **Seed em `src/bootstrap/demo-seed/`,** e não em `prisma/`: reaproveita o processamento de imagem, o markdown sanitizado e o armazenamento da API, e é compilado como o `storage:setup`.
- **Branch `feat/demo-seed`,** o nome do roadmap.

Pendências para o mantenedor decidir ou priorizar:

- **Créditos das fotos no rodapé** (DESIGN.md, Footer): hoje o crédito aparece sob a foto na página do evento; o rodapé ainda não lista os créditos da demo.
- **Rodar `pnpm db:seed:demo` na sua máquina** para conferir as fotos baixadas de verdade.

### 2026-10-19 — N12: painel do organizador

Auditoria (antes de codar): a API do organizador (N8) e o upload da imagem (N9) estavam prontos e documentados na API.md; o web não tinha nenhuma tela de organizador, e "Quero organizar eventos" em `/conta` (N7) terminava num "em construção". O painel precisa da sessão e do cliente da API da N7 (PR #28) e do `EventImage` e da formatação de datas da N11 (PR #33), nenhum dos dois mergeado; a branch saiu da N11 com a N7 mergeada dentro (conflitos resolvidos no merge commit). A pendência da N9 sobre a CSP também foi resolvida aqui.

Feito (web; não mexe na API):

- Rotas `/painel` (lista com filtros por situação e "Mais eventos"), `/painel/eventos/novo` (cria o rascunho) e `/painel/eventos/[id]` (edição). Sem a dica de sessão, redireciona para `/entrar?next=…`; conta sem perfil de organizador vê um estado vazio que leva a `/conta#organizador`.
- Editor: detalhes (título, início e fim no fuso do evento, fuso, local tudo-ou-nada, descrição em markdown com a prévia sanitizada que a API devolve), imagem (prévia local, checagem de tipo, tamanho e dimensões, `PUT` direto no bucket e confirmação com a descrição), tipos de ingresso (Modal de criação e edição, exclusão com confirmação), painel de publicação com o que falta, publicar, cancelar com motivo, excluir rascunho. Evento cancelado ou encerrado fica só de leitura.
- Erros da API: `invalid-state-transition` lista os campos que faltam no checklist, `invalid-image` e `conflict` mostram o `detail` da API; erros de campo voltam para o campo certo.
- `lib/organizer`: datas no relógio do fuso do evento, preço em reais (`R$ 1.250,50`) para centavos, fusos do Brasil, situação do evento (Encerrado é publicado que já terminou) e validações dos formulários; `lib/api/organizer.ts` com as rotas do organizador.
- `useForm`: textarea e validadores que leem os outros campos (fim depois do início, local tudo-ou-nada, janela de vendas).
- CSP: `connect-src` passa a liberar o `STORAGE_ORIGIN` (o `PUT` da imagem). "Meus eventos" no menu da conta e "Criar um evento" no estado vazio da home, só para organizadores. O chip "Este fim de semana" virou um `FilterChip` genérico, usado também pelos filtros do painel.
- Testes: unitários (fuso, preço, situação e checklist, arquivo de imagem, validações, CSP e mensagens de erro); E2E em desktop e mobile com a API falsa ganhando as rotas do organizador (validadas com os schemas do `@vira/shared`) e o armazenamento falso aceitando o `PUT`: redirecionamento do login, conta sem perfil, fluxo completo do rascunho vazio até a página pública (com axe em cada tela e a publicação recusada antes de completar), edição de detalhes e de tipo de ingresso, exclusão de tipo e de rascunho, cancelamento, evento inexistente.
- Prints: `web-organizer-{empty,new-event,draft,ticket-type,published,list}-{desktop,mobile}.png` (o `screenshots.mjs` os gera com `FAKE_API_URL`).

Decisões tomadas por conta própria:

- **Datas digitadas no relógio do fuso do evento**, não no do navegador: um organizador em Manaus criando um show em São Paulo digita o horário que está no cartaz.
- **Lista sem imagem:** o resumo da API do organizador não traz a imagem, e buscar o detalhe de cada evento só para isso não vale.
- **Trocar só a descrição da imagem pede um novo envio**, porque não há rota para isso (pendência da N9).
- **Validação no navegador espelha a da API** (preço de R$ 1,00 a R$ 100.000,00, até 20 por pedido, janela até o fim do evento, imagem de 1200 × 600 e 5 MB), mas a API continua decidindo: os erros dela voltam para os campos.
- **Rascunho criado só com os detalhes;** imagem e ingressos entram na tela de edição, que é para onde a criação leva.

Pendências para o mantenedor decidir ou priorizar:

- **Imagem na lista do painel:** incluir a imagem no resumo de `GET /organizer/events` permitiria a variante `compact` do card.
- **Faixas de disponibilidade** ("últimos ingressos") a critério do organizador: ainda sem campo na API (pendência da N10).
- **Vendas por evento** (`/sales`) entram com os pedidos (Marco 2).
- **Deploy (V11):** o `STORAGE_ORIGIN` de produção também vale para o `connect-src`; o CORS do bucket precisa do `WEB_ORIGIN` de produção (`storage:setup`).

### 2026-10-19 — N11: home, card e página do evento

Auditoria (antes de codar): a N10 (PR #32) ainda não estava mergeada e a N11 consome os contratos dela, então a branch saiu da N10. A N7 (PR #28) também não estava, e a N11 não depende dela: as duas mexem no header, no `fake-api` do E2E e nos prints, e quem for mergeada depois resolve o conflito (pequeno: o header ganha "Explorar" e "Buscar" ao lado do menu da conta; os fixtures da vitrine ficam em `e2e/fixtures/`, fora do `fake-api.ts` da N7). O web não tinha cliente para ler a API no servidor nem configuração de imagens.

Feito (web e `@vira/ui`; não mexe na API):

- `@vira/ui`: `EventCard` (seção 3.3: foto 3:2, data no accent, título em até duas linhas, local, preço, badge de status sobre a foto e "Demonstração"; card inteiro clicável com uma parada de tabulação; placeholder tipográfico sem foto) e tokens de proporção das fotos.
- Home: título, busca (GET para `/eventos`), chip "Este fim de semana", o próximo evento em destaque grande ao lado do título no desktop (no mobile vira o primeiro card) e até 6 destaques; estado vazio sem nada inventado.
- Explorar (`/eventos`): busca por texto e cidade, chip de fim de semana, paginação por cursor ("Mais eventos"), erro de busca curta no campo, "Nada encontrado" com "Limpar filtros" e recuperação de cursor adulterado. "Explorar" no header (e "Buscar" no mobile).
- Página do evento: banner 16:9 (4:3 sangrado no mobile), crédito da foto, badge e alert de demonstração, data e horário no fuso do evento com o nome do fuso, local com link para o OpenStreetMap, organizador, descrição sanitizada pela API (dobra em 6 linhas com "Ler mais" no mobile), ingressos em linhas com o estado de venda, evento cancelado e encerrado.
- Carregamento: skeletons nas três páginas; erro: a página de erro existente.
- SEO: `metadataBase`, título, descrição, canonical, Open Graph e Twitter card por evento, JSON-LD `Event`, `/eventos/[slug]/imagem` (endereço estável da foto para prévias), `robots.txt`.
- Config: `STORAGE_ORIGIN` e `SITE_URL` (lidas no build, mesmas regras do `API_ORIGIN`), `images.remotePatterns` só do armazenamento.
- Testes: unitários de formatação (preço, datas e fusos, intervalo de datas, resumo), busca (parâmetros, fim de semana em Brasília), SEO (metadata, JSON-LD que não fecha a tag), origens e `next.config`, e do `EventCard` (ordem, um único link, só a data em vermelho, sem `style=` no HTML do servidor); E2E em desktop e mobile com uma API falsa (fixtures marcados "Demonstração", fotos PNG geradas em código) e uma segunda instância vazia: cards, destaque, fotos pelo otimizador sem violação de CSP, busca, filtros, paginação, cursor adulterado, página do evento (ordem de leitura, fuso, crédito, ingressos, "Ler mais", cancelado, encerrado, metadados e JSON-LD, foto do Open Graph, slug inexistente), axe em todas e reflow em 320 px.

Decisões tomadas por conta própria:

- **Sem botão de compra:** o checkout é a V6. A página mostra os tipos e preços e diz, num alert, que a compra pelo site ainda não está aberta, em vez de um CTA que não leva a lugar nenhum.
- **Fotos pelo otimizador com `getImageProps`**, sem o `style` que o `<Image>` escreve (a CSP bloquearia) e com a prévia borrada como `<img>` separada.
- **Explorar entrou na N11:** a busca do wireframe da home precisa de um destino, e "Ver todos" também.
- **"Este fim de semana"** é sábado 00:00 a segunda 00:00 em Brasília (sem horário de verão desde 2019), para eventos de qualquer fuso.
- **Streaming com `loading.tsx`**: slug inexistente responde com a página de não encontrado e `noindex`, não com status 404 (o Next.js fixa o status quando o streaming começa).

Pendências para o mantenedor decidir ou priorizar:

- **Cache das fotos (V11):** o endereço assinado muda a cada resposta da API, então o otimizador do Next.js não reaproveita o cache entre visitas (cada visita reprocessa a foto). Na demo isso custa transformações da Vercel; dá para resolver na API (assinar com horário arredondado) ou servir as fotos publicadas por um domínio público do R2.
- **Deploy (V11):** preencher `STORAGE_ORIGIN` (origem do R2) e `SITE_URL` na Vercel.
- **Seletor de cidades:** o wireframe da home tem "Cidade ▾", mas a API não lista cidades; hoje a cidade é texto livre em Explorar.

### 2026-10-19 — N10: vitrine da API

Auditoria (antes de codar): a N8 já tinha deixado os índices da vitrine (`(status, starts_at)`, cidade e o trigram do título) e as colunas de crédito da foto; a API.md descrevia as três rotas e o `EventSummary`; o ARCHITECTURE previa o módulo `catalog` lendo as tabelas de `events`; nada disso tinha código. A N9 (PR #30) ainda não estava mergeada, e a vitrine precisa do endereço assinado da imagem, então a branch saiu da N9. Sem Docker, a integração rodou contra Postgres 16 e Redis locais (ajuste local no `infrastructure.ts`, não commitado).

Feito (API e `@vira/shared`; não mexe no web):

- `@vira/shared`: `listCatalogEventsQuerySchema` (`q` de 2 a 80 caracteres, `city`, `from`, `to`, `limit`, `cursor`, estrito), `eventSlugSchema`, `catalogEventSummarySchema`, `catalogEventListSchema`, `featuredEventsSchema`, `catalogEventDetailSchema`, `publicTicketTypeSchema`, `imageCreditSchema` e `SALES_STATUSES`.
- Módulo `catalog` (público, só leitura): domínio (`available`, `salesStatus`, `priceFromCents`, `isSoldOut`), casos de uso `ListCatalogEvents`, `GetFeaturedEvents` e `GetPublicEvent`, `PrismaCatalogRepository` (lê `events` e `ticket_types` direto, sem passar pelo módulo `events`), `CatalogPresenter` (endereço assinado da imagem, 1 h) e `CatalogController` (`GET /events`, `/events/featured`, `/events/{slug}`, todas `@Public()`).
- Testes: domínio (restantes, status de venda, preço a partir de, esgotado); casos de uso com repositório em memória (próxima página, página cheia no fim, destaques); e2e sem banco (busca curta, `limit` 51, data inválida, intervalo invertido, `status` e `organizerId` recusados, cursor forjado, de outra busca ou do painel do organizador, slug fora do formato); access policy das rotas novas; integração contra Postgres (só publicados e não encerrados, em andamento incluído, nenhum campo interno na resposta, **paginação estável com sete eventos no mesmo horário e um evento publicado no meio da leitura**, busca e cidade sem diferenciar maiúsculas e com `%`/`_` literais, `from`/`to`, cursor preso à busca, preço e esgotado, destaques excluindo esgotado, venda não aberta, venda encerrada, em andamento, rascunho e cancelado, página com restantes e status de cada tipo, crédito da foto e nome do organizador, cancelado sem o motivo, `404` para rascunho e slug desconhecido).

Decisões tomadas por conta própria:

- **A lista mostra só o que não terminou**, inclusive o que já começou; `from`/`to` filtram o início. Evento encerrado só pela página (o link continua valendo).
- **Evento cancelado mantém a página** com `status: "CANCELED"` e nada à venda, sem o motivo (que é para quem comprou). Nunca aparece nas listas.
- **Destaques = começam no futuro e têm algum tipo à venda agora** (janela aberta e ingresso restante). Em andamento não entra.
- **`available` exato.** A API.md falava em faixas "a critério do organizador", mas não há onde o organizador escolher; fica para o painel.
- **`priceFrom` só entre os tipos com ingresso restante**; sem nenhum, `null` e `soldOut: true`.
- **Busca só no título e cidade por igualdade** (sem acento-insensível: o banco não tem `unaccent`). O Prisma usa `ILIKE` em `contains` e em `equals` sem maiúsculas e não escapa `%` e `_`; o repositório escapa (o teste de integração pegou isso).
- **Imagem por endereço assinado (1 h)**, como no painel, em vez de um domínio público do R2: o bucket continua privado e nada muda no deploy.
- **Sem rate limit e com `no-store`**: em produção quem chama é o servidor do Next.js (um limite por IP o pegaria), e o cache fica no web (N11).
- **`venue.state` e `image.width`/`height` no resumo** (campos a mais, compatíveis): o card mostra "Cidade – UF" e o `next/image` precisa do tamanho.
- **Slug fora do formato é `400`**, como os ids malformados nas rotas do organizador.

Pendências para o mantenedor decidir ou priorizar:

- **Rate limit da vitrine:** se a API ficar exposta direto (sem o web na frente), um limite por IP generoso faz sentido; hoje não há.
- **Busca sem acento** ("forro" achar "Forró") pede a extensão `unaccent` numa migration; dá para incluir quando a busca do web existir.
- **Faixas de disponibilidade** ("últimos ingressos") a critério do organizador, junto com o painel (N12).

### 2026-10-18 — N9: upload da imagem do evento

Auditoria (antes de codar): a N8 deixou as colunas `image_key`/`image_alt` e a publicação exigindo imagem, mas nenhuma rota escrevia nelas; a API.md já descrevia `upload-url` e a confirmação; o DATA_MODEL previa `media_uploads`; o compose já tinha o SeaweedFS (ADR-0012), mas sem bucket nem CORS, e a API não lia as variáveis `S3_*`. Sem Docker, a integração rodou contra Postgres 16, Redis e o binário do SeaweedFS 4.48 locais (ajuste local no `infrastructure.ts`, não commitado).

Feito (API, `@vira/shared` e CI; não mexe no web):

- Config: `S3_ENDPOINT`, `S3_REGION` (padrão `auto`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, obrigatórias (em produção o endpoint exige `https`). O `.env.example` já vem com as do SeaweedFS.
- Plataforma: porta `ObjectStorage` com o adaptador `S3ObjectStorage` (`@aws-sdk/client-s3`, path-style, sem os checksums automáticos do SDK, que R2 e SeaweedFS recusam numa URL pré-assinada), `StorageModule` e `setUpBucket` (bucket e CORS só de `PUT` do `WEB_ORIGIN`), exposto como `pnpm --filter @vira/api storage:setup` e rodado pelo job "Local infrastructure" do CI.
- Migration `media_uploads` (enum `upload_status`; `CHECK`s de formato das chaves, tipo, tamanho até 5 MB e estado confirmado) e, em `events`, `image_width`, `image_height`, `image_blur_data_url` (`CHECK` de que andam com `image_key`) e o limite de 3–300 caracteres do `image_alt`.
- Módulo `events`: `RequestImageUpload` (URL de `PUT` de 5 min com tipo e tamanho assinados, 20 por hora por conta), `AttachEventImage` (confirmação: tamanho, magic bytes, decodificação, re-encode, troca da imagem com a linha do evento travada) e `SweepMediaUploads` com o `MediaSweeper` (a cada 10 min, no worker ou embutido); porta `ImageProcessor` com o adaptador `SharpImageProcessor` (`sharp`); `PrismaMediaUploadRepository`; `EventPresenter`, que põe o endereço assinado da imagem na resposta.
- `@vira/shared`: `requestImageUploadSchema`, `imageUploadSchema`, `attachEventImageRequestSchema`, `eventImageSchema` e as constantes da imagem; `OrganizerEvent.image` passou de `{ alt }` a `{ url, alt, width, height, blurDataUrl }`.
- Problema novo: `invalid-image` (422). `sharp` entrou na lista de SDKs que só `infra` pode importar.
- Testes: domínio e processamento com imagens geradas pelo `sharp` (magic bytes de JPEG/PNG/WebP contra texto, SVG, HTML, PDF e GIF; tipo trocado; arquivo truncado; abaixo de 1200 × 600; "pixel bomb" de 10 000 × 10 000; EXIF com GPS removido e orientação aplicada; redução a 2400 px; prévia de 16 px); casos de uso com armazenamento e repositórios em memória (upload alheio, de outro evento, usado duas vezes, arquivo que não chegou, tamanho diferente, prazo e tolerância, evento encerrado, limite por conta, varredura); e2e sem infraestrutura (`401`, `403` para BUYER, mass assignment com `key`, `bucket`, `url` e `width`, SVG, GIF, HTML, acima de 5 MB, `alt` vazio, `uploadId` malformado); integração contra Postgres e SeaweedFS reais (navegador → bucket → confirmação → publicação, imagem servida sem EXIF, armazenamento recusando outro tipo e outro tamanho, preflight CORS só da origem do web, PHP disfarçado de JPEG, imagem pequena, confirmação antes do envio, `404` entre organizadores, varredura e cada `CHECK` novo).

Decisões tomadas por conta própria:

- **Uma imagem só, sem variantes:** a confirmação guarda um WebP de até 2400 px no maior lado. Os recortes do DESIGN.md (3:2, 16:9, 4:3, 1:1) são `object-fit: cover`, e o `next/image` gera os tamanhos na entrega.
- **Mínimo de 1200 × 600 e máximo de 40 megapixels** na entrada: menor que isso a foto não enche o banner; maior, a decodificação é recusada antes de alocar memória.
- **Texto alternativo de 3 a 300 caracteres**, exigido na confirmação (não dá para ter imagem sem `alt` pela API).
- **Chave nova a cada confirmação** (`events/<eventId>/<uuid>.webp`): duas confirmações simultâneas do mesmo envio não escrevem uma sobre a outra, e a perdedora apaga só o que escreveu.
- **Confirmar antes de o arquivo chegar não gasta o envio** (`422`, tente de novo); um arquivo recusado gasta (é apagado e é preciso outra URL).
- **Tolerância de 15 min** depois de a URL vencer para confirmar: um `PUT` lento pode ter começado no fim do prazo.
- **Trocar a imagem vale também para evento publicado**; a anterior fica para a varredura, que apaga também as imagens de rascunhos excluídos (`event_id` vira `NULL`).
- **Imagem servida por URL assinada de `GET` (1 h)** na visão do organizador; o bucket continua privado. A vitrine (N10) decide se usa o mesmo ou um domínio público do R2.
- **Variáveis `S3_*` obrigatórias**, como as do banco e do Redis: a API não sobe sem o armazenamento.
- **Limite por conta (20 URLs/hora)** em vez de por IP: cada URL deixa a conta pôr 5 MB no bucket.

Pendências para o mantenedor decidir ou priorizar:

- **Painel (N12):** o CSP do web precisa liberar a origem do bucket em `connect-src` (o `PUT`) e `img-src` (a prévia); o envio é `fetch(url, { method: "PUT", body, headers })` com os `headers` da resposta.
- **Trocar só o texto alternativo** sem reenviar a imagem não tem rota; dá para incluir no `PATCH` do evento se o painel pedir.
- **Deploy (V11):** criar o bucket no R2, um token só com leitura e escrita nele, preencher as `S3_*` e rodar `storage:setup` com o `WEB_ORIGIN` de produção (aplica o CORS).
- **Readiness:** o `/health/ready` ainda não confere o armazenamento.

### 2026-10-17 — N8: eventos do organizador (API)

Auditoria (antes de codar): a API tinha só `auth`, `users`, `audit`, `outbox` e `health`; nenhuma tabela de eventos no Prisma. O DATA_MODEL já descrevia `events` e `ticket_types` (com a invariante de estoque), a API.md as rotas `/organizer/*`, o SECURITY_MODEL a dupla `markdown-it` + `sanitize-html` e o `audit-catalog` já tinha `event.published` e `event.canceled`. O pedido que chegou à thread falava em telas de vitrine, checkout e ingressos; como nada disso existe na API, a N8 seguiu o ROADMAP. Sem Docker, a integração rodou contra Postgres 16, Redis e Mailpit locais (ajuste local no `infrastructure.ts`, não commitado).

Feito (API e `@vira/shared`; não mexe no web):

- Migration `events` e `ticket_types` (enum `event_status`), com os `CHECK`s: estoque (`sold + reserved <= capacity`), preço de R$ 1,00 a R$ 100.000,00, `max_per_order` 1–20, janela de vendas ordenada, fim depois do início, local completo ou ausente, `image_alt` só com imagem, crédito obrigatório em foto de demonstração, evento publicado com local e imagem com `alt`, e datas que seguem o status. Índices da vitrine (N10) já criados, inclusive o trigram do título.
- `@vira/shared`: contratos dos eventos (`createEventRequestSchema`, `updateEventRequestSchema`, tipos de ingresso, listagem, `OrganizerEvent`, `Money`, UFs, `isKnownTimeZone`) e `slugify`, agora usado também pelo slug do organizador.
- Módulo `events`: domínio (`missingForPublication`, `editRefusal`, `eventSlug`), dez casos de uso, `SanitizedMarkdownRenderer`, `PrismaEventRepository` e dois controllers (`/organizer/events`, `/organizer/ticket-types`). O módulo `users` ganhou `public-api.ts` com `OrganizerProfiles`, por onde `events` descobre o perfil do chamador.
- Plataforma: `CursorCodec` (cursor opaco com HMAC, chave derivada do `CSRF_SECRET` por HKDF com rótulo próprio, preso a um escopo) e o tipo de problema `invalid-state-transition`.
- Testes: domínio; sanitização com 23 payloads XSS (o teste confere que só sobram as tags e atributos da allowlist, com `href` `https:`/`mailto:`); casos de uso com repositório em memória (todas as operações num evento alheio dão "não encontrado" e não mudam nada, completude, transições, capacidade, janela de vendas, paginação); contratos; e2e sem banco (`401`, `403` para BUYER em todas as rotas, mass assignment, ids e limites); access policy das rotas novas; integração contra Postgres (fluxo rascunho → publicar → cancelar com auditoria, `404` idêntico ao de id inexistente em todas as rotas de outro organizador, organizador sem perfil, HTML salvo sanitizado, capacidade e exclusão com vendas, rascunho excluído com os tipos, paginação estável com evento criado no meio, cursor adulterado ou de outra lista, e cada `CHECK` recusando o que a API nunca escreve).

Decisões tomadas por conta própria:

- **Conta sem perfil de organizador recebe `403`**, mesmo ADMIN: o papel deixa entrar na rota, mas não há eventos de quem gerenciar.
- **Rascunho pode ficar sem local**, e a descrição é opcional; o que falta só pesa ao publicar, e a resposta `409` lista os campos em `errors`.
- **Evento publicado continua obrigado a estar completo:** a mesma checagem da publicação roda em toda edição dele e na exclusão de tipos de ingresso.
- **Cancelar só evento publicado e não encerrado;** rascunho se exclui. **Motivo do cancelamento** ganhou coluna (`cancel_reason`), porque a API.md pedia `{ reason }` e não havia onde guardar; não vai para a auditoria (texto livre).
- **Slug refeito ao publicar**, a partir do título final, e fixo dali em diante.
- **Trava pessimista** (`SELECT ... FOR UPDATE` na linha do evento) em publicar, editar e mexer em tipos de ingresso, para a checagem e a escrita não se cruzarem com outra requisição.
- **Até 20 tipos de ingresso por evento** e janela de vendas terminando até o fim do evento.

Pendências para o mantenedor decidir ou priorizar:

- **Publicar depende da imagem**, que só chega com a N9: até lá, só testes (e o seed da N13) conseguem publicar.
- **`GET /organizer/events/{id}/sales`** fica para quando houver pedidos (todos os números seriam zero).
- **Ocultar tipo de ingresso com vendas** (o DATA_MODEL citava) fica para quando houver vendas.
- **Avisar compradores** de cancelamento ou mudança de data entra com os pedidos e o reembolso (Marco 2).

### 2026-10-14 — N7: telas de autenticação

Auditoria (antes de codar): o web tinha só a home, o 404 e `/dev/design-system`; o header só o logo; nenhum cliente da API. A API já tinha tudo o que as telas precisam (N3–N6) e o proxy `/api/v1/*` deixa os cookies first-party. Não existem ainda rotas de eventos, pedidos ou ingressos (N8 em diante), então a N7 ficou no que o ROADMAP pede: autenticação e conta.

Feito (só `apps/web`, sem mudança na API):

- **Cliente da API** (`src/lib/api`): `fetch` same-origin, Problem Details lidos para `ApiError` com o código do tipo e o `Retry-After`; refresh automático no `401` e **um refresh por vez** (as chamadas da aba dividem a mesma promessa, e as abas se revezam pela Web Locks API), como a detecção de reuso estrita da N4 exige; token CSRF buscado uma vez, enviado em `X-CSRF-Token` e buscado de novo uma vez quando a API recusa.
- **Sessão no navegador** (`src/lib/session`): `SessionProvider` pergunta a `GET /me` quem está logado. Para não chamar a API (e levar `401`) em toda visita anônima, existe um cookie-dica `vira_session` legível pela página: o `proxy.ts` o grava quando a requisição traz o cookie de acesso (cobre o login social, que chega por redirect), a página o grava depois do login e o apaga quando a API diz que não há sessão. Ele só decide se vale perguntar; quem responde é a API.
- **Páginas:** `/entrar` (e-mail e senha, botões de Google/GitHub, mensagens para `?erro=oauth-*`, `next` só com caminho do site), `/cadastro`, `/verificar-email`, `/esqueci-a-senha`, `/redefinir-senha`, `/confirmar-email` e `/conta` (nome, troca de e-mail, troca de senha, perfil de organizador, sessões com encerramento individual e "sair de todos" com confirmação). Header com "Entrar" ou avatar e menu ("Minha conta", "Sair").
- **Formulários** (`src/components/forms`): validação no blur e no envio, resumo de erros no topo com links para os campos, foco no primeiro inválido, erros da API (`breached-password`, `incorrect-password`) no campo certo.
- **Testes:** unitários (cliente: refresh único entre chamadas simultâneas, trava entre abas, CSRF e nova tentativa, sessão perdida, rotas de login sem refresh; erros e mensagens; validação; caminho de retorno seguro; token do fragmento usado uma vez; provedores sociais). E2E com Playwright + axe em desktop e mobile contra a API falsa ampliada (`e2e/fake-api.ts`, com cookies, CSRF e reuso estrito como a real): cadastro → confirmação → sair → entrar, volta ao `next`, sem redirecionamento aberto, erros de formulário, senha vazada, credenciais erradas, e-mail não confirmado, links expirados e incompletos, esqueci a senha completo, login social (sucesso e erro), **duas abas renovando a sessão ao mesmo tempo sem reuso detectado**, visita anônima sem nenhuma chamada à API, e toda a página de conta.
- Prints novos em `docs/assets/screenshots` (`web-login-*`, `web-sign-up-*`, `web-forgot-password-*`, `web-email-verified-*`, `web-account-*`); `scripts/screenshots.mjs` tira os das páginas logadas com `FAKE_API_URL`.

Decisões tomadas por conta própria:

- **Escopo pelo ROADMAP:** o pedido falava em vitrine, checkout, ingressos e painel do organizador, mas a API dessas partes ainda não existe (N8, N10, V1–V8). A N7 entrega autenticação e conta; as outras telas ficam nas entregas delas (N11, N12, V6, V7, V8).
- **Provedores sociais por variável do web** (`VIRA_OAUTH_PROVIDERS=google,github`): a API não tem rota que diga quais estão ligados, e um botão que leva a `404` seria pior do que nenhum. Sem a variável, não aparece botão.
- **Token dos links lido uma vez e tirado da barra de endereço** (`history.replaceState`), e enviado uma única vez mesmo com o `StrictMode` rodando o efeito duas vezes.
- **E-mail não confirmado no login:** a mensagem aponta "Esqueci minha senha", porque esse link também confirma o e-mail (N6) e o reenvio da verificação ainda exige sessão (pendência da N3).
- **Erro some ao corrigir, não no blur:** um erro que sumisse no blur puxava o botão de baixo do cursor e o clique se perdia (o E2E pegou isso). O erro aparece no blur e no envio e some quando o valor fica válido.
- **"Sair de todos"** usa modal de confirmação (ação destrutiva, DESIGN 3.5); encerrar uma sessão específica não pede.
- **Perfil de organizador entrou na conta** (`POST /me/organizer` + refresh para o papel novo), com o aviso honesto de que o painel de eventos ainda está em construção.

Pendências para o mantenedor decidir ou priorizar:

- **Configurar `VIRA_OAUTH_PROVIDERS`** no deploy do web (V11) junto com as credenciais da API.
- **Reenvio da verificação sem sessão** continua pendente (N3); hoje o caminho é "Esqueci minha senha".
- **Desvincular provedor social** e **excluir conta** (V9) ainda não têm tela.
- **Páginas `/privacidade` e `/termos`** não existem; o cadastro não linka nada por enquanto.

### 2026-10-15 — N6: redefinição de senha, conta e senhas vazadas

Auditoria (antes de codar): `verification_tokens` já tinha a finalidade `PASSWORD_RESET` (30 min) e `sessions` o motivo `PASSWORD_CHANGED`, ambos sem uso; o `audit-catalog` já previa `auth.password_changed` (`via: change|reset`); a API.md já descrevia `forgot`, `reset`, `GET/PATCH /me`, `POST /me/password` e `POST /me/organizer`; não existia `organizer_profiles` no Prisma nem módulo `users`; a redação do log já cobria `currentPassword` e `newPassword`. Sem Docker, a integração rodou contra Postgres 16, Redis e Mailpit locais (ajuste local no `infrastructure.ts`, não commitado).

Feito (API; a N6 não mexe no web):

- Migrations: `users.pending_email` e `verification_tokens.new_email` (finalidade nova `EMAIL_CHANGE`, `CHECK` de que só ela leva endereço) e a tabela `organizer_profiles` (`UNIQUE` por conta e por `slug`, `CHECK`s de nome e formato do `slug`).
- Config: `PWNED_PASSWORDS_ENABLED` (ligada por padrão, desligada nos testes) e `PWNED_PASSWORDS_URL`.
- Módulo `auth`: `RequestPasswordReset`, `ResetPassword`, `ChangePassword`, `RequestEmailChange`, `ConfirmEmailChange`, `CurrentPassword` (reautenticação com limite por conta), `NewPasswords` (HIBP antes do argon2id, também no cadastro), porta `BreachedPasswords` com o adaptador `PwnedPasswords`, e os envios do worker (`SendPasswordResetEmail`, `SendEmailChangeEmails`, `SendAccountNotices`). Rotas `POST /auth/password/forgot`, `/auth/password/reset`, `/auth/email/change/confirm`, `/me/password` e `/me/email`.
- Módulo `users` (novo): `GET/PATCH /me` e `POST /me/organizer` (`GetAccount`, `UpdateProfile`, `BecomeOrganizer`, `slug` derivado do nome).
- `@vira/shared`: contratos da conta (`account.ts`), todos estritos.
- Problemas novos: `breached-password`, `incorrect-password` (400), `conflict` (genérico), `password-not-set` e `already-organizer` (409).
- Auditoria: `auth.password_reset_requested`, `auth.email_change_requested`, `auth.email_changed`, `user.organizer_profile_created` (e `auth.password_changed` passou a ser usado).
- Testes: unitários (redefinição, troca de senha e de e-mail com repositórios em memória, inclusive link antigo, link de outro tipo, corrida por um e-mail tomado, limites por conta; adaptador do HIBP contra um servidor HTTP falso: só o prefixo enviado, padding, contagem 0 ignorada, erro, resposta grande e timeout aceitando a senha; `slug`; perfil e organizador), e2e sem infraestrutura (401 sem sessão em toda rota de `/me`, mass assignment em todas as rotas novas, validação antes de qualquer hash ou consulta, `breached-password`, rate limits) e integração com Postgres, Redis, Mailpit e um Pwned Passwords falso (respostas iguais para e-mail conhecido e desconhecido, reset revogando sessões, dois resets simultâneos, link expirado, senha vazada sem gastar o link, primeira senha de conta social, `PATCH /me` com papel, CSRF, troca de senha mantendo só a sessão atual, 429 na senha atual, troca de e-mail completa, e-mail de outra conta, organizador com refresh trazendo o papel novo e três `slug`s simultâneos).

Decisões tomadas por conta própria:

- **Troca de e-mail entrou** (não estava na API.md): `POST /me/email` com a senha atual, link no novo endereço (`/confirmar-email#token=`, 24 h) e aviso sem link no atual. O token guarda o endereço para onde foi, e a confirmação só vale se ele ainda for o pendente: um link de um pedido anterior não confirma o endereço de um pedido novo, mesmo numa corrida com o worker.
- **Troca para um e-mail de outra conta responde `202` igual** e avisa o dono do endereço, como no cadastro.
- **"Esqueci a senha" serve também para contas sem senha e não verificadas:** usar o link prova o e-mail. A conta social ganha a primeira senha assim (resolve a pendência da N5 de "definir senha numa conta só social"), e a não verificada fica verificada.
- **Senha vazada no reset não gasta o token**, para a pessoa tentar outra com o mesmo link.
- **HIBP falha aberta** (3 s de timeout, aviso no log sem o prefixo): uma queda de terceiro não pode impedir cadastro e recuperação de conta.
- **Senha atual errada é `400 incorrect-password`, não `401`**: a sessão continua válida, e um `401` faria o web achar que ela caiu.
- **Conta sem senha recebe `409 password-not-set`** em `/me/password` e `/me/email`.
- **Limites por conta:** 5 tentativas da senha atual a cada 15 min; 3 pedidos de troca de e-mail por hora; 3 links de redefinição por hora por endereço (silencioso, a resposta continua `202`).
- **Avisos por e-mail** de senha alterada (troca e reset) e de pedido de troca de e-mail: alguém que tomou a sessão não age sem o dono saber.
- **Reset limpa os cookies da resposta** (todas as sessões foram revogadas, inclusive a do navegador).
- **Tabela `users` dividida por coluna entre os módulos:** `auth` escreve as credenciais, `users` escreve `name` e `role` e é dono de `organizer_profiles`. Nenhum dos dois importa o outro; a ARCHITECTURE.md foi ajustada (antes dizia que `auth` passaria a depender de `users`).
- **`GET /me` ganhou `hasPassword`**, para o web saber se mostra "trocar senha" ou "criar senha".
- **Papel novo depois de `POST /me/organizer` vale no próximo refresh:** a rota não reemite cookies (isso é do `auth`); o web chama `POST /auth/refresh` em seguida.

Pendências para o mantenedor decidir ou priorizar:

- **Desvincular um provedor social** da conta não entrou (nenhuma rota pedia); fica para quando houver a tela de conta.
- **Reenvio da verificação** (`POST /auth/email/resend`) continua sem caminho para quem não tem sessão (pendência da N3).
- **Páginas do web (N7):** `/esqueci-a-senha`, `/redefinir-senha` e `/confirmar-email` (as duas últimas leem o token do fragmento) e a tela de conta; depois do organizador, chamar `POST /auth/refresh`.
- **Deploy (V11):** nada a configurar para o HIBP (ligado por padrão); o host `api.pwnedpasswords.com` precisa estar liberado na saída da API.

### 2026-10-14 — N5: login social (Google e GitHub)

Auditoria (antes de codar): a tabela `oauth_accounts` estava no DATA_MODEL mas não no Prisma; o `audit-catalog` já previa `method: google|github` em `auth.login_succeeded`; a coluna `password_hash` já aceitava `NULL` ("contas só OAuth"); a API.md previa `302` nas duas rotas e o SECURITY_MODEL pedia validação do ID token do Google e vínculo só com e-mail verificado. O web faz proxy de `/api/v1/*` com rewrite do Next, que repassa o `302` e os `Set-Cookie` sem segui-los. Sem Docker, a integração rodou contra Postgres 16, Redis e Mailpit locais (ajuste local no `infrastructure.ts`, não commitado).

Feito (API; a N5 não mexe no web):

- Migration `oauth_accounts` (enum `oauth_provider`, `UNIQUE(provider, provider_account_id)`, `CHECK` de 1–255 caracteres, `ON DELETE CASCADE`), sem coluna nenhuma para tokens.
- Config: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` e `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, opcionais e sempre em par; provedor sem credenciais fica desligado (`404`).
- Módulo `auth`: domínio (`OAuthAttempt`, PKCE S256, `isSafeReturnPath`, `newSocialUser`), casos de uso `BeginOAuthLogin` e `CompleteOAuthLogin`, portas `OAuthProvider` e `OAuthAccountRepository`, adaptadores `GoogleOAuthProvider` (OpenID Connect, ID token verificado com o JWKS) e `GitHubOAuthProvider` (REST, e-mail primário verificado), `OAuthController` (`GET /auth/oauth/{provider}` e `/callback`) e o cookie selado da tentativa.
- `@vira/shared`: `OAUTH_PROVIDERS` e `OAUTH_LOGIN_ERRORS` (os códigos de `?erro=` que a página `/entrar` vai explicar na N7).
- Auditoria: nova `auth.oauth_linked` (`{ provider, tookOverUnverified }`); `auth.login_failed` ganhou o motivo `provider_email_not_verified`.
- Testes: unitários (vetor do RFC 7636, caminhos de retorno, casos de uso com provedor roteirizado e repositórios em memória, inclusive a corrida pelo vínculo; cookie selado adulterado, de outra chave e expirado; adaptadores contra servidores HTTP falsos do Google e do GitHub: `alg: none`, HS256 com a chave pública, assinatura de outra chave, claims alterados, `kid` desconhecido, `iss`, `aud`, `azp`, `nonce`, `exp`, `iat`, código recusado, resposta grande demais ou ilegível), e2e sem infraestrutura (`404` sem credenciais, redirecionamento real para o Google, flags do cookie, callback sem cookie, `state` alheio, de outro provedor, adulterado ou expirado, `access_denied`, código recusado, `next` aberto, rate limit) e integração com um provedor falso que exige PKCE, `nonce` e código de uso único (conta nova, segundo login, conta existente verificada e não verificada, dois provedores numa conta, e-mail não garantido, dois primeiros logins simultâneos, código reapresentado, sessão anterior encerrada, nenhuma coluna de token).

Decisões tomadas por conta própria:

- **Branch `feat/auth-oauth`**, como no ROADMAP (o pedido falava em `feat/auth-social`).
- **Segredos da tentativa num cookie selado, não no Redis:** `__Secure-vira_oauth` com `state`, verificador PKCE, `nonce` e `next`, cifrado e autenticado com AES-256-GCM (chave derivada do `CSRF_SECRET` por HKDF, com rótulo próprio: a chave é outra sem uma variável nova), 10 min e gasto em toda callback. O servidor não guarda estado e o login não depende do Redis. Começou só assinado com HMAC; o CodeQL apontou o verificador em claro no cookie e passou a ser cifrado, para que nada fora do servidor (extensão, log de proxy) leia o verificador ou o `nonce`. `SameSite=Lax` basta: a volta do provedor é navegação GET de nível superior.
- **URL de retorno na origem do web** (`<WEB_ORIGIN>/api/v1/auth/oauth/{provider}/callback`), montada a partir do `WEB_ORIGIN`: o navegador só conhece o web, e os cookies da sessão saem first-party como no login por senha. Não precisou de variável nova.
- **Conta nova também exige e-mail garantido pelo provedor**, não só o vínculo com conta existente: senão alguém criaria a conta de um e-mail alheio e o dono não conseguiria se cadastrar.
- **Conta nunca verificada é assumida pelo dono do e-mail e perde a senha** (pré-cadastro: alguém cadastra o e-mail da vítima com senha própria e espera ela entrar pelo Google). O bloqueio e as falhas de login também zeram. Fica registrado em `auth.oauth_linked.tookOverUnverified` e em `auth.email_verified`.
- **Vínculo pelo id da conta no provedor, nunca mais pelo e-mail:** quem trocou o e-mail no Google continua entrando na mesma conta; a conta do Vira não muda de e-mail com isso.
- **GitHub: só o e-mail primário conta**, e só se verificado. Um secundário verificado é fácil de adicionar e diz menos sobre quem é dono da conta.
- **ID token do Google verificado de fato**, não só lido: a OIDC permite confiar no TLS quando o token vem direto do endpoint, mas o SECURITY_MODEL pedia a validação. JWKS em cache por 1 h; `kid` desconhecido força nova busca no máximo uma vez por minuto.
- **Sem retentativa nas chamadas aos provedores:** o código vale uma vez, então repetir a troca só falharia. Timeout de 5 s, resposta limitada a 64 kB, redirecionamentos recusados e toda resposta validada com Zod.
- **Login social ignora o bloqueio por senha:** o bloqueio protege contra adivinhação de senha, que não existe aqui.
- **`prompt=select_account` no Google**, para quem tem várias contas escolher em vez de entrar na última.
- **Callback de provedor desligado responde `404`** (igual a provedor desconhecido), em vez de redirecionar com erro.
- **Erros vão para `/entrar?erro=<código>`** (`oauth-denied`, `oauth-failed`, `oauth-email-not-verified`) e o motivo detalhado vai só para o log (sem código, `state` nem tokens).

Pendências para o mantenedor decidir ou priorizar:

- **Criar os apps OAuth de verdade** (Google Cloud e GitHub) e configurar as quatro variáveis no deploy (V11); a URL de retorno é a do web publicado.
- **A página `/entrar` (N7)** precisa dos botões "Entrar com Google/GitHub" (links para `/api/v1/auth/oauth/{provider}?next=...`) e de mensagens para os três códigos de erro.
- **Desvincular um provedor** (e definir senha numa conta só social) fica para a N6, junto com `/me` e a troca de senha.
- **`DELETE /me` com "reautenticação OAuth recente"** (API.md) vai precisar de um login social que marque a sessão como recente; hoje a sessão guarda `authenticated_at`, que serve para isso.

### 2026-10-13 — N4: sessões e CSRF

Auditoria (antes de codar): o `AccessGuard` lia `request.user`, mas nada o preenchia; não havia leitor de cookies na API (nem `cookie-parser`); o `audit-catalog` já previa `auth.refresh_reuse_detected` e `auth.logout_all`; o tipo `csrf-failed` já estava documentado na API.md, mas não existia no código; a CORS da API já aceitava o header `X-CSRF-Token`. Sem Docker local, a integração rodou contra Postgres 16, Redis e Mailpit instalados na sessão (com um ajuste local no `infrastructure.ts`, não commitado).

Feito (API; a N4 não mexe no web):

- Migration `sessions` (uma linha por refresh token, `family_id` por login; `CHECK`s de hash com 32 bytes, expiração dentro da absoluta, revogação sempre com motivo) e o enum `session_revoke_reason`.
- `platform/security`: `AccessTokens` (JWT HS256 sobre `node:crypto`), middleware que autentica por `Authorization: Bearer` ou pelo cookie `__Host-vira_at`, `CsrfTokens` (double-submit assinado) e `CsrfGuard`. `JWT_SECRET` e `CSRF_SECRET` obrigatórios, com 256 bits e diferentes entre si.
- Módulo `auth`: `StartSession`, `RefreshSession` (rotação e detecção de reuso), `EndSession` (logout, logout-all, uma sessão) e `ListSessions`; rotas `refresh`, `logout`, `logout-all`, `csrf`, `GET /auth/sessions` e `DELETE /auth/sessions/{id}`; login e verificação de e-mail passam a abrir a sessão.
- Auditoria: `auth.refresh_reuse_detected`, `auth.logout_all` e a nova `auth.session_revoked`.
- Testes: unitários (JWT com `alg: none`, outro algoritmo, assinatura trocada, papel adulterado, emissor e audiência; domínio da sessão; casos de uso com repositório em memória, inclusive a corrida pela rotação), e2e sem infraestrutura (cookie e Bearer, token inválido, CSRF ausente, diferente do cookie ou de outra sessão, origem estranha, `Sec-Fetch-Site`) e integração com Postgres e Redis reais (flags exatas dos cookies, só o hash no banco, rotação, reuso revogando a família com auditoria, dois refreshes simultâneos, expiração ociosa e absoluta, rate limit do refresh, CSRF, login de outra origem, logout, logout-all, lista e revogação de sessões, `CHECK`s).

Decisões tomadas por conta própria:

- **JWT escrito sobre `node:crypto`, sem biblioteca:** a superfície aceita é exatamente um cabeçalho (`{"alg":"HS256","typ":"JWT"}`, comparado byte a byte), então não há negociação de algoritmo. `iss: vira-api`, `aud: vira`, 30 s de tolerância só para `iat` no futuro.
- **O id da sessão (`sid`) é o `family_id`:** não muda nos refreshes, então o token CSRF continua valendo depois de um refresh e a lista de sessões mostra um item por login.
- **Token CSRF só nas rotas com papel acessadas pelo cookie** (as que agem com a sessão). Rotas públicas (login, cadastro, verificação, refresh) e chamadas com `Bearer` não pedem token; todas as requisições que alteram dados passam pela checagem de origem. Isso detalha o ADR-0005 ("em métodos inseguros") sem mudar a decisão; a regra está na API.md.
- **Origem:** com `Origin`, ele precisa ser exatamente o `WEB_ORIGIN`; sem `Origin`, `Sec-Fetch-Site` precisa ser `same-origin` (ou `none`); sem nenhum dos dois, é um cliente que não é navegador e passa. `same-site` é recusado (um subdomínio pode ser de outra pessoa).
- **`GET /auth/csrf` aceita a sessão do cookie de refresh** quando o de acesso expirou (a rota está dentro do `Path` do refresh). Sem sessão nenhuma: `401`, porque um token sem sessão não protege nada.
- **Reuso estrito:** perder a corrida pela rotação (dois refreshes simultâneos com o mesmo token) também revoga a família. Uma janela de tolerância deixaria um ladrão que rotacionou primeiro com a sessão viva. O web (N7) precisa serializar o refresh.
- **Cookie CSRF `HttpOnly`:** a página recebe o token no corpo de `GET /auth/csrf`, então o cookie não precisa ser lido por JavaScript. Ele dura a sessão do navegador e é apagado a cada login.
- **Um novo login encerra a sessão cujo refresh token o navegador ainda tinha** (os cookies novos a sobrescrevem, e ela ficaria órfã até expirar).
- **Lista e revogação de sessões (`/auth/sessions`)** entraram além do roadmap, a pedido do planejamento da N4. Mostram só datas: guardar `User-Agent` ou IP seria dado pessoal a mais.
- **`revokedSessions` em `auth.refresh_reuse_detected` conta tokens** da família revogados; em `auth.logout_all`, conta logins ativos.
- **`Max-Age` dos cookies arredondado para cima:** o JWT expira em segundos inteiros, e o truncamento dava 599 s.

Pendências para o mantenedor decidir ou priorizar:

- **Limpeza das sessões expiradas** (DATA_MODEL: diária, as expiradas há mais de 30 dias) ainda não tem job.
- **Revogar sessões ao trocar ou redefinir a senha** fica para a N6, que cria essas rotas.
- **O web precisa** chamar `GET /auth/csrf` depois do login, mandar `X-CSRF-Token` e fazer um refresh por vez (N7).

### 2026-10-11 — N3: cadastro e login por senha

Auditoria (antes de codar): não existia nenhum consumidor de fila (só o despachante da outbox), então o e-mail precisava de um; o `@nestjs/throttler` do desenho original não faz limite por conta (que depende do corpo); o `SMTP_URL` estava só comentado no `.env.example`; o `audit-catalog` já previa `auth.login_succeeded` e `auth.login_failed` (inclusive sem entidade, para e-mail desconhecido). Sem Docker local, o SQL da migration foi validado num Postgres em processo (PGlite) e a integração foi conferida só no CI.

Feito (API; a N3 não mexe no web):

- Migration `users` (`citext`, `CHECK`s de e-mail normalizado, tamanho e formato, nome de 1–120 sem espaços nas pontas, hash só argon2id, contador não negativo) e `verification_tokens` (hash SHA-256 de 32 bytes `UNIQUE`, validade depois da criação).
- `@vira/shared`: schemas Zod estritos de cadastro, verificação e login; senha de 8–128 caracteres.
- `platform/rate-limit`: limitador de janela fixa em Redis, guard por IP (`@RateLimit`) que roda antes da validação do corpo, `RateLimit-*` e `Retry-After`. `platform/mail`: porta `Mailer` com adaptador SMTP (nodemailer). `platform/queue`: `JobHandlerRegistry` e `QueueConsumers` (um worker BullMQ por fila com handlers).
- Módulo `auth` em camadas: `RegisterUser`, `VerifyEmail`, `LoginUser`, `SendVerificationEmail`, `SendAccountExistsNotice`; repositórios Prisma; hasher argon2id (19 MiB, t=2, p=1) com hash fictício; `AuthController` com as três rotas `@Public()`; módulos separados para a API e para o worker.
- Auditoria: `auth.registered`, `auth.email_verified`, `auth.account_locked` (novas), `auth.login_succeeded` e `auth.login_failed`.
- Testes: unitários (domínio; casos de uso com repositórios em memória; limitador; SMTP contra um servidor SMTP real; hasher), e2e sem infraestrutura (senha gigante → 400 sem hash, `role` no corpo → 400, limites por IP antes da validação, rotas públicas, quem consome a fila) e integração com Postgres, Redis e Mailpit reais (cadastro novo e conhecido idênticos, e-mail lido pela API do Mailpit, token de uso único com 6 pedidos simultâneos, expirado, só o hash no banco e nada na outbox, login indistinguível e com o mesmo custo, bloqueio e desbloqueio, todos os rate limits, auditoria sem dado pessoal, `CHECK`s).

Decisões tomadas por conta própria:

- **Login só valida (200 `{ user }`), sem cookies nem sessão:** isso é da N4. A verificação de e-mail também responde só `200 { user }` (a API.md previa cookies, que entram com a N4).
- **Um módulo `auth`** é dono de `users` e `verification_tokens` por ora; o `users` se separa na N6 (`/me`).
- **Conta bloqueada responde `401 invalid-credentials`**, igual a e-mail inexistente (um `account-locked` mostraria que a conta existe). Mesmo com a senha certa durante o bloqueio, e sem comparar a senha com o hash real.
- **Bloqueio:** a 5ª falha seguida bloqueia 1 min, cada falha seguinte dobra, máximo 1 h; tentativas durante o bloqueio não contam (senão dá para prolongá-lo de fora) e o contador só zera no login com sucesso (sem decaimento no tempo).
- **Cadastro faz o hash antes de consultar o e-mail**, para o tempo não revelar se ele existe. O login faz uma verificação argon2id em todos os caminhos; o hasher recebe `null` e verifica contra um hash fictício.
- **O token de verificação é criado pelo consumidor da fila `email`** (a outbox leva só o `userId`). A entrega é pelo menos uma vez; um reenvio apaga os tokens antigos não usados, então só o último link vale. O link usa o **fragmento** (`/verificar-email#token=...`), que não chega a logs nem a `Referer`; a página (N7) o lê no navegador. As rotas `/verificar-email` e `/entrar` ainda não existem no web.
- **Limitador próprio em vez do `@nestjs/throttler`**, porque o limite por conta precisa do corpo. Com **Redis fora, o limitador deixa passar** e registra um aviso (o bloqueio por conta no banco é a barreira que sobra). As chaves do Redis guardam só o hash do IP ou do e-mail.
- **`RedisService.ensureReady()`:** a conexão é preguiçosa e, com `enableOfflineQueue: false`, comandos não esperam a conexão; requisições simultâneas logo depois do boot falhavam e o limitador as deixava passar. Agora os chamadores compartilham uma tentativa de conexão e esperam o `ready` (o limitador e a checagem de prontidão usam isso). O CI não pegaria isso: apareceu na revisão do código.
- **`JobHandlerRegistry` + `QueueConsumers`:** a fila `email` vai ser compartilhada (e-mails de ingresso, V5), então cada módulo registra handlers por tipo e o worker da fila encaminha. Job sem handler falha de forma visível. No encerramento cada worker tem 10 s: sem Redis, o BullMQ nunca termina de fechar.
- **`INSERT ... ON CONFLICT DO NOTHING`** (`createMany` com `skipDuplicates`) no lugar de capturar o erro do Prisma: e-mail já usado, inclusive por um pedido simultâneo, vira contagem 0 e não uma transação abortada. O token é reivindicado por um `UPDATE` condicional.
- **`@node-rs/argon2`** (binários prontos, sem compilar nada): o `crypto.argon2` do Node só existe a partir da 24.7 e o projeto fixa a 22. Ele declara um `const enum`, então o algoritmo fica no padrão da biblioteca (argon2id) e um teste confere o prefixo `$argon2id$v=19$m=19456,t=2,p=1$`.
- **`login` aceita senha de 1 a 128 caracteres** (a política de 8–128 vale para senhas novas): uma falha de login não deve revelar a política. Corpo com senha acima de 128 → 400 antes de qualquer hash.
- **E-mails em texto puro, em português**, sem HTML (nada a escapar). `SMTP_URL` passa a ser obrigatório; em produção exige `smtps://` ou `requireTLS=true` e `MAIL_FROM` explícito.
- **Auditoria:** em `auth.login_failed` o ator é o sistema (a pessoa ainda não provou quem é) e a entidade é a conta, quando existe. O registro é gravado logo depois da operação, não na mesma transação.
- **Novo tipo de problema `token-expired` (410)**; o mapa de status para tipo passou a manter o primeiro tipo de cada status, para um 401 ou 403 genérico continuar `unauthenticated`/`forbidden`.
- Fakes dos testes unitários ficam em `*.fakes.ts` (fora do build); o Mailpit entrou no harness de Testcontainers (`startInfrastructure({ mail: true })`).

Pendências para o mantenedor decidir ou priorizar:

- **HIBP (senhas vazadas)** ficou fora desta entrega, como combinado. Sugestão: entra com a N6, que também define senhas, e vale no cadastro.
- **Quem perdeu o e-mail de verificação não tem como pedir outro:** `POST /auth/email/resend` exige sessão (API.md) e sem e-mail verificado não há sessão; cadastrar de novo só manda o aviso "você já tem conta". Opções: mandar um link novo no lugar do aviso quando a conta existe e não foi verificada (sem risco de enumeração, o conteúdo só aparece na caixa do dono) ou abrir o reenvio por e-mail com rate limit.
- **O aviso "você já tem conta" pode ser usado para encher a caixa de alguém** (5/h por IP, sem limite por destinatário). Um limite silencioso por e-mail resolveria.
- A contagem de falhas não decai; o bloqueio pode ser provocado por terceiros por até 1 h (ver SECURITY_MODEL, "Limites conhecidos do login por senha").
- As páginas `/verificar-email` e `/entrar` (N7) precisam existir para os links dos e-mails funcionarem.

### 2026-10-10 — N2: componentes base

Auditoria (antes de codar): a documentação do Next.js 16 diz que Turbopack e webpack já transpilam pacotes do workspace (então nada de `transpilePackages`), o Tailwind 4 não varre pacotes do workspace (precisa de `@source`) e a CSP de produção (`style-src` só com nonce) afeta o Radix de duas formas: ele grava atributos `style` no HTML do servidor e injeta um `<style>` para travar a rolagem do modal. As duas coisas aparecem no navegador (violação de CSP e rolagem que não trava), e o teste que as pegou foi uma sonda com Playwright contra o build de produção.

Feito:

- `@vira/ui` agora exporta componentes (`src/index.ts`): Button e IconButton, Tooltip, Spinner, Skeleton, Badge, Alert, Input (texto, e-mail, telefone, data e hora nativos), PasswordInput, SearchInput, Textarea, Select, Checkbox, RadioGroup/Radio, QuantityStepper, Modal (bottom sheet no celular), DropdownMenu, Toast (`ToastProvider` e `useToast`), EmptyState, Header e Footer, mais `CspNonce`.
- Radix para Dialog, DropdownMenu, Select, Toast, Tooltip e Slot; ícones Lucide com traço 1,75 num único `Icon`; sem `tailwind-merge` (ver decisões); nenhum valor arbitrário nem `style` inline (a regra de lint passa).
- O web consome o pacote (`@source` no `globals.css`); o `EmptyState` saiu do web para o pacote; header e footer do web usam `Header`/`Footer` do pacote, mas continuam com o conteúdo de hoje (só o logo; o texto de modo de teste). As páginas 404 e de erro usam o `Button`.
- `/dev/design-system` mostra cada componente em todos os estados (hover, foco e pressionado desenhados com os mesmos tokens; os componentes seguem interativos).
- Testes: 250+ unitários no `@vira/ui` (variantes, estados, teclado, ARIA: `aria-busy` no botão, `aria-invalid`/`aria-describedby` nos campos, foco preso e `Esc` no modal, `aria-live` no stepper e no toast) e um E2E por bloco da página com axe, mais um com cada camada aberta (modal, menu, select, tooltip, toast), em desktop e mobile. Outros testes de navegador: nenhuma violação de CSP ao abrir todas as camadas, HTML do servidor sem `style`, rolagem travada e foco preso no modal, bottom sheet no celular, select abrindo acima do modal.
- Prints novos de modal e menu em `docs/assets/screenshots/` (desktop e mobile); o script `pnpm --filter @vira/web screenshots` agora tira os dois.

Decisões tomadas por conta própria:

- **Checkbox e radio nativos em vez de Radix.** O Radix escreve inputs "bolha" com `style` inline no HTML do servidor; a CSP bloqueia e os controles nativos ficam visíveis até hidratar. Nativo mantém teclado, formulário e leitor de tela do navegador e funciona sem JavaScript. O grupo de radio é `fieldset role="radiogroup"` com `legend`.
- **Select:** botão estático no servidor, Radix depois de montar. **Toast:** a região de notificações só nasce no navegador.
- **`CspNonce` + `get-nonce`:** o `react-remove-scroll` (usado pelo Radix) injeta um `<style>`; o layout entrega o nonce da requisição ao pacote, que o repassa ao `react-remove-scroll` e ao viewport do Select. `get-nonce` entrou como dependência direta do `@vira/ui` (já era transitiva).
- **`z-dropdown` de 20 para 45** (acima do modal, abaixo do toast): senão um select aberto dentro de um modal ficava escondido atrás dele. Documentado no DESIGN 2.7.
- **Tokens novos pedidos pelo DESIGN.md:** `duration-pulse` (1,2 s do skeleton), `delay-skeleton` (150 ms), larguras do modal (`max-w-dialog`/`dialog-wide`, 480/640 px) e as animações das camadas; mais dois utilitários que leem as variáveis do Radix (`min-w-menu-trigger`, `max-h-menu-available`) para não precisar de valor arbitrário.
- **Sem `tailwind-merge`:** ele confunde `text-label` (tamanho) com `text-ink` (cor), pois ambos são tokens. Aparência e caixa são `cva`s separados com classes que não se sobrepõem.
- **Stepper de quantidade:** nos limites o botão fica `aria-disabled`, não `disabled`, para o foco do teclado não se perder.
- **Tooltip** entrou (não estava na lista da N2) porque o DESIGN 3.1 manda todo botão só com ícone ter um.
- **O header do web ficou `sticky`, com a borda inferior só depois de rolar**, como diz o DESIGN 3.11 (antes tinha borda fixa). O estado vazio ganhou o respiro de 64 px do DESIGN 3.9 e passou a ser `h3` por padrão (`h2` nas páginas 404 e de erro, que têm `h1` oculto).
- **Pendente de propósito:** menus com mais de 6 itens virarem bottom sheet no celular (DESIGN 3.6). Nenhum menu do MVP chega a isso; entra com o primeiro que precisar. Registrado no ROADMAP.

Sobre o processo: o commit `fix(ui): give the select viewport style the CSP nonce` levou junto, por um `git add -A`, os arquivos da página `/dev/design-system` (`feat(web)`). Não reescrevi o histórico (regra: sem amend automático); a mensagem do commit descreve só o conserto do Select.

### 2026-10-10 — N1: fundação visual

Feito:

- `packages/ui` (`@vira/ui`): `tokens.css` (fonte única dos valores) e `theme.css` (o `@theme` do Tailwind, os utilitários de movimento e de camada e os estilos de base), importados pelo `globals.css` do web logo depois do Tailwind.
- Tokens que faltavam no DESIGN.md: `scrim`, `info`/`info-bg`, larguras de layout (`max-w-page`, `max-w-event`, `max-w-checkout`, `max-w-reading`, `max-w-empty-state`), camadas (`z-sticky` ... `z-toast`), `duration-slow`, `ease-exit`, `price`/`price-lg` e os tamanhos de mobile `h1-sm`/`h2-sm`.
- Testes no `@vira/ui`: contraste AA recalculado de `tokens.css` (agora com `info`) e coerência do tema (nenhuma referência a token inexistente, todo token exposto, nenhuma cor literal no tema).
- Regra de lint `vira/no-arbitrary-tailwind` em `@vira/config`, ligada para todo `.tsx`/`.jsx`: rejeita `bg-[#fff]`, `p-[13px]`, `h-(--x)` e propriedades arbitrárias em `className` e em `cn`/`clsx`/`cva`; variantes arbitrárias (`data-[state=open]:`) continuam valendo. Os valores arbitrários do web (`max-w-[1200px]`, `max-w-[68ch]`, `max-w-[420px]`, `scale-[0.98]`) viraram tokens.
- Rota `/dev/design-system` com cores, estados, escala tipográfica, espaçamento, raios, sombra, movimento e camadas; `noindex`; em produção só com `VIRA_DESIGN_SYSTEM=true` e nunca na Vercel. Teste unitário garante que toda cor de `tokens.css` aparece na página; E2E confere que nenhuma amostra fica transparente e roda o axe.

Corrigido de passagem: o logo usava `text-2xl`, que não existe no tema (a escala do Tailwind é zerada), então saía com 16 px. Agora usa o token `logo` (24/32, peso 800), e os prints foram refeitos.

Decisões tomadas por conta própria:

- Inter continua via `@fontsource-variable/inter` (decisão da F7); o critério da N1 no ROADMAP foi atualizado.
- `@vira/ui` exporta os arquivos CSS direto de `src/` (sem build): CSS não precisa de compilação, e os componentes da N2 entram no mesmo pacote.
- A página do design system lista os tokens com classes do Tailwind escritas por extenso, sem `style` inline (a CSP de produção bloqueia estilos inline).
- Token novo `logo` para a marca no header, documentado no DESIGN.md.

### 2026-10-09 — F7: esqueleto do web

Auditoria (antes de codar): `apps/web` vazio; `packages/ui` ainda não existe (é a entrega N1); o briefing proíbe eventos, preços, depoimentos e funcionalidades inventados; o Next.js 16 mudou convenções (`middleware` virou `proxy`) e traz a documentação do próprio pacote, que foi a fonte usada.

Plano (commits pequenos): tokens e estilos base → cabeçalhos e CSP com nonce → proxy de `/api/v1` → layout e home com estado vazio → testes unitários e E2E com axe → CI e docs.

Feito:

- `apps/web`: Next.js 16 (App Router) + Tailwind 4, Inter variável auto-hospedada, tokens do DESIGN.md em `tokens.css` mapeados no tema do Tailwind; foco visível, `prefers-reduced-motion`, link "Pular para o conteúdo", `lang="pt-BR"`.
- Home: título "Encontre seu próximo evento.", uma frase e o estado vazio "Nenhum evento por aqui ainda". Sem busca, sem navegação e sem eventos inventados (nada disso existe ainda). 404 e página de erro com o mesmo cuidado.
- `proxy.ts`: CSP estrita com nonce por requisição (`strict-dynamic`, sem `unsafe-inline`/`unsafe-eval` em produção); demais cabeçalhos via `next.config.ts`; `/api/v1/*` encaminhado para a API na mesma origem.
- Testes: 48 unitários (CSP, origem da API, config, contraste AA recalculado dos tokens) e 24 E2E (12 × desktop e mobile): axe sem violações A/AA, nonce diferente a cada requisição e em todos os scripts, nenhuma violação de CSP no navegador, proxy, teclado, alvos de 44 px, reflow a 320 px.
- CI: job de E2E (Playwright + axe); Turborepo passa a considerar `API_ORIGIN` e `VERCEL` no cache de build.

Decisões tomadas por conta própria:

- Tokens dentro do web até a N1 (o `packages/ui` é dela), com teste de contraste desde já.
- `@fontsource-variable/inter` em vez de `next/font/google`: sem requisição ao Google no build nem em execução (LGPD) e build offline.
- Todas as páginas dinâmicas (nonce por requisição), abrindo mão de cache estático e PPR; é o custo de uma CSP estrita.
- `API_ORIGIN` lido no build; obrigatório e https quando `VERCEL` está definido; `http` só para loopback.
- Sem navegação e sem busca no header/home: só existem quando as páginas e a API que as sustentam existirem.
- `eslint-plugin-jsx-a11y` não entrou (ainda não suporta ESLint 10); a acessibilidade é verificada pelo axe no E2E.
- CodeQL do #13 achou dois problemas reais, corrigidos: regex para ler HTML no teste E2E (trocada por `DOMParser`) e actions de terceiros presas a tag mutável (`pnpm/action-setup` e `gitleaks-action` agora fixadas no SHA do commit).
- `AGENTS.md` do Next.js (`node_modules/next/AGENTS.md`) manda ler a documentação do pacote antes de codar: lida (CSP, proxy, rewrites).

### 2026-10-09 — F6: worker, filas e outbox

Feito:

- `outbox_messages` (migration SQL com `CHECK`s) e módulo `outbox` em camadas: catálogo de tipos (payload só com ids, fila de destino), mensagem imutável, política de retry/backoff como funções puras e `recordAttempt`.
- `Outbox.publish(evento, tx)` grava na mesma transação da mudança de estado (`TransactionRunner` na plataforma); `DispatchOutbox` com `FOR UPDATE SKIP LOCKED`, `PurgeOutbox`, publicador BullMQ (id da mensagem = id do job) e `OutboxPoller` sem sobreposição.
- Worker: `main.worker.ts`, `WorkerModule`, scripts `dev:worker` e `start:worker`; `WORKER_MODE=embedded|separate` e `OUTBOX_POLL_INTERVAL_MS`.
- Testes unitários (domínio, casos de uso, poller com timers falsos) e de integração (Postgres e Redis reais: exatamente uma vez, rollback, despachantes concorrentes, backoff, mensagens paradas, purga, CHECKs, consumidor BullMQ, modos embedded/separate e o worker real).

Decisões tomadas por conta própria:

- Poller em processo no lugar do job repetível do BullMQ (a outbox não depende do Redis para ser lida); dispensei o gatilho pós-commit.
- Máximo de 10 tentativas, backoff de 5 s a 15 min; mensagens esgotadas ficam paradas para inspeção.
- Índice composto em vez de parcial (o Prisma não expressa índices parciais).
- Catálogo de tipos já traz `orders.paid`, `tickets.issued` e `orders.refund_requested`, com roteamento inicial para as filas `tickets`, `email` e `payments`.

### 2026-10-08 — F5: módulo de auditoria

Feito:

- Tabela `audit_logs` (migration SQL): `CHECK` de formato da ação, de papel (`SYSTEM`/`BUYER`/`ORGANIZER`/`ADMIN`) e de par ator/papel, `metadata` sempre objeto; triggers que rejeitam `UPDATE`, `DELETE` e `TRUNCATE` para qualquer papel; `REVOKE` de `PUBLIC`.
- Módulo `audit` em camadas: catálogo de ações (`domain/audit-catalog.ts`) com tipo de entidade e schema estrito de `metadata` por ação; `buildAuditEntry` imutável; caso de uso `AuditLog.record()` atrás da porta `AuditLogRepository`; adaptador Prisma; `public-api.ts`.
- `platform/runtime`: portas `Clock` e `IdGenerator` (UUID v7).
- Testes: domínio (catálogo, rejeição de chaves e formatos sem ecoar valores, nenhuma chave de dado pessoal no catálogo), caso de uso com repositório em memória e integração contra Postgres real provando o append-only e os `CHECK`s.

Decisões tomadas por conta própria:

- O catálogo já declara as ações previstas no DATA_MODEL para os próximos marcos (auth, pedidos, pagamentos, check-in, LGPD), cada uma com o menor `metadata` útil e sem dado pessoal; os módulos que as usarem podem ajustar o schema no próprio PR.
- O trigger é a proteção principal (vale até para o dono da tabela); o `GRANT` só de `INSERT`/`SELECT` ao papel da aplicação fica para o deploy (V11), quando houver papéis separados.
- `entity_id` como `uuid` (todos os ids do modelo são UUID v7); ids gerados com o pacote `uuid` porque o Node 22 não tem `crypto.randomUUIDv7`.
- O endpoint `GET /admin/audit-logs` (API.md) fica para quando existir autenticação de ADMIN.
- O `prisma migrate diff` precisa de um `DATABASE_URL` (mesmo fictício) para gerar SQL; sem ele o CLI não mostra erro nenhum.

### 2026-10-08 — F4: banco e infraestrutura local

Feito:

- `docker-compose.yml` com Postgres 16.15, Redis 8.8, SeaweedFS 4.48 (S3) e Mailpit 1.31, portas só em `127.0.0.1`, healthchecks, `pnpm infra:up`/`infra:down`.
- Prisma 7.10 com o generator `prisma-client` (ESM) e driver adapter `pg`; `prisma.config.ts`; primeira migration habilita `citext` e `pg_trgm`; client gerado fora do Git pela tarefa `db:generate` do Turborepo.
- `PrismaService` (conexão preguiçosa, `statement_timeout` e timeout de conexão de 5 s) e `RedisService` (ioredis 6, sem fila offline).
- Readiness agora verifica banco e Redis de verdade.
- Config: `DATABASE_URL` e `REDIS_URL` obrigatórios; em produção, TLS obrigatório (`sslmode=require` e `rediss://`).
- Testcontainers: harness em `test/support/infrastructure.ts` (aplica as migrations) e suíte de integração (extensões, timeout, readiness up/down).
- CI: job novo sobe o `docker compose` e aplica as migrations nele.

Decisões tomadas por conta própria:

- **SeaweedFS no lugar do MinIO** no ambiente local: a imagem `minio/minio` saiu do Docker Hub. Registrado no [ADR-0012](docs/adr/0012-armazenamento-local-seaweedfs.md), que substitui essa parte do ADR-0011.
- **Prisma 7.10.0**, não a tag `latest` do CLI (que aponta para uma `8.0.0-rc`).
- TLS obrigatório em produção para banco e Redis (ASVS V12) validado na configuração.
- Testes de integração são pulados localmente sem Docker e falham no CI sem Docker.
- Allowlist do gitleaks só para os dois valores exatos de credenciais locais.
- Lição registrada nas regras: ao mergear o #2 apaguei a branch base do #8 antes de mudar a base, e o GitHub fechou o #8; recriei a branch, reabri e mudei a base.

### 2026-10-08 — F3: esqueleto da API

Feito:

- `apps/api`: NestJS 12 (ESM) com `AppModule.register({ config })`, prefixo `/api/v1`, `run()` que recusa subir com env inválida.
- `platform/config`: env validada com Zod no boot; erros citam variável e regra, nunca o valor.
- `platform/logging`: pino com `requestId` no topo de toda linha, redação de dados pessoais e credenciais em qualquer profundidade, sem headers, corpo, query string ou IP.
- `platform/errors`: RFC 9457 para tudo (inclusive body-parser e rotas inexistentes); 500 genérico sem detalhes internos; validação Zod lista os campos inválidos.
- `platform/security`: `@Public()`/`@RequireRole()` e guard "negar por padrão" (papéis cumulativos).
- `platform/http`: Helmet (CSP `default-src 'none'` na API, CSP própria para `/docs`), `Cache-Control: no-store`, CORS só para `WEB_ORIGIN`, limite de 100 kB.
- `platform/openapi`: `/docs` e `/docs/json` gerados dos schemas Zod (Standard Schema).
- `modules/health`: `/health/live` e `/health/ready` (checks plugáveis com timeout; banco e Redis no F4).
- `packages/shared`: schemas de problem details e saúde, hierarquia de papéis.
- `dependency-cruiser`: camadas, acesso entre módulos só por `public-api.ts`/`*.module.ts`, `platform` sem módulos, sem ciclos; provado com fixtures.
- 65 testes no monorepo (44 na API), smoke test do build real (`node dist/main.js`).

Decisões tomadas por conta própria:

- **NestJS 12** (ESM). Usei o suporte nativo a Standard Schema (`@Body({ schema })`, `StandardSchemaValidationPipe`, `@ApiResponse({ standardSchema })`) em vez do `nestjs-zod`, que ainda não suporta o Nest 12.
- **Sem SWC:** os testes usam o transformador Oxc do Vite 8 com `emitDecoratorMetadata`. O binário nativo do SWC não funciona nesta máquina (verificação de permissão do cache) e o Oxc evita a dependência nativa.
- Config própria (`ConfigModule.forRoot(config)`) em vez de `@nestjs/config`: o env é lido uma vez, antes do Nest, e o container nunca lê `process.env`.
- `requestId` de entrada aceito só com 8–64 caracteres `[A-Za-z0-9_-]`; caso contrário um UUID novo.
- Novos tipos de problema documentados: `payload-too-large` (413) e `unsupported-media-type` (415); 4xx sem tipo próprio usam `about:blank`.
- `application` pode importar `@nestjs/common` (injeção de dependência); confirmado na regra do ESLint.

### 2026-10-07 — F2: ferramentas do workspace

Feito:

- Turborepo (`turbo.json`) com as tarefas `build`, `typecheck`, `lint` e `test`; scripts na raiz e `pnpm check` reproduzindo o CI.
- `packages/config` (`@vira/config`): tsconfig estrito (`base`, `library`), ESLint flat config (typescript-eslint strict type-checked + regras de fronteira), Prettier e preset do Vitest.
- Regras de fronteira testadas (16 testes): apps não importam apps, pacotes não importam apps, `domain` sem framework nem SDK de infraestrutura, `application` e `http` sem SDK de infraestrutura.
- CI: job único com format, Markdown, lint, typecheck, test e build, com cache do Turborepo; CodeQL analisando `javascript-typescript`.
- Pre-commit: Prettier nos arquivos em stage.
- `AGENTS.md` (bloco gerenciado pelo Turborepo, orienta agentes de IA a ler a documentação da versão instalada) entrou junto no commit do Prettier; mantido de propósito.
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
