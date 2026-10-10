# Design system do Vira

> Fonte da verdade do visual: [`DESIGN_BRIEF.md`](DESIGN_BRIEF.md). Este documento traduz o briefing em regras, tokens e especificações implementáveis em `packages/ui`.
> Decisão registrada em [ADR-0009](adr/0009-design-system-proprio.md).

Como o Vira começa do zero, a "auditoria do projeto existente" do briefing vira: **o design system é definido antes de qualquer tela**. Nenhuma página é estilizada com valores soltos; tudo sai dos tokens abaixo.

## Sumário

1. [Princípios da marca em regras práticas](#1-princípios-da-marca-em-regras-práticas)
2. [Tokens](#2-tokens)
3. [Componentes base](#3-componentes-base)
4. [Wireframes](#4-wireframes)
5. [Conteúdo e dados da demo](#5-conteúdo-e-dados-da-demo)
6. [Checklist de acessibilidade](#6-checklist-de-acessibilidade)
7. [Implementação](#7-implementação)

---

## 1. Princípios da marca em regras práticas

A frase guia: **"Encontrar um evento e comprar o ingresso deve ser simples e prazeroso."**

### 1.1 O evento é o protagonista

| Regra | Como verificar |
| --- | --- |
| A fotografia do evento é o maior elemento visual de toda tela que mostra um evento. | Na página do evento, a imagem ocupa ≥ 45% da largura no desktop e 100% da largura no mobile, acima da dobra. |
| A ordem de leitura da página do evento é fixa: **imagem → nome → data/local → descrição → ingressos → CTA**. | A ordem no DOM segue essa sequência (também é a ordem do leitor de tela). |
| A interface não compete com o evento: nada de ilustrações, gradientes, fundos texturizados ou ícones decorativos. | Revisão de PR: todo ícone precisa ter função (ação ou significado). |
| O nome do evento é sempre o texto mais pesado da tela onde aparece. | Só o nome do evento (ou o título da página) usa `display`/`h1`. |
| Sem foto, sem cor inventada: eventos sem imagem usam o placeholder tipográfico (seção 3.3), nunca um gradiente. | — |

### 1.2 Um único vermelho-coral como assinatura

| Regra | Detalhe |
| --- | --- |
| **Um CTA primário por tela.** Só ele usa fundo `accent`. | Na página do evento é "Comprar ingresso"; no checkout é "Pagar R$ X". |
| O vermelho aparece em pouca área. | Orçamento: no máximo ~5% da área visível de qualquer tela. |
| Usos permitidos: CTA primário, estado ativo/selecionado, foco de teclado, data no card de evento, logotipo, barra de progresso de navegação, contador da reserva quando faltam < 2 min. | Qualquer outro uso exige justificativa no PR. |
| Usos proibidos: fundos de seção, títulos inteiros, ícones decorativos, bordas de card, gráficos com várias cores. | — |
| Texto vermelho sobre `accent-soft` usa sempre `accent-ink` (#B8222E), nunca `accent`. | `accent` sobre `accent-soft` tem 4,19:1 e reprova AA. |
| Erro não depende só da cor: sempre ícone + texto. | Como o accent também é vermelho, um campo com erro tem mensagem textual e `aria-invalid`. |

### 1.3 Editorial, respirado, rápido

- **Espaço é o separador padrão.** Antes de adicionar uma borda ou um card, tente resolver com espaçamento. Nunca card dentro de card.
- **Bordas são finas e claras** (`line`, 1px). Borda mais forte (`line-strong`) só onde a WCAG exige contraste de componente (campos de formulário, controles).
- **Uma única sombra** (`shadow-float`), só para camadas que flutuam sobre o conteúdo (dropdown, modal, toast, barra fixa de compra no mobile). Cards não têm sombra.
- **Animação é feedback, não enfeite.** Nada dura mais que 320 ms, e tudo respeita `prefers-reduced-motion`.
- **Nada inventado.** Sem números de "milhares de eventos", depoimentos, logos de parceiros ou funcionalidades que não existem. Estados vazios são desenhados com o mesmo cuidado das telas cheias.

### 1.4 O que nunca fazer (do briefing)

Roxo ou azul "SaaS", gradientes, glassmorphism, neon, excesso de sombras ou bordas, cards aninhados, dashboards carregados, estética de template, excesso de ícones, ilustrações genéricas, texto ou funcionalidades fictícias.

---

## 2. Tokens

Os tokens vivem em `packages/ui/src/tokens.css` como CSS custom properties e são expostos ao Tailwind via `@theme`. Componentes **nunca** usam valores literais (cores hex, `px` arbitrários, `ease` soltos).

Convenção de nomes: `--vira-<categoria>-<nome>`. No Tailwind: `bg-surface`, `text-ink-muted`, `border-line`, `rounded-lg`, `shadow-float`, `duration-base`.

### 2.1 Cores

#### Paleta base

| Token | Valor | Uso |
| --- | --- | --- |
| `bg` | `#FAFAF8` | Fundo da página (off-white quente). |
| `surface` | `#FFFFFF` | Cards, modais, campos, ingresso. |
| `surface-sunken` | `#F2F2EF` | Skeletons, blocos de informação neutros, item ativo de menu. |
| `ink` | `#0B0B0C` | Títulos, texto principal, ícones funcionais. |
| `ink-muted` | `#5C5F66` | Texto secundário, labels, metadados, placeholder. |
| `ink-subtle` | `#8A8D94` | **Somente** texto desabilitado e elementos não essenciais. Nunca para informação necessária. |
| `line` | `#E7E7EA` | Divisores e bordas decorativas de card. |
| `line-strong` | `#8A8D94` | Bordas de campos, checkbox, radio, stepper (exigem 3:1). |
| `accent` | `#D92D3A` | CTA primário, foco, estado ativo, detalhes da marca. |
| `accent-hover` | `#B8222E` | Hover do CTA primário. |
| `accent-pressed` | `#9A1B26` | Estado pressionado do CTA primário. |
| `accent-soft` | `#FDECEC` | Fundo de seleção ativa (ex.: tipo de ingresso escolhido), badge de destaque. |
| `accent-ink` | `#B8222E` | Texto/ícone vermelho sobre `accent-soft`. |
| `on-accent` | `#FFFFFF` | Texto sobre `accent`. |
| `scrim` | `rgb(11 11 12 / 0.48)` | Fundo atrás de modal e bottom sheet. |

#### Cores de estado

Sem azul: informação neutra usa `ink` sobre `surface-sunken`.

| Token | Texto | Fundo | Uso |
| --- | --- | --- | --- |
| `success` | `#146C43` | `#E8F5EE` | Pagamento confirmado, check-in válido. |
| `warning` | `#8A5A00` | `#FFF4E0` | Reserva perto de expirar, últimos ingressos. |
| `danger` | `#B3261E` | `#FDECEC` | Erros, check-in inválido, ação destrutiva. |
| `info` | `#0B0B0C` | `#F2F2EF` | Avisos neutros (ex.: "Este é um evento de demonstração"). |

#### Contraste verificado (WCAG 2.2)

Calculado com a fórmula de luminância relativa da WCAG. AA exige 4,5:1 para texto normal, 3:1 para texto grande (≥ 24px, ou ≥ 18,66px em negrito) e para componentes de interface.

| Primeiro plano | Fundo | Razão | Resultado |
| --- | --- | --- | --- |
| `ink` #0B0B0C | `bg` #FAFAF8 | 18,83:1 | AAA |
| `ink` #0B0B0C | `surface` #FFFFFF | 19,67:1 | AAA |
| `ink` #0B0B0C | `surface-sunken` #F2F2EF | 17,54:1 | AAA |
| `ink-muted` #5C5F66 | `bg` #FAFAF8 | 6,12:1 | AA |
| `ink-muted` #5C5F66 | `surface` #FFFFFF | 6,40:1 | AA |
| `ink-muted` #5C5F66 | `surface-sunken` #F2F2EF | 5,70:1 | AA |
| `ink-muted` #5C5F66 | `accent-soft` #FDECEC | 5,60:1 | AA |
| `on-accent` #FFFFFF | `accent` #D92D3A | 4,79:1 | AA |
| `on-accent` #FFFFFF | `accent-hover` #B8222E | 6,35:1 | AA |
| `accent` #D92D3A | `surface` #FFFFFF | 4,79:1 | AA (texto e foco) |
| `accent` #D92D3A | `bg` #FAFAF8 | 4,58:1 | AA (texto e foco) |
| `accent-ink` #B8222E | `accent-soft` #FDECEC | 5,56:1 | AA |
| `accent` #D92D3A | `accent-soft` #FDECEC | 4,19:1 | **Reprovado para texto** — usar `accent-ink`. Ok para não-texto (≥ 3:1). |
| `line-strong` #8A8D94 | `surface` #FFFFFF | 3,32:1 | AA não-texto (bordas de campo) |
| `line` #E7E7EA | `surface` #FFFFFF | 1,23:1 | Somente decorativo |
| `success` #146C43 | `#E8F5EE` | 5,75:1 | AA |
| `warning` #8A5A00 | `#FFF4E0` | 5,44:1 | AA |
| `danger` #B3261E | `#FDECEC` | 5,72:1 | AA |
| `danger` #B3261E | `surface` #FFFFFF | 6,54:1 | AA |

O PR de fundação do design system inclui um teste que recalcula essa tabela a partir de `tokens.css` e falha se algum par cair abaixo do mínimo.

### 2.2 Tipografia

- **Família:** Inter variável, auto-hospedada pelo pacote `@fontsource-variable/inter` (sem requisição a terceiros em tempo de execução nem de build, o que também preserva a privacidade dos visitantes; subsets `latin` e `latin-ext` por `unicode-range`, `font-display: swap`). Fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Recursos OpenType:** `font-feature-settings: "cv11", "ss01"` (a de um andar e dígitos mais abertos); preços e horários usam `tabular-nums`.
- **Sem fontes decorativas.** Geist e Manrope ficam como alternativas registradas no ADR, não são carregadas.

| Token | Tamanho / altura de linha | Peso | Tracking | Uso |
| --- | --- | --- | --- | --- |
| `display` | 56/60 (mobile 40/44) | 800 | −0,03em | Título da home ("Encontre seu próximo evento."). |
| `h1` | 40/44 (mobile 32/36) | 700 | −0,02em | Nome do evento na página do evento; título de página. |
| `h2` | 28/34 (mobile 24/30) | 700 | −0,015em | Seções ("Ingressos", "Sobre o evento"). |
| `h3` | 20/28 | 600 | −0,01em | Nome do evento no card; título de modal. |
| `body-lg` | 18/28 | 400 | 0 | Descrição do evento, subtítulo do hero. |
| `body` | 16/24 | 400 | 0 | Texto padrão. Nunca menor em campos (evita zoom no iOS). |
| `body-sm` | 14/20 | 400 | 0 | Metadados, texto de ajuda. |
| `label` | 14/20 | 500 | 0 | Labels de campo, botões `sm`. |
| `overline` | 12/16 | 600 | +0,06em, maiúsculas | Data no card, nomes de etapa. Mínimo absoluto de tamanho. |
| `price` | 20/28 (resumo: 28/34, `price-lg`) | 700 | −0,01em, `tabular-nums` | Preços. |
| `logo` | 24/32 | 800 | −0,025em | Só a marca "vira" no header. |

Os tamanhos de mobile de `h1` e `h2` são os tokens `h1-sm` e `h2-sm` (o de `display` é `display-sm`), usados com o prefixo de breakpoint: `text-h1-sm md:text-h1`.

Regras:

- Comprimento de linha do corpo: 60–75 caracteres (`max-width: 68ch`, utilitário `max-w-reading`).
- Hierarquia por **peso e tamanho**, não por cor. No máximo três níveis de texto por bloco.
- Títulos com `text-wrap: balance`; parágrafos com `text-wrap: pretty`.

### 2.3 Espaçamento

Base de **4px**. Só estes valores existem:

| Token | px | Uso típico |
| --- | --- | --- |
| `0.5` | 2 | Ajustes ópticos de ícone. |
| `1` | 4 | Ícone ↔ texto pequeno. |
| `2` | 8 | Gap interno de badge, label ↔ campo. |
| `3` | 12 | Gap entre metadados do card. |
| `4` | 16 | Padding de card, margem lateral no mobile. |
| `5` | 20 | Padding de botão `lg`. |
| `6` | 24 | Padding de modal, gap de grid no mobile, margem lateral no tablet. |
| `8` | 32 | Gap de grid no desktop, margem lateral no desktop. |
| `10` | 40 | Separação entre grupos de formulário. |
| `12` | 48 | Separação entre seções no mobile. |
| `16` | 64 | Separação entre seções no tablet. |
| `24` | 96 | Separação entre seções no desktop. |
| `32` | 128 | Respiro do hero no desktop. |

Layout:

| Token | Valor |
| --- | --- |
| `container-max` | 1200px (página do evento: 1120px; checkout: 960px); utilitários `max-w-page`, `max-w-event`, `max-w-checkout` |
| Largura do modal | 480px (confirmação) e 640px (conteúdo); utilitários `max-w-dialog`, `max-w-dialog-wide` |
| `gutter` | 16px (< 640), 24px (640–1023), 32px (≥ 1024) |
| Grid | 4 colunas (mobile), 8 (tablet), 12 (desktop) |
| Breakpoints | `sm` 640, `md` 768, `lg` 1024, `xl` 1280 |
| Alvo de toque | mínimo 44×44px; 48px em controles do checkout |

### 2.4 Raios

| Token | px | Uso |
| --- | --- | --- |
| `radius-sm` | 6 | Badges retangulares, chips de filtro, tooltips. |
| `radius-md` | 10 | Botões, campos, itens de dropdown, imagens dentro de listas. |
| `radius-lg` | 16 | Cards de evento, modais, ingresso, imagem principal do evento. |
| `radius-full` | 9999 | Avatares, stepper de quantidade, badge sobre imagem. |

Raio interno = raio externo − padding (ex.: imagem dentro de card com padding 0 herda `radius-lg` nos cantos superiores).

### 2.5 Sombra

Existe **uma** sombra:

```css
--vira-shadow-float: 0 12px 32px -8px rgb(11 11 12 / 0.16), 0 2px 6px rgb(11 11 12 / 0.06);
```

Usada só em: dropdown, popover, modal, bottom sheet, toast e barra fixa de compra no mobile. Cards, botões e campos **não** têm sombra; usam borda `line` ou nada.

### 2.6 Movimento

| Token | Valor | Uso |
| --- | --- | --- |
| `duration-fast` | 120ms | Cor de hover, botão pressionado, checkbox. |
| `duration-base` | 200ms | Dropdown, toast, troca de estado de seleção. |
| `duration-slow` | 320ms | Modal, bottom sheet, zoom da imagem do card. |
| `duration-pulse` | 1200ms | Pulso do skeleton (3.8). |
| `delay-skeleton` | 150ms | Atraso antes de o skeleton aparecer (3.8). |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Entradas e mudanças de estado. |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Saídas (sempre ~30% mais rápidas que a entrada). |

Entradas e saídas de camadas (modal, menu, toast, tooltip) usam as animações do tema `animate-fade-in`/`fade-out`, `overlay-in`/`out`, `sheet-in`/`out`, `rise-in` e `skeleton`, todas montadas só com as durações e as curvas acima. O Radix espera o fim da animação de saída antes de desmontar a camada, então toda camada que sai tem uma.

Microinterações permitidas (e só estas no MVP):

- Card: imagem `scale(1.03)` em `duration-slow`; borda passa de `line` para `line-strong`.
- Botão: `scale(0.98)` no `:active` em `duration-fast`.
- Seleção de tipo de ingresso: fundo transiciona para `accent-soft` em `duration-base`.
- Confirmação de compra: check desenhado (stroke) em 400ms, uma única vez.
- Barra de progresso de navegação: 2px `accent` no topo.

Com `prefers-reduced-motion: reduce`: escalas e deslocamentos são removidos; ficam só transições de opacidade ≤ 120ms; skeletons não pulsam.

### 2.7 Camadas (z-index)

| Token | Valor |
| --- | --- |
| `z-sticky` | 10 (header, barra de compra mobile) |
| `z-overlay` | 30 (scrim) |
| `z-modal` | 40 |
| `z-dropdown` | 45 (menu, select, popover e tooltip) |
| `z-toast` | 50 |

`z-dropdown` fica **acima** do modal porque um select, um menu ou um tooltip aberto de dentro de um modal precisa aparecer por cima dele; com o valor 20 a lista abria escondida atrás do scrim. Segue abaixo do toast.

### 2.8 Iconografia e fotografia

- Ícones: [Lucide](https://lucide.dev), traço 1,75px, tamanhos 16/20/24. Ícone só com função; ícone sem texto exige `aria-label`.
- Fotografia: proporção 3:2 nos cards, 16:9 (desktop) e 4:3 (mobile) no banner do evento. `object-fit: cover`, foco central. Sem filtros ou sobreposições coloridas; quando houver texto sobre imagem (só badges), o badge tem fundo sólido.
- Imagens via `next/image`, com `sizes` corretos, `placeholder="blur"` com o `blurDataURL` gerado no upload, e `alt` vindo do campo obrigatório "descrição da imagem" do evento.

---

## 3. Componentes base

Todos em `packages/ui`, construídos sobre primitivas Radix (via shadcn/ui como ponto de partida) e reescritos com os tokens acima. Cada componente documenta: anatomia, variantes, estados, acessibilidade.

Estados obrigatórios para todo componente interativo: `default`, `hover`, `focus-visible`, `active`, `disabled`, e quando aplicável `loading`, `invalid`, `selected`.

**Foco visível (global):** `outline: 2px solid var(--vira-accent); outline-offset: 2px;` aplicado em `:focus-visible`. Nunca `outline: none` sem substituto.

**Como ficou implementado (N2).** Os componentes estão em `packages/ui/src/components/*` e saem pelo `@vira/ui`. Radix onde ele traz comportamento difícil de acertar (Dialog, DropdownMenu, Select, Toast, Tooltip, Slot); HTML nativo onde o navegador já faz tudo (checkbox, radio). Decisões que o texto abaixo não diz:

- **Sem `tailwind-merge`.** Ele não distingue `text-label` (tamanho) de `text-ink` (cor), porque ambos são tokens do Vira. Cada componente separa *aparência* e *caixa* em `cva`s com classes que nunca se sobrepõem.
- **Checkbox e radio são `<input>` nativos** desenhados com CSS (`appearance-none` e os estados `checked:`/`indeterminate:`), e o grupo de radio é um `<fieldset role="radiogroup">` com `<legend>`. O Radix escreve atributos `style` no HTML do servidor (inputs "bolha"), que a CSP estrita bloqueia, deixando os controles nativos à mostra até a hidratação. Teclado, formulário e leitor de tela vêm do navegador.
- **Select:** o servidor renderiza um botão idêntico, e o Radix assume depois que o componente monta (pelo mesmo motivo: o `<select>` escondido do Radix leva `style` inline).
- **Toast:** a região de notificações só é criada no navegador; antes disso não existe toast.
- **Tooltip** (não listado em 3, mas exigido por 3.1): todo botão só com ícone (`IconButton`) tem um, e o nome vem do `label` obrigatório. Com o foco no botão, o primeiro `Esc` fecha o tooltip e o segundo fecha o modal (WCAG 1.4.13).
- **Stepper de quantidade:** nos limites os botões ficam `aria-disabled` em vez de `disabled`. Parecem e agem como desabilitados, mas o foco do teclado não cai para a página quando o usuário chega ao máximo.
- **Modal:** o botão × é o último filho no DOM, então o primeiro foco cai no conteúdo, não na saída. A ordem das ações no DOM é secundária → primária; no celular ela se inverte visualmente (primária no topo).
- **Botão em carregamento** mantém a largura: o rótulo normal e o de carregamento ocupam a mesma célula de uma grade e o que não está em uso fica `invisible`.
- **Header:** `sticky`, borda inferior só depois de rolar (`data-scrolled`); logo, navegação e ações são encaixes separados. O header do web continua só com o logo e o footer só com o texto de hoje: as páginas de navegação e o login ainda não existem.
- **Ainda não feito:** menus com mais de 6 itens virarem bottom sheet no celular (3.6). Nenhum menu do MVP chega a isso (o do avatar tem uns 4 itens); entra junto com o primeiro que precisar.

### 3.1 Botões

| Variante | Fundo | Texto | Borda | Uso |
| --- | --- | --- | --- | --- |
| `primary` | `accent` → hover `accent-hover` → active `accent-pressed` | `on-accent` | — | Um por tela. "Comprar ingresso", "Pagar", "Publicar evento". |
| `secondary` | `surface` → hover `surface-sunken` | `ink` | 1px `line-strong` | Ações alternativas ("Ver no mapa", "Cancelar"). |
| `ghost` | transparente → hover `surface-sunken` | `ink` | — | Ações terciárias, header, ícones. |
| `danger` | `surface` → hover `danger-bg` | `danger` | 1px `danger` | Ações destrutivas ("Excluir conta"). Sempre com confirmação. |
| `link` | — | `ink`, sublinhado 1px offset 3px | — | Navegação inline. |

| Tamanho | Altura | Padding horizontal | Texto | Ícone |
| --- | --- | --- | --- | --- |
| `sm` | 36px | 12px | `label` | 16 |
| `md` | 44px | 16px | `body` 500 | 20 |
| `lg` | 52px | 20px | `body` 600 | 20 |

- Raio `radius-md`. Largura total (`w-full`) no mobile para o CTA principal.
- **Loading:** spinner 16px substitui o ícone à esquerda; o texto muda para o gerúndio ("Processando…"); largura fixa (sem pulo de layout); `aria-busy="true"`; clique ignorado.
- **Disabled:** `surface-sunken` + `ink-subtle`, sem hover. Preferir manter habilitado e explicar o erro a desabilitar sem explicação.
- Botão só com ícone: quadrado (36/44/52), `aria-label` obrigatório, tooltip no hover/foco.

### 3.2 Inputs

Anatomia: **label** (sempre visível, acima) → campo → texto de ajuda **ou** mensagem de erro.

| Propriedade | Valor |
| --- | --- |
| Altura | 48px (checkout e mobile), 44px (formulários do painel) |
| Fundo | `surface` |
| Borda | 1px `line-strong`; hover `ink-muted`; foco `ink` + anel de foco global |
| Raio | `radius-md` |
| Texto | `body` (16px — evita zoom automático no iOS) |
| Placeholder | `ink-muted`; só exemplo de formato, **nunca** substitui o label |
| Erro | borda `danger`, ícone `alert-circle` + mensagem `body-sm` em `danger` abaixo; `aria-invalid="true"` e `aria-describedby` apontando para a mensagem |
| Obrigatório | todos são obrigatórios por padrão; opcionais têm "(opcional)" no label |

Variações: `text`, `email` (com `autocomplete="email"`), `password` (botão mostrar/ocultar com `aria-pressed`), `textarea` (editor markdown da descrição, com prévia), `select` (Radix Select), `search` (home, com ícone à esquerda e botão limpar), `quantity stepper` (− valor +, botões de 44px `radius-full`, valor anunciado via `aria-live="polite"`, limites min/max desabilitam o botão correspondente), `checkbox` e `radio` (20px, borda `line-strong`, marcado em `ink`), `date/time` (nativos no mobile).

Validação: no `blur` e no envio, nunca a cada tecla. No envio com erros, o foco vai para o primeiro campo inválido e um resumo de erros aparece no topo do formulário.

### 3.3 Card de evento

```text
┌───────────────────────────────┐  radius-lg, borda 1px line, fundo surface
│                               │
│          IMAGEM 3:2           │  [Esgotado]  ← badge de status sobre a imagem (no máximo 1)
│                               │
├───────────────────────────────┤
│ SÁB, 14 MAR · 21:00           │  overline, cor accent  (único vermelho do card)
│ Nome do evento em até         │  h3, ink, máximo 2 linhas
│ duas linhas                   │
│ Casa de Shows · São Paulo     │  body-sm, ink-muted, 1 linha
│                               │
│ A partir de R$ 80,00          │  body 600, ink, tabular-nums
│ [Demonstração]                │  badge neutro, só eventos do seed
└───────────────────────────────┘  padding 16px (mobile) / 20px (desktop)
```

- O card inteiro é um link (o `<a>` envolve o título; um pseudo-elemento estende a área clicável). Uma única parada de tabulação por card.
- Hover: imagem `scale(1.03)`, borda `line-strong`. Foco: anel de foco no card inteiro.
- Sem preço disponível (ex.: nenhum tipo à venda) a linha de preço não aparece — nunca "R$ 0,00".
- Sem imagem: placeholder tipográfico — fundo `surface-sunken`, iniciais do evento em `h1` `ink-muted`, sem ícone nem gradiente.
- Grid: 1 coluna (< 640), 2 (640–1023), 3 (≥ 1024). Destaques na home: **no máximo 6** cards.
- Variante `compact` (lista de "Meus ingressos" e painel): imagem 1:1 de 72px à esquerda, texto à direita.

### 3.4 Badges

Altura 24px, padding 0 8px, `label` 12px/600, raio `radius-sm` (ou `radius-full` sobre imagem).

| Variante | Fundo | Texto | Exemplos |
| --- | --- | --- | --- |
| `neutral` | `surface-sunken` | `ink` | "Demonstração", "Rascunho" |
| `accent` | `accent-soft` | `accent-ink` | "Selecionado", "Últimos ingressos" |
| `success` | `success-bg` | `success` | "Pago", "Válido" |
| `warning` | `warning-bg` | `warning` | "Aguardando pagamento" |
| `danger` | `danger-bg` | `danger` | "Cancelado", "Expirado" |
| `on-image` | `surface` sólido | `ink` | "Esgotado" sobre a foto |

Regra: no máximo **um** badge de status por card. O badge "Demonstração" é obrigatório em eventos do seed e não conta para esse limite.

### 3.5 Modais e bottom sheets

- Radix Dialog. Largura 480px (confirmação) ou 640px (conteúdo). `radius-lg`, padding 24px, `shadow-float`, scrim `scrim`.
- Estrutura: título (`h3`) → conteúdo → ações alinhadas à direita (primária à direita). Botão fechar (×) com `aria-label="Fechar"`.
- Mobile (< 640px): vira **bottom sheet** de largura total, cantos superiores `radius-lg`, alça de arraste visual, ações empilhadas com a primária no topo e largura total.
- Foco preso dentro, `Esc` fecha, foco volta ao elemento que abriu. Rolagem do fundo bloqueada.
- Modais destrutivos exigem ação explícita (ex.: digitar "EXCLUIR" para apagar a conta).

### 3.6 Dropdowns e menus

- Radix DropdownMenu / Select. Painel `surface`, `radius-md`, `shadow-float`, padding 4px, largura mínima = gatilho.
- Item: 40px de altura (44px no toque), padding 0 12px, `body-sm`. Hover/foco: `surface-sunken`. Selecionado: ícone `check` à direita e texto 500.
- Navegação por setas, `Home`/`End`, busca por letra, `Esc` fecha. Itens destrutivos em `danger` e separados por divisor.
- Mobile: menus com mais de 6 itens viram bottom sheet.

### 3.7 Alerts e toasts

**Alert (inline, persistente):** fundo do estado (`success-bg`, `warning-bg`, `danger-bg`, `surface-sunken`), raio `radius-md`, padding 16px, ícone 20px à esquerda, título `body` 600 + texto `body-sm`. Sem borda lateral colorida. `role="alert"` para erros; `role="status"` para os demais.

**Toast (efêmero):** fundo `ink`, texto branco, `radius-md`, `shadow-float`, canto inferior central (mobile) ou inferior direito (desktop). Dura 5s, pausa no hover/foco, tem botão fechar. Nunca é o único lugar de uma informação importante (ex.: erro de pagamento aparece também inline).

### 3.8 Loading

| Situação | Padrão |
| --- | --- |
| Carregamento de página/lista | **Skeleton** com o formato final (card, linhas de texto) em `surface-sunken`. Pulso de opacidade 1,2s; estático com movimento reduzido. |
| Ação em botão | Spinner dentro do botão (3.1). |
| Navegação entre rotas | Barra de 2px `accent` no topo. |
| Confirmação de pagamento | Tela dedicada "Confirmando pagamento…" com texto explicando que o ingresso aparece em instantes; consulta o status do pedido; após 30s mostra o caminho alternativo ("Você também receberá o ingresso por e-mail"). |

Skeletons aparecem após 150ms (evita piscar em respostas rápidas). Regiões carregando recebem `aria-busy="true"`.

### 3.9 Estados vazios

Composição única: **título `h3` + uma frase `body` em `ink-muted` + no máximo uma ação**. Centralizado, largura máxima 420px, respiro de 64px vertical. Sem ilustrações genéricas; o único elemento gráfico permitido é a **linha picotada** do ingresso (ver 3.10) como divisor discreto acima do título.

| Contexto | Título | Texto | Ação |
| --- | --- | --- | --- |
| Home sem eventos publicados | Nenhum evento por aqui ainda | Quando organizadores publicarem eventos, eles aparecem nesta página. | Criar um evento (se ORGANIZER) |
| Busca sem resultado | Nada encontrado para "termo" | Tente outra palavra ou remova os filtros. | Limpar filtros |
| Meus ingressos (vazio) | Você ainda não tem ingressos | Os ingressos que você comprar aparecem aqui e no seu e-mail. | Explorar eventos |
| Painel do organizador (vazio) | Seu primeiro evento começa aqui | Crie um rascunho; ele só fica público quando você publicar. | Criar evento |
| Evento sem tipos à venda | Ingressos indisponíveis | As vendas deste evento não estão abertas no momento. | — |
| Erro de carregamento | Não foi possível carregar | Verifique sua conexão e tente de novo. Código: `requestId` | Tentar novamente |

### 3.10 Ingresso digital

O componente mais característico da marca. Inspirado em ingresso físico, com detalhes contidos.

```text
╭──────────────────────────────────────────╮   surface, radius-lg, borda 1px line
│ IMAGEM DO EVENTO (faixa 16:6)            │
├──────────────────────────────────────────┤
│ SÁB, 14 MAR 2026                          │   overline, accent
│ Nome do Evento                            │   h2
│ 21:00 – 02:00 (horário de Brasília)       │   body, ink
│ Casa de Shows · Rua Exemplo, 100 · SP     │   body-sm, ink-muted
│                                           │
│ TITULAR            TIPO                   │   overline, ink-muted
│ Maria Souza        Pista – Lote 1         │   body 600
◖ - - - - - - - - - - - - - - - - - - - - -◗   linha picotada + recortes semicirculares (r=12) nas laterais
│              ┌──────────────┐             │
│              │   QR CODE    │             │   ≥ 200px desktop / ≥ 240px mobile, módulos ink sobre branco,
│              │              │             │   quiet zone de 16px, sem logo no centro
│              └──────────────┘             │
│           VIRA-7KQ2-M9XD                   │   código de referência, mono 14px, tabular, letter-spacing .08em
│        Apresente este QR na entrada        │   body-sm, ink-muted
╰──────────────────────────────────────────╯
```

- **Recortes laterais:** dois semicírculos de 12px de raio na altura da linha picotada, "vazados" com a cor do fundo da página (`mask` CSS, não imagem). Linha picotada: `border-top: 2px dashed var(--vira-line)`.
- **QR em destaque:** maior elemento do stub; contraste máximo (ink sobre branco); nível de correção M. Nunca sobreposto por nada.
- **Estados:**
  - `VALID`: como acima.
  - `USED`: QR com opacidade 24% e selo "Utilizado em 14/03 às 21:42" (badge `neutral`) sobre ele; o código continua legível.
  - `CANCELED`: QR oculto; alert `danger` "Ingresso cancelado" com o motivo.
  - Evento de demonstração: badge "Demonstração" ao lado da data.
- **Acessibilidade:** o QR tem `role="img"` e `aria-label="QR Code do ingresso VIRA-7KQ2-M9XD"`; o código de referência é texto real (copiável e lido por leitores de tela). Todos os dados estão em texto — o QR nunca é a única fonte de informação.
- **Uso na porta:** botão "Tela cheia" mostra apenas o QR + nome do titular + código em fundo branco, para leitura rápida. Estilos de impressão (`@media print`) imprimem o ingresso sem header/footer.
- **Mobile:** largura total menos 16px de margem; o QR é visível sem rolar quando a página é aberta pelo link do e-mail.
- **Feedback pós-compra:** na primeira visualização após o pagamento, o ingresso entra com fade + deslocamento de 8px (320ms) e um alert `success` "Pagamento confirmado. Enviamos o ingresso para seu e-mail."

### 3.11 Componentes de apoio

- **Header:** 64px desktop / 56px mobile, fundo `bg` com borda inferior `line` só após rolar. Logo à esquerda; navegação "Explorar" e "Meus ingressos" (texto `label`, item ativo com sublinhado 2px `accent`); à direita "Entrar" (`secondary sm`) ou avatar com menu. No mobile: logo + botão de busca + avatar/entrar; a navegação vai para o menu do avatar. Sem mega-menu.
- **Footer:** uma linha de links em `body-sm` `ink-muted` ("Privacidade", "Termos", "GitHub"), aviso "Pagamentos em modo de teste — nenhuma cobrança real é feita." e créditos das fotos da demo.
- **Seletor de tipo de ingresso:** lista de linhas (não cards); cada linha = radio estilizado com nome, descrição curta, preço à direita, stepper de quantidade quando selecionada. Selecionada: fundo `accent-soft`, borda 1px `accent`. Esgotado: texto `ink-subtle`, badge "Esgotado", não selecionável.
- **Contador de reserva:** `body-sm` `ink-muted` "Reservado por 09:41"; abaixo de 2 min muda para `warning` e aparece o botão "Manter reserva" (extensão única — ver DATA_MODEL). Atualiza visualmente a cada segundo, mas anuncia para leitores de tela só em 5 min, 2 min, 1 min e na expiração.
- **Stepper de checkout:** "1 Ingressos · 2 Seus dados · 3 Pagamento", `overline`, etapa atual em `ink` com sublinhado `accent`, concluídas com check. Em `<nav aria-label="Etapas">` com `aria-current="step"`.
- **Resultado de check-in (tela do organizador):** cartão de largura total com três estados inconfundíveis por cor **e** ícone **e** texto grande: ✓ "Válido" (`success`), ⟲ "Já utilizado às 21:42" (`warning`), ✕ "Inválido" (`danger`). Anunciado via `aria-live="assertive"` e vibração curta no mobile.

---

## 4. Wireframes

Notação: `[Botão]`, `(•)` radio, `[− 2 +]` stepper, `▓▓▓` imagem, `░░░` skeleton.

### 4.1 Home

#### Desktop (≥ 1024px)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ vira●       Explorar   Meus ingressos                          [Entrar]    │ header 64px
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Encontre seu próximo                       ┌──────────────────────────┐   │
│  evento.                                    │                          │   │ display 56px, 7 col
│                                             │  ▓▓▓ evento em destaque  │   │
│  Shows, teatro, festas e encontros          │  ▓▓▓ (foto real, 4:5)    │   │ imagem 5 col: o
│  perto de você.                             │                          │   │ próximo evento em
│                                             │  SÁB, 14 MAR             │   │ destaque, se houver
│  ┌──────────────────────────────┬────────┐  │  Nome do evento          │   │
│  │ 🔍 Buscar evento ou artista  │ Cidade▾│  └──────────────────────────┘   │
│  └──────────────────────────────┴────────┘                                 │
│  Este fim de semana · Shows · Teatro · Gratuito*                           │ chips de filtro
│                                                                            │
├─────────────────────────────── 96px ───────────────────────────────────────┤
│  Em destaque                                              Ver todos →      │ h2
│                                                                            │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐                          │
│  │ ▓▓▓▓▓▓▓▓▓▓ │   │ ▓▓▓▓▓▓▓▓▓▓ │   │ ▓▓▓▓▓▓▓▓▓▓ │                          │ até 6 cards,
│  │ SÁB, 14 MAR│   │ DOM, 15 MAR│   │ SEX, 20 MAR│                          │ 3 por linha
│  │ Nome       │   │ Nome       │   │ Nome       │                          │
│  │ Local      │   │ Local      │   │ Local      │                          │
│  │ A partir.. │   │ A partir.. │   │ A partir.. │                          │
│  └────────────┘   └────────────┘   └────────────┘                          │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ Privacidade · Termos · GitHub        Pagamentos em modo de teste.          │ footer
└────────────────────────────────────────────────────────────────────────────┘
```

\* Chips só aparecem quando houver dados que os sustentem (ex.: "Gratuito" depende de eventos gratuitos, que ficam para o marco Evolução). Sem evento em destaque, a coluna da imagem some e o título ocupa a largura toda.

#### Mobile (< 640px)

```text
┌──────────────────────────────┐
│ vira●              🔍  [Entrar]│ header 56px
├──────────────────────────────┤
│                              │
│ Encontre seu                 │ display 40px
│ próximo evento.              │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🔍 Buscar evento         │ │ busca 48px, largura total
│ └──────────────────────────┘ │
│ ‹ Este fim de semana · Shows ›│ chips com rolagem horizontal
│                              │
│ Em destaque                  │ h2
│ ┌──────────────────────────┐ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │ 1 card por linha,
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │ imagem largura total
│ │ SÁB, 14 MAR · 21:00      │ │
│ │ Nome do evento           │ │
│ │ Local · Cidade           │ │
│ │ A partir de R$ 80,00     │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ...                      │ │
└──────────────────────────────┘
```

O evento em destaque do hero não aparece no mobile (vira o primeiro card), para que a busca fique acima da dobra.

### 4.2 Página do evento

#### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ vira●       Explorar   Meus ingressos                          [Avatar]    │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │                                                                        │ │
│ │                    ▓▓▓ IMAGEM DO EVENTO 16:9 ▓▓▓                       │ │ radius-lg,
│ │                                                                        │ │ largura do container
│ └────────────────────────────────────────────────────────────────────────┘ │
│  Foto: Autor / Unsplash                                    [Demonstração]  │ crédito body-sm
│                                                                            │
│  ┌──────────────────────────────────────────┐  ┌─────────────────────────┐ │
│  │ SÁB, 14 MAR 2026 · 21:00                 │  │ Ingressos               │ │ coluna 7 / coluna 5
│  │ Nome do Evento em                        │  │                         │ │ (sticky top 96px)
│  │ Destaque                                 │  │ (•) Pista – Lote 1      │ │ h1
│  │                                          │  │     R$ 80,00   [− 2 +]  │ │
│  │ 📅 Sábado, 14 de março · 21:00 – 02:00  │  │ ( ) Camarote            │ │
│  │    Horário de Brasília (GMT−3)           │  │     R$ 200,00           │ │
│  │ 📍 Casa de Shows                         │  │ ( ) Meia-entrada        │ │
│  │    Rua Exemplo, 100 · São Paulo · Mapa ↗ │  │     Esgotado            │ │
│  │ 👤 Organizado por Nome do Organizador    │  │ ─────────────────────── │ │
│  │                                          │  │ Total       R$ 160,00   │ │ price
│  │ Sobre o evento                           │  │ [  Comprar ingresso   ] │ │ primary lg, w-full
│  │ Descrição em markdown sanitizado,        │  │ Reserva de 10 min após  │ │ body-sm ink-muted
│  │ body-lg, máx. 68ch...                    │  │ clicar. Pagamento de    │ │
│  │                                          │  │ teste via Stripe.       │ │
│  │ Informações                              │  └─────────────────────────┘ │
│  │ Classificação · Acessibilidade do local  │                              │
│  └──────────────────────────────────────────┘                              │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Mobile

```text
┌──────────────────────────────┐
│ ‹ Voltar                ⤴    │ header simplificado: voltar + compartilhar
├──────────────────────────────┤
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ imagem 4:3 sangrada (sem margem)
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ Foto: Autor     [Demonstração]│
│                              │
│ SÁB, 14 MAR · 21:00          │
│ Nome do Evento em            │ h1 32px
│ Destaque                     │
│ 📍 Casa de Shows · SP        │
│                              │
│ Sobre o evento               │
│ Descrição...  Ler mais ▾     │ colapsa após 6 linhas
│                              │
│ Ingressos                    │ seletor completo inline
│ (•) Pista – Lote 1  R$ 80,00 │
│               [− 2 +]        │
│ ( ) Camarote       R$ 200,00 │
│                              │
├──────────────────────────────┤
│ 2 ingressos                  │ barra fixa inferior, z-sticky,
│ R$ 160,00 [Comprar ingresso] │ shadow-float, safe-area-inset
└──────────────────────────────┘
```

A barra fixa sempre mostra o total e o CTA; antes de selecionar um tipo, o CTA é "Ver ingressos" e rola até o seletor.

### 4.3 Checkout

Fluxo: **seleção na página do evento → reserva (10 min) → dados → pagamento → confirmação**. Exige login (ADR-0005); se o visitante não estiver logado, o login preserva a seleção.

#### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ vira●                                            🔒 Pagamento seguro       │ header de checkout:
├────────────────────────────────────────────────────────────────────────────┤ sem navegação
│  ✓ Ingressos ─── 2 Seus dados ─── 3 Pagamento        Reservado por 09:41   │
│                                                                            │
│  ┌──────────────────────────────────────┐   ┌─────────────────────────────┐│
│  │ Seus dados                           │   │ ▓▓▓ thumb   Nome do Evento  ││ resumo sticky
│  │ Nome            [Maria Souza       ] │   │             Sáb, 14 mar ·   ││
│  │ E-mail          [maria@exemplo.com ] │   │             21:00 · Local   ││
│  │ O ingresso será enviado para este    │   │ ─────────────────────────── ││
│  │ e-mail.                              │   │ Pista – Lote 1              ││
│  │                                      │   │ 2 × R$ 80,00     R$ 160,00  ││
│  │ Titulares                            │   │ ─────────────────────────── ││
│  │ Ingresso 1  [Maria Souza         ]   │   │ Total            R$ 160,00  ││ price 28px
│  │ Ingresso 2  [                    ]   │   │                             ││
│  │                                      │   │ Valores calculados pelo     ││
│  │ Pagamento                            │   │ servidor.                   ││
│  │ ┌──────────────────────────────────┐ │   └─────────────────────────────┘│
│  │ │ Stripe Payment Element (iframe)  │ │                                  │
│  │ │ Número · Validade · CVC          │ │                                  │
│  │ └──────────────────────────────────┘ │                                  │
│  │ ⓘ Modo de teste: use 4242 4242 ...   │                                  │ alert info
│  │                                      │                                  │
│  │ [        Pagar R$ 160,00         ]   │                                  │ primary lg
│  │ Ao pagar você concorda com os Termos │                                  │
│  └──────────────────────────────────────┘                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Mobile

```text
┌──────────────────────────────┐
│ ‹  Finalizar compra  🔒      │
├──────────────────────────────┤
│ Reservado por 09:41          │
│ ┌──────────────────────────┐ │
│ │ Nome do Evento        ▾  │ │ resumo colapsável no topo:
│ │ 2 ingressos · R$ 160,00  │ │ sempre visível o quê e quanto
│ └──────────────────────────┘ │
│ 2 Seus dados                 │
│ Nome                         │
│ [Maria Souza               ] │ campos 48px
│ E-mail                       │
│ [maria@exemplo.com         ] │
│ Titular do ingresso 1        │
│ [Maria Souza               ] │
│ Titular do ingresso 2        │
│ [                          ] │
│ [       Continuar          ] │
├──────────────────────────────┤
│ 3 Pagamento                  │ etapa seguinte na mesma página,
│ [ Stripe Payment Element  ]  │ revelada após "Continuar"
│ [    Pagar R$ 160,00     ]   │ CTA fixo no rodapé, safe-area
└──────────────────────────────┘
```

**Pós-pagamento:** tela "Confirmando pagamento…" → quando o webhook marca o pedido como `PAID`, redireciona para o ingresso com o feedback de sucesso. **Reserva expirada:** modal "Sua reserva expirou" com "Tentar de novo" (volta à página do evento com a seleção preservada se ainda houver estoque).

### 4.4 Ingresso

#### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ vira●       Explorar   Meus ingressos                          [Avatar]    │
├────────────────────────────────────────────────────────────────────────────┤
│ ‹ Meus ingressos                                                           │
│ ┌────────────────────────────────────┐   Pedido VIRA-ORD-3F8A              │
│ │ ▓▓▓▓▓▓▓▓ faixa da imagem ▓▓▓▓▓▓▓▓▓ │   Pago em 10/03/2026 · R$ 160,00    │
│ │ SÁB, 14 MAR 2026                   │                                     │
│ │ Nome do Evento                     │   Ingressos deste pedido            │
│ │ 21:00 – 02:00 · Casa de Shows      │   ● Maria Souza – Pista   (atual)   │
│ │ TITULAR       TIPO                 │   ○ João Lima – Pista               │
│ │ Maria Souza   Pista – Lote 1       │                                     │
│ ◖ - - - - - - - - - - - - - - - - - ◗│   [Tela cheia]  [Imprimir]          │
│ │          ┌────────────┐            │                                     │
│ │          │  QR 240px  │            │   Como chegar ↗                     │
│ │          └────────────┘            │                                     │
│ │         VIRA-7KQ2-M9XD             │                                     │
│ └────────────────────────────────────┘                                     │
│   ingresso: 480px de largura            coluna de contexto                 │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Mobile

```text
┌──────────────────────────────┐
│ ‹ Meus ingressos      1 de 2 │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ SÁB, 14 MAR 2026         │ │ faixa de imagem omitida no mobile
│ │ Nome do Evento           │ │ para o QR caber sem rolar
│ │ 21:00 · Casa de Shows    │ │
│ │ Maria Souza · Pista      │ │
│ ◖- - - - - - - - - - - - - ◗ │
│ │     ┌──────────────┐     │ │
│ │     │   QR 240px   │     │ │
│ │     └──────────────┘     │ │
│ │     VIRA-7KQ2-M9XD       │ │
│ └──────────────────────────┘ │
│  ‹ deslize para o próximo ›  │ ingressos do pedido em carrossel
│ [Tela cheia]   [Imprimir]    │ (com botões, não só gesto)
└──────────────────────────────┘
```

---

## 5. Conteúdo e dados da demo

Decisão registrada em [ADR-0010](adr/0010-dados-da-demo.md).

- A demo pública traz **alguns eventos de exemplo criados exclusivamente pelo seed**. Todos exibem o badge **"Demonstração"** no card e na página do evento, e a página do evento tem um alert `info`: "Este é um evento de demonstração. A compra usa o modo de teste do Stripe e nenhuma cobrança é feita."
- As fotos são de licença livre (Unsplash/Pexels), com **crédito ao autor** abaixo da imagem e no rodapé. O seed guarda autor, link e licença de cada foto.
- Esses eventos podem ser apagados a qualquer momento (`pnpm db:seed:demo --reset`).
- Fora do seed: **nada inventado.** Sem depoimentos, números de usuários, logos de parceiros, avaliações ou funcionalidades que não existem. Textos de interface descrevem só o que o produto faz.
- Tom de voz: direto, caloroso, em segunda pessoa ("você"), frases curtas, sem jargão técnico para o público. Datas por extenso no formato brasileiro ("sábado, 14 de março"), preços `R$ 80,00` via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

---

## 6. Checklist de acessibilidade

Meta: **WCAG 2.2 nível AA**. Verificado automaticamente com axe (Playwright) em todo PR de interface e manualmente com teclado e leitor de tela (NVDA + Firefox e VoiceOver + Safari iOS) nas jornadas críticas antes do v1.0.

### Percepção

- [ ] Todo par de cor de texto passa AA (tabela 2.1); o teste de tokens está verde.
- [ ] Componentes de interface e anel de foco têm ≥ 3:1 contra o fundo adjacente.
- [ ] Nenhuma informação depende só de cor (erros, estado do check-in, esgotado, selecionado).
- [ ] Toda imagem de evento tem `alt` descritivo (campo obrigatório no cadastro); imagens decorativas têm `alt=""`.
- [ ] O QR Code tem `aria-label`, e todos os dados do ingresso existem também como texto.
- [ ] Texto redimensionável até 200% sem perda; layout funciona em 320px de largura sem rolagem horizontal (reflow).
- [ ] Nenhum texto em imagem.

### Operação

- [ ] Tudo funciona só com teclado, em ordem lógica; sem armadilhas de foco (exceto modais, que prendem e devolvem o foco).
- [ ] Link "Pular para o conteúdo" é o primeiro elemento focável.
- [ ] Foco sempre visível (`:focus-visible`) e não encoberto pela barra fixa ou pelo header (`scroll-padding`).
- [ ] Alvos de toque ≥ 44×44px (≥ 48px no checkout); espaço entre alvos adjacentes ≥ 8px.
- [ ] O tempo da reserva é ajustável: aviso aos 2 min e opção "Manter reserva" (WCAG 2.2.1).
- [ ] Carrossel de ingressos operável por botões, não só por gesto (WCAG 2.5.1).
- [ ] Nenhum conteúdo pisca mais de 3 vezes por segundo; animações respeitam `prefers-reduced-motion`.

### Compreensão

- [ ] `lang="pt-BR"` no documento.
- [ ] Todo campo tem `<label>` visível; erros explicam como corrigir; `autocomplete` correto (`name`, `email`, `current-password`, `new-password`).
- [ ] Erros de formulário: resumo no topo + mensagem no campo + foco no primeiro inválido.
- [ ] O checkout mostra sempre o quê, quanto, qual evento e o próximo passo; nada muda de contexto sem ação do usuário.
- [ ] Ações destrutivas e de pagamento são confirmáveis e o botão diz o valor ("Pagar R$ 160,00").

### Robustez

- [ ] HTML semântico primeiro (`button`, `a`, `nav`, `main`, `h1`–`h3` em ordem); ARIA só quando necessário.
- [ ] Mudanças dinâmicas anunciadas: `aria-live="polite"` (quantidade, total, carregamento) e `assertive` (resultado do check-in, erro de pagamento).
- [ ] Estados de carregamento com `aria-busy`; botões em carregamento com `aria-busy` e texto atualizado.
- [ ] Páginas com `<title>` único e descritivo ("Nome do Evento · Vira").
- [ ] Playwright + axe sem violações `serious`/`critical` em: home, busca, página do evento, login, checkout, confirmação, ingresso, check-in, painel do organizador.

---

## 7. Implementação

- `packages/ui/src/tokens.css` — tokens como custom properties (fonte única).
- `packages/ui/src/theme.css` — `@theme` do Tailwind mapeando os tokens, mais os utilitários de movimento (`duration-*`, `ease-exit`) e de camada (`z-sticky` ... `z-toast`). Um teste garante que todo token é exposto e que o tema não referencia token inexistente.
- Regra de lint `vira/no-arbitrary-tailwind` (em `@vira/config`): rejeita valores arbitrários (`bg-[#...]`, `p-[13px]`, `h-(--x)`, `[mask-type:alpha]`) em `className` e em `cn`/`clsx`/`cva`. Variantes arbitrárias (`data-[state=open]:`) continuam permitidas, porque selecionam um estado e não um valor.
- `packages/ui/src/components/*` — componentes da seção 3, cada um com teste unitário (Vitest + Testing Library: variantes, estados, teclado, ARIA) e, na página de design system, teste E2E com axe. O pacote exporta o código-fonte (`src/index.ts`): o Next.js 16 transpila pacotes do workspace sozinho, então não há `transpilePackages` nem etapa de build. O `globals.css` do web declara `@source` apontando para `packages/ui/src`, porque o Tailwind não varre pacotes do workspace.
- **CSP e componentes.** Componente de interface não pode escrever `style` inline no HTML do servidor nem criar `<style>` sem nonce. Cada componente tem um teste que renderiza para string e falha se aparecer `style=`, e o E2E confere que a página inteira não gera violação de CSP. Os estilos que o Radix calcula no navegador (posição de menus, por exemplo) são aplicados pelo CSSOM, que a CSP permite. O travamento de rolagem do modal injeta um `<style>`; o layout do web entrega o nonce da requisição ao pacote por `<CspNonce>`, que o repassa ao `react-remove-scroll` e ao viewport do Select.
- Rota `/dev/design-system` (disponível só em desenvolvimento) mostrando tokens e componentes em todos os estados (hover, foco e pressionado, que o navegador não mantém parados, são desenhados com os mesmos tokens pelo modificador `!` do Tailwind, e os componentes continuam interativos) — base dos prints dos PRs de interface. Um build de produção só a serve com `VIRA_DESIGN_SYSTEM=true` (usado pelo E2E e pelo script de prints) e nunca na Vercel; a página tem `noindex`.
- PRs de interface **não alteram** regra de negócio, API, banco, autenticação, pagamento ou lógica de ingresso. Se uma tela precisar de um dado que não existe, o PR sinaliza a necessidade em vez de inventar.
- Modo escuro fica fora do MVP (marco Evolução); os tokens semânticos já permitem adicioná-lo sem tocar nos componentes.
