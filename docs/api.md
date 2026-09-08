# API contract

The browser-facing reviewed OpenAPI file is:

```text
lib/api-spec/openapi.yaml
```

Generate the React client and Zod schemas with:

```sh
pnpm --filter @workspace/api-spec run codegen
```

FastAPI also generates a private runtime document at `http://127.0.0.1:8002/openapi.json` (and interactive docs at `/docs`). It describes Python routes under `/api/argus`; it must not be treated as a public endpoint or exposed through nginx. Compare it during API review, then deliberately update the checked-in gateway contract and regenerate clients.

Browser traffic uses same-origin `/api/argus/*`. Express authenticates it and proxies supported operations to Python. `/api/argus/storage/*` is a gateway-owned upload/download surface; internal `/uploads` endpoints are deliberately hidden from direct browser proxying.
