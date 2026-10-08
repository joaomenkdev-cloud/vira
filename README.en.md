<!-- Logo placeholder: added in delivery N1 (visual foundation) as docs/assets/logo.svg -->

<h1 align="center">Vira</h1>

<p align="center">
  Open source event ticketing platform.<br>
  <a href="README.md">Leia em português</a>
</p>

<p align="center">
  <a href="https://github.com/joaomenkdev-cloud/vira/actions/workflows/ci.yml"><img src="https://github.com/joaomenkdev-cloud/vira/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0B0B0C" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/status-under%20construction-D92D3A" alt="Status: under construction">
</p>

> **Under construction.** The project is in its planning phase: architecture, data model, security model and design system are documented, and code starts with the next milestone. Follow along in the [roadmap](docs/ROADMAP.md) and the [progress log](PROGRESS.md) (both in Portuguese).

## What it is

Organizers publish events, people discover them and buy tickets, receive a **digital ticket with a QR code**, and the organizer validates the QR at the door.

Vira is a portfolio project built as if it were going to production: layered architecture, security and data protection (Brazil's LGPD) designed in from the first commit, and a visual identity of its own.

**The demo never moves real money:** payments run in Stripe test mode.

## Technical highlights

- **Race-proof inventory:** 10-minute reservations with an atomic conditional update and a database `CHECK`; tested with concurrent purchases of the last seat.
- **Reliable payments:** an order becomes paid only through a signature-verified Stripe webhook; webhooks are processed exactly once; order creation takes an idempotency key.
- **Unforgeable tickets:** the QR code carries an HMAC-signed token, never a guessable id; single-use check-in.
- **Secure by default:** OWASP ASVS level 2 and the API Security Top 10 as references, authorization tested on every route, rotating refresh tokens with reuse detection.
- **Privacy:** only the buyer's name and email and the ticket holder's name; data export and account deletion; no personal data in logs.

## Stack

| Layer | Technologies |
| --- | --- |
| Monorepo | TypeScript, pnpm workspaces, Turborepo |
| API | NestJS (modular monolith), Zod, OpenAPI, RFC 9457 |
| Data | PostgreSQL 16, Prisma, Redis, BullMQ |
| Web | Next.js (App Router), Tailwind CSS, custom design system on top of shadcn/ui |
| Payments | Stripe (test mode) — Payment Intents and webhooks |
| Infra | Cloudflare R2, Resend, Sentry; Vercel, Render, Neon, Upstash |
| Testing | Vitest, Supertest, Testcontainers, Stripe CLI, Playwright + axe |
| Quality | GitHub Actions, CodeQL, Dependabot, gitleaks, Conventional Commits |

## Screenshots

<!-- Desktop and mobile screenshots arrive with the first screens (Core milestone). -->

| Home | Event page | Ticket |
| --- | --- | --- |
| _coming soon_ | _coming soon_ | _coming soon_ |

## Roadmap at a glance

| Milestone | Scope | State |
| --- | --- | --- |
| 0. Foundation | Planning, tooling, API/worker/web skeletons, audit log | In progress |
| 1. Core | Design system, authentication, events, storefront, organizer dashboard | Planned |
| 2. MVP v1.0 | Reservations, Stripe, tickets, check-in, LGPD rights, demo deployment | Planned |
| 3. Evolution | Free events, refunds, Pix, offline check-in, dark mode and more | Ideas |

## Documentation

Technical documentation is written in Portuguese.

| Document | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Components, modules, layers and purchase flow |
| [Data model](docs/DATA_MODEL.md) | Entities, indexes, state machines and personal data |
| [API](docs/API.md) | Endpoints, roles and responses |
| [Security model](docs/SECURITY_MODEL.md) | STRIDE, controls and ASVS checklist |
| [Privacy](docs/PRIVACY.md) | LGPD inventory, retention and data subject rights |
| [Design system](docs/DESIGN.md) | Tokens, components, wireframes and accessibility |
| [ADRs](docs/adr/) | Architecture decision records |

## Running it

There is no runnable code yet. Local setup instructions (Docker with Postgres, Redis, MinIO and Mailpit) arrive in roadmap delivery F4.

```bash
corepack enable
pnpm install
pnpm lint:md
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Security issues: follow the [security policy](SECURITY.md) and never open a public issue.

## License

[MIT](LICENSE)
