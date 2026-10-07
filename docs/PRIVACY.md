# Privacidade e proteção de dados (LGPD)

A Lei Geral de Proteção de Dados (Lei nº 13.709/2018) é tratada como **requisito de produto**, não como apêndice. Este documento é a referência técnica; a política de privacidade exibida no app (`/privacidade`) é a versão em linguagem simples para quem usa.

> O Vira é um projeto open source de portfólio. A demo pública usa pagamentos em modo de teste. Quem fizer deploy próprio para uso real assume o papel de controlador e deve revisar este documento com assessoria jurídica.

## 1. Princípios aplicados

| Princípio (art. 6º) | Na prática |
| --- | --- |
| Finalidade e adequação | Cada dado tem uma finalidade escrita no inventário abaixo; não é reutilizado para outra coisa. |
| **Necessidade (minimização)** | Do comprador: só **nome e e-mail**. Do ingresso: só o **nome do titular**. **Sem CPF, telefone, endereço, data de nascimento ou documento** no MVP. |
| Livre acesso | `GET /me/export` entrega todos os dados do titular em JSON, a qualquer momento. |
| Qualidade | O titular edita o próprio nome; o e-mail é verificado. |
| Transparência | Política de privacidade no app, linkada no cadastro, no checkout e no rodapé. |
| Segurança e prevenção | Controles do [SECURITY_MODEL.md](SECURITY_MODEL.md); dados pessoais fora de logs, Sentry, filas e outbox. |
| Não discriminação | Nenhuma decisão automatizada sobre pessoas. |
| Responsabilização | Este inventário, auditoria das ações sobre dados pessoais e testes que provam a exportação e a anonimização. |

## 2. Inventário de dados pessoais

| Dado | Titular | Onde | Finalidade | Base legal (art. 7º) | Retenção | Compartilhado com |
| --- | --- | --- | --- | --- | --- | --- |
| Nome | Usuário | `users.name` | Identificar a conta, saudação em e-mails | Execução de contrato (V) | Enquanto a conta existir; anonimizado na exclusão | Resend (no corpo de e-mails) |
| E-mail | Usuário | `users.email` | Login, verificação, envio de ingressos e avisos transacionais | Execução de contrato (V) | Enquanto a conta existir; anonimizado na exclusão | Resend |
| Hash de senha | Usuário | `users.password_hash` | Autenticação | Execução de contrato (V) | Enquanto a conta existir; apagado na exclusão | — |
| ID da conta no Google/GitHub | Usuário | `oauth_accounts.provider_account_id` | Login social | Execução de contrato (V) | Enquanto o vínculo existir; apagado na exclusão | Google / GitHub (eles já o têm) |
| Nome público do organizador | Organizador | `organizer_profiles.display_name` | Exibir quem organiza o evento | Execução de contrato (V) | Enquanto houver eventos publicados; anonimizado na exclusão | Público (página do evento) |
| Nome e e-mail do comprador (cópia no pedido) | Comprador | `orders.buyer_name`, `orders.buyer_email` | Comprovante, envio dos ingressos, suporte e contestação | Execução de contrato (V); exercício regular de direitos (VI) | 5 anos após a compra; anonimizado na exclusão da conta | Resend |
| Nome do titular do ingresso | Titular (pode ser terceiro indicado pelo comprador) | `tickets.holder_name` | Identificação na entrada do evento | Execução de contrato (V) — em favor do titular | Até 90 dias após o evento; depois anonimizado por job | Organizador do evento (só no momento do check-in) |
| Dados de pagamento (cartão, endereço de cobrança) | Comprador | **Somente no Stripe** | Processar o pagamento | Execução de contrato (V) | Política do Stripe | Stripe (coleta direta, via Payment Element) |
| Endereço IP | Visitante | Redis (chave de rate limit, como hash) | Segurança: limitar abuso | Legítimo interesse (IX) — prevenção a fraude | Duração da janela (≤ 1 h) | — |
| Cookies de sessão e CSRF | Usuário | Navegador | Manter a sessão autenticada e proteger contra CSRF | Execução de contrato (V); estritamente necessários | Acesso: 10 min; refresh: até 30 dias | — |
| Registros de auditoria | Usuário (por ID pseudônimo) | `audit_logs` | Segurança, prova de ações sensíveis | Legítimo interesse (IX); exercício regular de direitos (VI) | 5 anos | — |
| Tentativas de check-in | Titular (por ID do ingresso) | `checkin_attempts` | Controle de acesso e antifraude no evento | Legítimo interesse (IX) | 90 dias após o evento | Organizador do evento |

**Não coletamos:** CPF, RG, telefone, endereço residencial, data de nascimento, gênero, geolocalização, dados sensíveis (art. 5º, II), dados de crianças, cookies de analytics ou de publicidade.

Sobre o titular indicado por terceiro: o comprador informa o nome de quem vai usar o ingresso. A interface avisa que esse nome será exibido ao organizador no check-in, e o dado é anonimizado 90 dias após o evento.

### Onde dado pessoal **não** pode aparecer

- Logs de aplicação (pino redige `email`, `name`, `holderName`, `password`, `token`, cookies e headers de autenticação).
- Sentry (`sendDefaultPii: false` + `beforeSend` que remove `user`, `request.cookies`, `request.headers`, `request.data`).
- `outbox_messages.payload` e jobs do BullMQ (só IDs).
- URLs e query strings (o token do QR e IDs de pedido nunca carregam nome ou e-mail).
- `metadata` do PaymentIntent no Stripe (só `orderId`).
- Metadados de imagens (EXIF/GPS removidos no re-encode).

Testes automatizados verificam a redação dos logs e o conteúdo enviado ao Sentry e ao Stripe.

