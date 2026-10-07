# ADR-0007: Controle de estoque com reserva e update condicional

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

Nunca podemos vender mais ingressos que a lotação, inclusive quando muitas pessoas disputam a última vaga ao mesmo tempo. Entre escolher e pagar há alguns minutos em que o ingresso precisa ficar segurado.

## Decisão

- Cada `ticket_type` mantém os contadores `capacity`, `sold` e `reserved`, com `CHECK (sold + reserved <= capacity)` no banco.
- **Reserva** em transação com **update condicional atômico**:

  ```sql
  UPDATE ticket_types SET reserved = reserved + $qty
   WHERE id = $id AND sold + reserved + $qty <= capacity
  RETURNING id;
  ```

  Zero linhas afetadas → `409 insufficient-inventory`. Pedidos com vários tipos reservam em ordem determinística de `id` (evita deadlock) e fazem rollback se qualquer um falhar.
- A reserva vale **10 minutos** (`orders.expires_at`), com **uma** extensão de +10 min disponível nos 2 minutos finais (acessibilidade, WCAG 2.2.1).
- **Expiração** por job BullMQ com delay até `expires_at` + **varredura** a cada minuto como rede de segurança. Ambos usam `UPDATE orders ... WHERE status = 'PENDING' AND expires_at <= now()` e devolvem o estoque na mesma transação.
- No pagamento: `reserved -= q` e `sold += q` na transação do webhook.
- Limites anti-abuso: 1 pedido `PENDING` por comprador por evento e `max_per_order` por tipo.
- **Teste obrigatório:** N requisições simultâneas pela última vaga contra Postgres real (Testcontainers) → exatamente 1 sucesso, N−1 respostas `409`, e `sold + reserved` nunca ultrapassa `capacity`.

## Alternativas consideradas

- **`SELECT ... FOR UPDATE` + verificação na aplicação** — correto, mas segura o lock por mais tempo e é mais fácil de errar.
- **Uma linha por ingresso (inventário unitário)** — permitiria assentos marcados, mas multiplica linhas e locks; desnecessário sem lugares numerados.
- **Contador no Redis** — rápido, mas o banco deixaria de ser a fonte da verdade e o Redis pode perder dados.
- **Isolamento `SERIALIZABLE`** — funciona, mas exige retry em toda transação e degrada sob contenção.

## Consequências

- Overbooking é impossível mesmo com bug na aplicação: o `CHECK` recusa.
- A linha do `ticket_type` vira ponto de contenção em vendas muito disputadas; aceitável na escala do projeto (fila virtual seria uma evolução).
- Estoque preso em reservas abandonadas volta em até 10 min (no pior caso, 11, com a varredura).
