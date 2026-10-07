# ADR-0006: Stripe Payment Intents, webhooks e idempotência

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O pagamento precisa ser confiável, sem dados de cartão no nosso servidor, e a demo pública nunca pode movimentar dinheiro real. Redes falham: clientes reenviam requisições e o Stripe reenvia webhooks, às vezes fora de ordem.

## Decisão

- **Stripe em modo de teste**, com **Payment Intents** e **Payment Element** (Stripe Elements) no navegador. Nenhum dado de cartão passa pela API (escopo PCI SAQ A).
- A configuração **recusa** chaves que não sejam de teste (`sk_test_`, `pk_test_`) enquanto `PAYMENTS_MODE=test`, o único modo aceito no MVP.
- O PaymentIntent é criado pela API com o **valor lido do banco**, `metadata.orderId` e idempotency key do Stripe `pi:{orderId}`.
- **A única forma de um pedido virar `PAID` é o webhook** `payment_intent.succeeded` com assinatura verificada sobre o body bruto. O retorno do navegador apenas dispara a consulta do status.
- **Webhooks processados uma única vez:** tabela `processed_webhook_events` (PK = `event.id`) gravada na mesma transação do efeito. Reenvio → conflito → `200` sem efeito.
- **Pedidos idempotentes:** `Idempotency-Key` obrigatório em `POST /orders`, com `UNIQUE(buyer_id, idempotency_key)` e hash do corpo.
- **Pagamento tardio** (pedido já expirado): re-reserva o estoque se houver; senão, reembolso automático via job (idempotency key `refund:{orderId}`).
- A integração fica atrás da porta `PaymentGateway`. Os testes usam um fake e fixtures de webhook assinadas localmente; a Stripe CLI (`stripe listen`, `stripe trigger`) cobre os testes manuais e E2E.

## Alternativas consideradas

- **Stripe Checkout (página hospedada)** — menos código, mas tira o checkout da identidade visual do produto.
- **Confiar no redirect do cliente para marcar pago** — falsificável; descartado.
- **Mercado Pago ou Pix direto** — relevantes no Brasil, mas o modo de teste e a documentação do Stripe servem melhor a uma demo pública; Pix via Stripe pode entrar no marco Evolução.

## Consequências

- Ninguém consegue marcar um pedido como pago sem um evento assinado pelo Stripe.
- Existe uma janela entre pagar e ver o ingresso; a UI trata com tela de confirmação e e-mail.
- Dependemos da entrega de webhooks; a reconciliação manual fica documentada para falhas prolongadas.
