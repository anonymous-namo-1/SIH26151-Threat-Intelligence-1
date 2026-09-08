# External Docker development

This is an **external developer recipe**, not a production deployment claim. It cannot be run or verified inside Replit. It uses PostgreSQL 16, Redis 7, Python 3.12, Node 24, the Express gateway, Next web app, and nginx at `http://localhost:8088`.

## Start a new local environment

```sh
cp docker/.env.example docker/.env
# Edit docker/.env; replace placeholders and do not commit it.
docker compose --env-file docker/.env -f docker/compose.yml build
docker compose --env-file docker/.env -f docker/compose.yml up -d postgres redis
docker compose --env-file docker/.env -f docker/compose.yml run --rm api \
  python -m apps.api.manage init-db --development
docker compose --env-file docker/.env -f docker/compose.yml up
```

`init-db --development` is a one-time manual command for a **new local development database only**. Do not run it against an existing or production database. There are intentionally no deployment DDL/migration commands here; Replit production schema publication uses its native flow.

After the Clerk account has been created and its subject is known, a trusted operator may bootstrap it:

```sh
docker compose --env-file docker/.env -f docker/compose.yml run --rm api \
  python -m apps.api.manage provision-admin --clerk-sub '<known-subject>'
```

The API container runs uvicorn on `0.0.0.0:8002` inside the private Compose network. The gateway uses `ARGUS_INTERNAL_HOST=api` and reaches it by service name; only nginx port 8088 is published. The gateway runs `dist/index.mjs` directly. It does not use Replit's composite `run.mjs`, so Python is started exactly once by the API service.

## Known parity and security limitations

- Replit Object Storage obtains credentials and signed URLs from a sidecar at `127.0.0.1:1106`. No external GCS adapter exists, so original-file upload/download does not work in this Docker setup. Do not add or copy Replit credentials into images.
- `Dockerfile.api` installs exactly `apps/api/requirements.txt`. OpenAI-compatible summarization requires that manifest to include its optional client as well as provider variables; deterministic analysis does not require provider credentials.
- Clerk keys and a matching gateway/API `SESSION_SECRET` are required. Passwords remain Clerk-managed. MFA can be configured in the auth architecture but is not forced by ARGUS.
- Port 8088 is plain HTTP for local development. Production needs TLS, hardened proxy/trust configuration, secret management, IAM, backups, monitoring, retention review, and an independently reviewed deployment design.
- This recipe does not deploy, initialize production data, run crawlers, provide OCR, Neo4j, semantic embeddings, or a tamperproof external audit log.

Stop with:

```sh
docker compose --env-file docker/.env -f docker/compose.yml down
```

Add `-v` only when you intentionally want to destroy local PostgreSQL and Redis volumes.
