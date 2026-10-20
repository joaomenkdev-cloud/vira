/**
 * What `pnpm db:seed:demo` puts in the database (ADR-0010): one organizer and a few
 * example events, all marked `is_demo`. Venues and line-ups are made up; the photos are
 * real, free-licensed (Unsplash License) and always credited.
 */

/** A free-licensed photo and the credit shown under it. */
export interface DemoPhoto {
  /** Where the seed downloads it: an Unsplash image cropped to 3:2, the card's proportion. */
  readonly sourceUrl: string;
  readonly alt: string;
  readonly credit: { readonly author: string; readonly url: string; readonly license: string };
}

export interface DemoTicketType {
  /** Stable name of the row: the id is derived from it, so a second run updates it. */
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly priceCents: number;
  readonly capacity: number;
  readonly maxPerOrder: number;
  /** Sales open this many days before the event starts (default: on sale now). */
  readonly salesStartDaysBefore?: number;
  /** Sales close this many days before the event starts (default: when it ends). */
  readonly salesEndDaysBefore?: number;
}

export interface DemoEvent {
  /** Stable name of the row: the id is derived from it, so a second run updates it. */
  readonly key: string;
  /** Ends in `-demo`: event slugs made by the API end in a 6-character suffix instead. */
  readonly slug: string;
  readonly title: string;
  readonly descriptionMd: string;
  readonly timezone: string;
  /**
   * When it happens, relative to the day the seed runs, so the demo never shows past
   * events: the first `weekday` (0 = Sunday) at least `minDaysAhead` days from today,
   * at `startTime` in the event's zone.
   */
  readonly schedule: {
    readonly minDaysAhead: number;
    readonly weekday: number;
    readonly startTime: `${number}:${number}`;
    readonly durationMinutes: number;
  };
  readonly venue: {
    readonly name: string;
    readonly address: string;
    readonly city: string;
    readonly state: string;
  };
  readonly photo: DemoPhoto;
  readonly ticketTypes: readonly DemoTicketType[];
}

export const DEMO_ORGANIZER = {
  /** `.invalid` never receives mail (RFC 2606): nobody can sign in as this account. */
  email: "demo@vira.invalid",
  name: "Vira Demonstração",
  displayName: "Vira Demonstração",
  slug: "vira-demonstracao",
} as const;

const UNSPLASH_LICENSE = "Licença Unsplash";

