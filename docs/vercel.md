# Vercel frontend deployment

ARGUS uses a hybrid production topology:

```text
Browser
  └─ Vercel: Next.js web
       └─ same-origin /api/* rewrite
            └─ external HTTPS Express gateway
                 ├─ private FastAPI service + durable worker
                 ├─ PostgreSQL
                 ├─ Redis
                 └─ private object storage
```

Do not deploy `artifacts/api-server/run.mjs` as a Vercel Function. It supervises
long-running Python and Redis processes. Evidence parsing, sealed originals and
leased analysis jobs also require the persistent backend topology.

## Vercel project settings

1. Import the repository as a Vercel project. The repository-root `vercel.json`
   explicitly selects Next.js and filters the build to the web package, so an
   import that starts with Root Directory `./` will not run the workspace-wide
   build.
2. Set **Root Directory** to `artifacts/sih26151-intelligence` when the Vercel
   project settings are available. This is the preferred configuration.
3. Enable **Include source files outside of the Root Directory**. The web package
   imports the generated workspace client from `lib/api-client-react`.
4. Keep Framework Preset as **Next.js**. The nested `vercel.json` runs the
   workspace-aware pnpm install and filtered build when the frontend directory is
   used as the Root Directory.
5. Use Node.js 24 and deploy from the lockfile. Do not use npm or regenerate the
   lockfile during the build.

Both supported imports build the same application:

| Vercel Root Directory | Configuration used | Build scope |
|---|---|---|
| `./` | `/vercel.json` | Only `@workspace/sih26151-intelligence` |
| `artifacts/sih26151-intelligence` | Nested `vercel.json` | Only `@workspace/sih26151-intelligence` |

Do not override the Build Command with `pnpm run build` in the Vercel dashboard.
At repository root that command intentionally builds every workspace project,
including the Replit-only mockup sandbox.

## Vercel environment variables

Set these separately for Preview and Production:

| Name | Value |
|---|---|
| `ARGUS_GATEWAY_URL` | HTTPS origin of the persistent Express gateway, without `/api` |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key configured for this environment |
| `CLERK_PROXY_URL` | `/api/__clerk` |

`ARGUS_GATEWAY_URL` is server-only: it is consumed by `next.config.mjs` to create
the rewrite and is not shipped as a public browser variable. A Vercel build fails
explicitly if this value is missing or is not HTTPS.

Do **not** add `CLERK_SECRET_KEY`, `SESSION_SECRET`, database credentials, Redis
credentials, AI provider credentials, or object-storage credentials to Vercel.
Those belong only on the persistent backend.

## Gateway configuration

The external gateway must:

- be available over HTTPS;
- receive the original `Origin`, `X-Forwarded-Host`, and `X-Forwarded-Proto`
  headers from the Vercel rewrite;
- use the same Clerk instance as the frontend;
- keep `SESSION_SECRET`, FastAPI, PostgreSQL, Redis and storage private;
- allow the Vercel production domain and intended preview domains in its ingress
  policy without using a wildcard CORS policy;
- never expose FastAPI or internal `/api/argus/uploads` routes directly.

ARGUS itself remains same-origin in the browser: frontend code calls `/api/*`.
Vercel rewrites those requests instead of revealing a separate API base URL.
The gateway still performs Clerk authentication, mutation-origin checks, signed
broker capabilities, rate limiting and case-level authorization.

## Clerk and domains

Configure the Vercel production domain and approved preview-domain strategy in
Clerk. The frontend uses `/api/__clerk`, which is rewritten to the gateway so the
existing Clerk proxy remains the authentication boundary. Test sign-in, sign-out,
session refresh and OAuth callback URLs on the final custom domain before use.

## Caching and regions

- Authenticated `/api/*` responses retain the gateway's `no-store` policy. Do not
  enable rewrite caching for case, evidence, graph, report or audit data.
- Vercel may cache immutable Next.js assets normally.
- Place the Vercel project near the persistent gateway and database to reduce
  latency. The gateway, worker, PostgreSQL, Redis and object storage should be
  colocated with one another.

## Deployment checks

Run locally before pushing:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
ARGUS_GATEWAY_URL=https://gateway.example.invalid \
  VERCEL=1 pnpm --filter @workspace/sih26151-intelligence run build
```

Use a real authorized HTTPS gateway for end-to-end checks; the reserved
`example.invalid` value above validates build configuration only. After deploy,
verify the public landing page, Clerk session establishment, a case reload,
evidence upload/finalization, deterministic extraction, saved graph view, cited
report export, role denial and signed-out API denial.