## 3. Operadores e transferência internacional

| Operador | Função | Dados pessoais que recebe | Região |
| --- | --- | --- | --- |
| Stripe | Pagamentos (modo de teste na demo) | Dados de cartão e cobrança digitados pelo comprador diretamente no Stripe | EUA |
| Resend | Envio de e-mails transacionais | E-mail e nome do destinatário, conteúdo do e-mail | EUA |
| Vercel | Hospedagem do web | Tráfego HTTP (IP em logs de borda do provedor) | Global |
| Render | Hospedagem da API e do worker | Tráfego HTTP | EUA |
| Neon | Banco de dados PostgreSQL | Todos os dados do inventário | Região configurável (preferir `sa-east-1` quando disponível) |
| Upstash | Redis (filas e rate limit) | IP em hash, IDs | Região configurável |
| Cloudflare R2 | Imagens dos eventos | Nenhum dado pessoal (imagens re-encodadas sem EXIF) | Global |
| Sentry | Monitoramento de erros | Nenhum dado pessoal (sanitizado) | EUA/UE |
| Google / GitHub | Login social | Já detêm a conta do titular; recebem o fato de que houve login no Vira | Global |

Transferências internacionais (art. 33) se apoiam nas cláusulas contratuais padrão e nos termos de tratamento de dados (DPA) desses fornecedores. Em deploy real, o controlador deve formalizar isso.

## 4. Direitos do titular (art. 18)

| Direito | Como exercer | Implementação |
| --- | --- | --- |
| Confirmação e acesso | Conta → Privacidade → "Baixar meus dados" | `GET /me/export` (JSON com conta, perfil de organizador, pedidos, ingressos, sessões ativas). Auditado como `user.data_exported`. |
| Correção | Conta → Perfil | `PATCH /me` |
| Portabilidade | Mesmo arquivo JSON do acesso, em formato estruturado e documentado | `GET /me/export` |
| Eliminação / anonimização | Conta → Privacidade → "Excluir minha conta" | `DELETE /me` com reautenticação e confirmação |
| Informação sobre compartilhamento | Política de privacidade (seção de operadores) | Página `/privacidade` |
| Revogação de consentimento | Não há tratamento baseado em consentimento no MVP | — |
| Oposição / revisão | Contato do encarregado | Abaixo |

### O que acontece ao excluir a conta

Executado em uma transação, auditado como `user.anonymized`:

1. `users.email` → `deleted+<id>@invalid`, `users.name` → `Conta excluída`, `password_hash` → `NULL`, `anonymized_at` preenchido.
2. `oauth_accounts`, `sessions` e `verification_tokens` do usuário são **apagados**; cookies são limpos.
3. Pedidos: `buyer_name` e `buyer_email` anonimizados; valores, datas e IDs do Stripe são mantidos (registro financeiro, sem identificar a pessoa).
4. Ingressos `VALID` de eventos futuros são **cancelados** (o modal de confirmação avisa antes); `holder_name` de todos os ingressos vira `Titular removido`.
5. Perfil de organizador: bloqueado se houver eventos futuros publicados (o organizador precisa cancelá-los antes); senão `display_name` → `Organizador removido`.
6. `audit_logs` permanecem com o `actor_id` pseudônimo, que deixa de apontar para uma pessoa identificável.

Testes de integração verificam que, após a exclusão, nenhuma coluna do inventário contém o nome ou o e-mail originais.

## 5. Retenção automática

| Job (worker) | Frequência | Ação |
| --- | --- | --- |
| `privacy.anonymize-past-holders` | Diário | Anonimiza `tickets.holder_name` de eventos encerrados há mais de 90 dias |
| `privacy.purge-checkin-attempts` | Diário | Apaga `checkin_attempts` de eventos encerrados há mais de 90 dias |
| `auth.purge-sessions` | Diário | Apaga sessões expiradas há mais de 30 dias e tokens de verificação vencidos |
| `privacy.anonymize-old-orders` | Mensal | Anonimiza `buyer_name`/`buyer_email` de pedidos com mais de 5 anos |
| `ops.purge-webhook-events` | Diário | Apaga `processed_webhook_events` com mais de 90 dias |
| `ops.purge-outbox` | Diário | Apaga mensagens despachadas há mais de 7 dias |

## 6. Cookies

Somente cookies **estritamente necessários** (sessão e CSRF). Não há cookies de analytics ou publicidade no MVP, portanto não há banner de consentimento. Se algum dia houver analytics, será sem cookies e sem dados pessoais, ou com consentimento prévio e granular — e este documento será atualizado antes.

## 7. Incidentes

Em caso de incidente de segurança com dados pessoais: conter, avaliar o risco aos titulares, registrar no histórico de incidentes e, havendo risco ou dano relevante, comunicar a ANPD e os titulares em prazo razoável (Resolução CD/ANPD nº 15/2024: 3 dias úteis). O procedimento técnico (rotação de chaves, revogação de sessões) está no [SECURITY_MODEL.md](SECURITY_MODEL.md#7-verificação-contínua).

## 8. Encarregado (DPO)

Para a demo pública, o encarregado é a pessoa mantenedora do projeto, contatável pelo relato privado do GitHub ou pelo perfil [@joaomenkdev-cloud](https://github.com/joaomenkdev-cloud). Em deploy próprio, cada controlador deve indicar o seu.

## 9. Política de privacidade no app

A página `/privacidade` é gerada a partir deste inventário (mesmos dados, linguagem simples), com data da última atualização, e é linkada:

- no rodapé de todas as páginas;
- no formulário de cadastro ("Ao criar a conta, você concorda com os Termos e declara ter lido a Política de Privacidade");
- no checkout, ao lado dos dados do titular;
- nos e-mails transacionais.