/** imgix parameters: JPEG, 2400 × 1600 cropped around the busiest area. */
const unsplashImage = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?fm=jpg&q=85&w=2400&h=1600&fit=crop&crop=entropy`;

const MEIA_ENTRADA =
  "Estudantes, pessoas com 60 anos ou mais e pessoas com deficiência, com documento na entrada.";

export const DEMO_EVENTS: readonly DemoEvent[] = [
  {
    key: "jazz-night",
    slug: "noite-de-jazz-no-porao-demo",
    title: "Noite de Jazz no Porão",
    descriptionMd: [
      "Um quarteto de jazz instrumental toca standards e composições próprias em duas sessões, com intervalo para o bar.",
      "",
      "### Como funciona",
      "",
      "- Casa aberta uma hora antes do show.",
      "- Mesas por ordem de chegada; o ingresso de mesa garante um lugar sentado.",
      "- Classificação: 18 anos.",
    ].join("\n"),
    timezone: "America/Sao_Paulo",
    schedule: { minDaysAhead: 3, weekday: 5, startTime: "21:00", durationMinutes: 180 },
    venue: {
      name: "Porão da Vila",
      address: "Rua Harmonia, 150 – Vila Madalena",
      city: "São Paulo",
      state: "SP",
    },
    photo: {
      sourceUrl: unsplashImage("photo-1541804627596-3b5b9ef58c93"),
      alt: "Banda tocando ao vivo num palco iluminado",
      credit: {
        author: "Alex Zamora",
        url: "https://unsplash.com/photos/band-playing-musical-instruments-FU1KddSIIR4",
        license: UNSPLASH_LICENSE,
      },
    },
    ticketTypes: [
      { key: "inteira", name: "Inteira", priceCents: 8000, capacity: 120, maxPerOrder: 6 },
      {
        key: "meia",
        name: "Meia-entrada",
        description: MEIA_ENTRADA,
        priceCents: 4000,
        capacity: 60,
        maxPerOrder: 2,
      },
      {
        key: "mesa",
        name: "Mesa para quatro",
        description: "Quatro lugares sentados em uma mesa perto do palco.",
        priceCents: 36000,
        capacity: 15,
        maxPerOrder: 1,
      },
    ],
  },
  {
    key: "theater-play",
    slug: "o-inventario-das-coisas-perdidas-demo",
    title: "O Inventário das Coisas Perdidas",
    descriptionMd: [
      "Uma comédia dramática sobre três irmãos que passam uma noite esvaziando a casa onde cresceram e encontram, em cada gaveta, uma versão diferente da mesma história.",
      "",
      "Duração: 90 minutos, sem intervalo. Classificação: 12 anos.",
    ].join("\n"),
    timezone: "America/Sao_Paulo",
    schedule: { minDaysAhead: 10, weekday: 6, startTime: "20:00", durationMinutes: 90 },
    venue: {
      name: "Teatro da Praça",
      address: "Avenida Afonso Pena, 1500 – Centro",
      city: "Belo Horizonte",
      state: "MG",
    },
    photo: {
      sourceUrl: unsplashImage("photo-1539964604210-db87088e0c2c"),
      alt: "Palco e plateia vazia de um teatro",
      credit: {
        author: "Annie Tray-Gavin",
        url: "https://unsplash.com/photos/theater-interior-lQTf50hbg2Y",
        license: UNSPLASH_LICENSE,
      },
    },
    ticketTypes: [
      { key: "plateia", name: "Plateia", priceCents: 9000, capacity: 200, maxPerOrder: 6 },
      {
        key: "plateia-meia",
        name: "Plateia – meia-entrada",
        description: MEIA_ENTRADA,
        priceCents: 4500,
        capacity: 80,
        maxPerOrder: 2,
      },
      {
        key: "balcao",
        name: "Balcão",
        description: "Lugares no andar de cima, com visão de todo o palco.",
        priceCents: 5000,
        capacity: 100,
        maxPerOrder: 6,
      },
    ],
  },
  {
    key: "concert",
    slug: "ondas-eletricas-ao-vivo-demo",
    title: "Ondas Elétricas ao vivo",
    descriptionMd: [
      "A banda de rock eletrônico Ondas Elétricas apresenta o disco novo na íntegra, com projeções e iluminação pensadas para o show.",
      "",
      "### Informações",
      "",
      "- Abertura dos portões às 19h; show às 21h.",
      "- Proibida a entrada com garrafas e objetos de vidro.",
      "- Classificação: 16 anos; menores só com responsável.",
    ].join("\n"),
    timezone: "America/Sao_Paulo",
    schedule: { minDaysAhead: 20, weekday: 6, startTime: "21:00", durationMinutes: 150 },
    venue: {
      name: "Arena Sul",
      address: "Avenida Ipiranga, 6000 – Partenon",
      city: "Porto Alegre",
      state: "RS",
    },
    photo: {
      sourceUrl: unsplashImage("photo-1663668566893-7a4887f9a41d"),
      alt: "Público diante de um palco com luzes azuis de LED",
      credit: {
        author: "Marcel Strauß",
        url: "https://unsplash.com/photos/a-crowd-of-people-watching-a-stage-with-lights-V-pSsJdyHs4",
        license: UNSPLASH_LICENSE,
      },
    },
    ticketTypes: [
      { key: "pista", name: "Pista", priceCents: 15000, capacity: 2000, maxPerOrder: 6 },
      {
        key: "pista-meia",
        name: "Pista – meia-entrada",
        description: MEIA_ENTRADA,
        priceCents: 7500,
        capacity: 800,
        maxPerOrder: 2,
      },
      {
        key: "camarote",
        name: "Camarote",
        description: "Área elevada com bar próprio e banheiros exclusivos.",
        priceCents: 32000,
        capacity: 150,
        maxPerOrder: 4,
      },
    ],
  },
  {
    key: "festival",
    slug: "festival-mare-alta-demo",
    title: "Festival Maré Alta",
    descriptionMd: [
      "Dois palcos à beira-mar com bandas independentes do Nordeste, feira de artesanato e comida regional.",
      "",
      "### Programação",
      "",
      "- **Sábado:** a partir das 14h, até as 2h.",
      "- **Domingo:** a partir das 14h, até as 23h.",
      "",
      "O passaporte vale para os dois dias. Traga protetor solar e uma garrafa reutilizável: há pontos de água gratuitos.",
    ].join("\n"),
    timezone: "America/Recife",
    schedule: { minDaysAhead: 35, weekday: 6, startTime: "14:00", durationMinutes: 33 * 60 },
    venue: {
      name: "Parque da Orla",
      address: "Avenida Boa Viagem, s/n – Boa Viagem",
      city: "Recife",
      state: "PE",
    },
    photo: {
      sourceUrl: unsplashImage("photo-1761926826313-a1787661b7b6"),
      alt: "Multidão num festival de música ao ar livre",
      credit: {
        author: "Lizgrin F",
        url: "https://unsplash.com/photos/crowd-gathered-at-an-outdoor-music-festival-D62FR9Fbdy8",
        license: UNSPLASH_LICENSE,
      },
    },
    ticketTypes: [
      {
        key: "passaporte",
        name: "Passaporte – 2 dias",
        priceCents: 32000,
        capacity: 3000,
        maxPerOrder: 6,
      },
      {
        key: "passaporte-meia",
        name: "Passaporte – meia-entrada",
        description: MEIA_ENTRADA,
        priceCents: 16000,
        capacity: 1000,
        maxPerOrder: 2,
      },
      { key: "sabado", name: "Só sábado", priceCents: 18000, capacity: 1500, maxPerOrder: 6 },
    ],
  },
  {
    key: "conference",
    slug: "conferencia-codigo-e-produto-demo",
    title: "Conferência Código & Produto",
    descriptionMd: [
      "Um dia de palestras e oficinas sobre engenharia de software, design de produto e acessibilidade, para quem constrói produtos digitais.",
      "",
      "### Inclui",
      "",
      "- Duas trilhas de palestras e uma sala de oficinas.",
      "- Almoço e café nos intervalos.",
      "- Certificado de participação.",
      "",
      "O segundo lote abre quando o primeiro fecha, três semanas antes do evento.",
    ].join("\n"),
    timezone: "America/Sao_Paulo",
    schedule: { minDaysAhead: 50, weekday: 4, startTime: "09:00", durationMinutes: 9 * 60 },
    venue: {
      name: "Centro de Convenções Beira-Mar",
      address: "Avenida Beira-Mar Norte, 2000 – Centro",
      city: "Florianópolis",
      state: "SC",
    },
    photo: {
      sourceUrl: unsplashImage("photo-1762968274962-20c12e6e8ecd"),
      alt: "Palestrante apresentando num palco para um auditório cheio",
      credit: {
        author: "Carlos Gil",
        url: "https://unsplash.com/photos/speaker-presenting-on-stage-to-an-audience-AsxOJcsaR4g",
        license: UNSPLASH_LICENSE,
      },
    },
    ticketTypes: [
      {
        key: "lote-1",
        name: "Primeiro lote",
        priceCents: 45000,
        capacity: 300,
        maxPerOrder: 10,
        salesEndDaysBefore: 21,
      },
      {
        key: "lote-2",
        name: "Segundo lote",
        priceCents: 60000,
        capacity: 300,
        maxPerOrder: 10,
        salesStartDaysBefore: 21,
      },
      {
        key: "estudante",
        name: "Estudante",
        description: "Com comprovante de matrícula apresentado no credenciamento.",
        priceCents: 18000,
        capacity: 80,
        maxPerOrder: 1,
      },
    ],
  },
];
