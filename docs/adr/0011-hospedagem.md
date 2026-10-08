# ADR-0011: Hospedagem com Vercel, Render, Neon, Upstash e Cloudflare R2

- **Status:** Aceito — o armazenamento local (MinIO) foi substituído pelo [ADR-0012](0012-armazenamento-local-seaweedfs.md)
- **Data:** 2026-10-07

## Contexto

A demo pública precisa ser barata (idealmente gratuita), confiável o bastante para um portfólio e reproduzível a partir do repositório. O planejamento inicial deixou em aberto **Render ou Railway** para a API e o worker.

## Decisão

- **Web:** Vercel (Next.js, previews por PR).
- **API e worker:** **Render**, com o serviço web e o background worker descritos em `render.yaml` (blueprint versionado no repositório).
- **Banco:** Neon (PostgreSQL 16).
- **Redis:** Upstash (BullMQ e rate limit).
- **Imagens:** Cloudflare R2 (bucket privado, compatível com S3); MinIO no ambiente local (substituído por SeaweedFS no ADR-0012).
- **E-mail:** Resend; Mailpit no ambiente local.
- **Modo de custo zero:** com `WORKER_MODE=embedded`, os consumidores do worker sobem dentro do processo da API, para quando o plano gratuito não incluir background workers. O padrão é `separate`.
- **Deploy só com autorização explícita** do mantenedor; nenhum deploy automático da `main` no MVP.

## Alternativas consideradas

- **Railway** — boa experiência e worker simples, mas cobrança por uso sem plano gratuito permanente; o blueprint declarativo do Render também documenta a infraestrutura no repositório.
- **Fly.io** — flexível, mas exige mais operação (máquinas, volumes) do que o projeto precisa.
- **Tudo na Vercel** — a API NestJS rodaria, mas o worker de longa duração com filas BullMQ não se encaixa bem em funções.

## Consequências

- Infraestrutura descrita em código (`render.yaml`, configuração do projeto na Vercel, `.env.example`).
- O plano gratuito do Render hiberna serviços ociosos: a primeira requisição após inatividade é lenta. Aceitável para uma demo e documentado no README.
- BullMQ sobre Upstash consome comandos por polling; os intervalos dos jobs repetíveis são calibrados para caber no plano gratuito.
