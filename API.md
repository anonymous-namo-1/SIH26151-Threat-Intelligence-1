# ARGUS API

Browser clients call same-origin `/api/argus/*`. Express is the public security
boundary and forwards supported requests to private FastAPI using an HMAC-bound
identity, HTTP method, exact path/query, scope, expiry, and body digest.

The reviewed browser contract is [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml).
After an intentional contract change:

```sh
pnpm --filter @workspace/api-spec run codegen
```

FastAPI's generated `/openapi.json` documents its private upstream only. Do not
expose FastAPI or internal upload-finalization routes directly. Health and
readiness endpoints are served through the configured gateway surface; case,
entity, evidence, relationship, analysis, assistant, report, search, and audit
operations are case-authorized in Python.

See [docs/api.md](docs/api.md) for contract boundaries. This document does not
assert that a production API or external gateway DNS name has been published.