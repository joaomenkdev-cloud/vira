# ADR-0008: QR Code com token assinado por HMAC

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O QR é o que dá acesso ao evento. Se carregasse um id sequencial ou previsível, qualquer pessoa poderia gerar QRs válidos. A validação também precisa garantir uso único.

## Decisão

- O QR carrega um token `v1.<kid>.<payload>.<sig>`:
  - `payload` = base64url(`ticketId` (16 bytes) ‖ `qrNonce` (16 bytes aleatórios));
  - `sig` = base64url(HMAC-SHA256(chave[`kid`], `v1.<kid>.<payload>`)).
- Chaves de ao menos 256 bits em variável de ambiente (`QR_SIGNING_KEYS`, várias, cada uma com `kid`), permitindo **rotação** sem invalidar ingressos já emitidos: a chave ativa assina, todas as listadas verificam.
- Validação: formato → `kid` conhecido → HMAC com comparação em **tempo constante** → busca do ingresso → `qr_nonce` confere → `UPDATE tickets SET status = 'USED' WHERE id = $1 AND event_id = $2 AND status = 'VALID' AND qr_nonce = $3`. Uma única leitura vence.
- Respostas claras: `VALID`, `ALREADY_USED` (com o horário do uso), `WRONG_EVENT` e `INVALID`.
- Trocar o `qr_nonce` (reemissão) invalida QRs antigos.
- O ingresso também tem um código legível `VIRA-XXXX-XXXX` (aleatório, 40 bits) para suporte e validação manual, que só funciona para o organizador autenticado do evento e com rate limit.
- O token só é entregue ao dono do ingresso e nunca vai para logs, URLs ou listagens.

## Alternativas consideradas

- **JWT no QR** — maior (QR mais denso, leitura pior), e cabeçalho e claims não agregam nada.
- **Assinatura assimétrica (Ed25519)** — permitiria validação offline por terceiros; desnecessária no MVP (check-in online). Candidata para check-in offline no marco Evolução.
- **Id aleatório sem assinatura** — seguro se for longo o bastante, mas exige consulta ao banco para rejeitar lixo e não permite rotação de chave.

## Consequências

- QRs não podem ser forjados nem adivinhados, e tokens inválidos são rejeitados sem tocar no banco.
- Vazamento de chave exige rotação; o `kid` torna isso operacionalmente simples.
- O check-in depende de conexão com a API no MVP.
