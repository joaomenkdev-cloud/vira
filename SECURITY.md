# Política de segurança

O Vira lida com pagamentos (Stripe em modo de teste), ingressos e dados pessoais. Levamos relatos de vulnerabilidade a sério.

## Versões suportadas

O projeto está em construção. Apenas a branch `main` recebe correções de segurança.

| Versão | Suportada |
| ------ | --------- |
| `main` | Sim       |
| outras | Não       |

## Como relatar uma vulnerabilidade

**Não abra issue pública.** Use o relato privado do GitHub:

1. Acesse a aba **Security** do repositório.
2. Clique em **Report a vulnerability** (GitHub Private Vulnerability Reporting).
3. Descreva o problema, o impacto e os passos para reproduzir.

Inclua, se possível:

- endpoint, tela ou arquivo afetado;
- versão/commit;
- prova de conceito mínima (sem dados reais de terceiros);
- sua sugestão de correção, se tiver.

## O que esperar

| Etapa                      | Prazo-alvo     |
| -------------------------- | -------------- |
| Confirmação de recebimento | até 3 dias     |
| Avaliação inicial          | até 7 dias     |
| Correção de falha crítica  | até 30 dias    |

Daremos crédito no changelog a quem relatar, se desejar.

## Escopo

Dentro do escopo:

- API (`apps/api`), worker e aplicação web (`apps/web`);
- fluxo de compra, webhook de pagamento, emissão e validação de ingressos;
- autenticação, autorização e tratamento de dados pessoais.

Fora do escopo:

- ataques de negação de serviço volumétricos;
- engenharia social;
- vulnerabilidades em serviços de terceiros (Stripe, Vercel, Render, Neon, Upstash, Cloudflare) — relate ao fornecedor;
- achados sem impacto demonstrável (ex.: cabeçalho ausente sem exploração).

## Testes de segurança na demo pública

A demo usa Stripe em **modo de teste** e nunca movimenta dinheiro real. Ainda assim:

- não use dados pessoais reais de terceiros;
- não execute varreduras automatizadas agressivas;
- não tente acessar dados de outros usuários além do necessário para demonstrar o problema.

O modelo de ameaças está em [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).
