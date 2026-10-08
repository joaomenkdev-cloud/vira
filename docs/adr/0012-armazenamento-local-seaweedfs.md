# ADR-0012: SeaweedFS como armazenamento S3 local

- **Status:** Aceito — substitui a parte do [ADR-0011](0011-hospedagem.md) que previa MinIO no ambiente local
- **Data:** 2026-10-08

## Contexto

O ADR-0011 previa o MinIO como substituto local do Cloudflare R2. Ao montar o `docker-compose.yml` (entrega F4), o repositório `minio/minio` não existe mais no Docker Hub: a edição community do MinIO deixou de publicar imagens e binários. Usar uma imagem antiga fixada significaria rodar software sem correções de segurança, e compilar a partir do código-fonte deixaria o setup local pesado.

O ambiente local só precisa da API S3 com URLs pré-assinadas (entrega N9), autenticação por chave e bucket privado. Produção continua no R2.

## Decisão

- Usar **SeaweedFS** (`chrislusf/seaweedfs`, Apache 2.0, versão fixada) com o gateway S3 no `docker-compose.yml`, porta `127.0.0.1:8333`.
- Credenciais só locais em `infra/seaweedfs/s3.json`, espelhadas no `.env.example` e na allowlist exata do gitleaks.
- O código fala apenas S3 (porta `ObjectStorage`, ADR-0002); trocar SeaweedFS ↔ R2 é só configuração.

## Alternativas consideradas

- **Imagem antiga do MinIO** — sem atualizações de segurança; descartada.
- **RustFS** — compatível com S3 e ativo, mas mais jovem; o SeaweedFS tem mais tempo de uso em produção.
- **Garage** — leve, mas exige passos manuais de layout do cluster antes do primeiro uso.
- **LocalStack** — emula muito mais do que precisamos e parte dos recursos exige conta.
- **Usar o R2 direto no desenvolvimento** — exige conta e credenciais reais para rodar o projeto, contrariando o setup local sem segredos.

## Consequências

- `pnpm infra:up` sobe Postgres, Redis, SeaweedFS e Mailpit sem conta em nenhum serviço.
- O job "Local infrastructure" do CI sobe o Compose e aplica as migrations, provando os healthchecks e as imagens.
- Diferenças de comportamento entre SeaweedFS e R2 (cabeçalhos, políticas de bucket) precisam ser cobertas pelos testes da entrega N9.
