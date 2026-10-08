# ADR-0010: Dados de demonstração só via seed, sinalizados

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O briefing proíbe eventos fictícios para preencher a interface. Mas uma demo pública vazia não mostra o produto a quem visita o portfólio.

## Decisão

Exceção controlada à regra do briefing:

- A demo pública traz **alguns eventos de exemplo criados exclusivamente pelo seed** (`pnpm db:seed:demo`), com `events.is_demo = true`.
- Todo evento de demonstração exibe o **selo "Demonstração"** no card e na página do evento, além de um aviso de que a compra usa o modo de teste do Stripe.
- Fotos de **licença livre** (Unsplash, Pexels) com **crédito ao autor** (nome, link e licença) guardado no seed e exibido sob a imagem.
- Os eventos de demonstração podem ser apagados a qualquer momento (`pnpm db:seed:demo --reset`) sem afetar outros dados.
- Fora do seed, nada é inventado: sem depoimentos, números de uso, logos de parceiros, avaliações ou funcionalidades inexistentes. Estados vazios são desenhados para quando não houver eventos.

## Alternativas consideradas

- **Demo vazia** — honesta, mas não demonstra a experiência de compra.
- **Eventos fictícios sem sinalização** — contraria o briefing e pode enganar visitantes.
- **Eventos reais de terceiros** — problemas de direito de imagem e de marca, e risco de alguém achar que pode comprar de verdade.

## Consequências

- A demo é navegável de ponta a ponta sem enganar ninguém.
- O card e a página do evento precisam suportar o selo e o crédito da foto (especificados no [DESIGN.md](../DESIGN.md)).
- O seed vira código mantido e testado.
