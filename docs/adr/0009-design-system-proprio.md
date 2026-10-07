# ADR-0009: Design system próprio sobre shadcn/ui

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O briefing ([DESIGN_BRIEF.md](../DESIGN_BRIEF.md)) pede identidade própria — editorial, premium, com o evento como protagonista e um único vermelho-coral de assinatura — e proíbe estética de template. Ao mesmo tempo, componentes acessíveis (diálogos, menus, selects) são difíceis de fazer certo do zero.

## Decisão

- **`packages/ui`** é o design system: tokens (`tokens.css`), tema do Tailwind (`@theme`) e componentes.
- **shadcn/ui** é usado apenas como **base técnica** (estrutura e primitivas Radix copiadas para o repositório); todo o visual é reescrito com os tokens do Vira. Nada do tema padrão do shadcn.
- **Inter** como fonte única (Geist e Manrope ficam registradas como alternativas, sem serem carregadas).
- Paleta definida com contraste **AA verificado** por teste automatizado ([DESIGN.md](../DESIGN.md#21-cores)); valores arbitrários do Tailwind são proibidos por lint.
- O design system é construído **antes de qualquer tela** (primeira entrega do marco Núcleo).
- PRs de interface não alteram lógica de negócio, API ou pagamentos e trazem prints de desktop e mobile.

## Alternativas consideradas

- **Biblioteca pronta (MUI, Chakra, Mantine)** — rápida, mas é difícil escapar da cara de template, e o peso é maior.
- **Tudo do zero** — controle máximo, mas reimplementar a acessibilidade de diálogos e menus é caro e arriscado.
- **Geist como fonte** — ótima, mas Inter é a primeira opção do briefing e tem excelente legibilidade em tamanhos pequenos.

## Consequências

- Identidade consistente em todas as telas a partir de uma única fonte de tokens.
- Acessibilidade de base herdada do Radix, com testes axe por componente.
- Atualizações do shadcn não chegam automaticamente (é código copiado); aceitável e intencional.
