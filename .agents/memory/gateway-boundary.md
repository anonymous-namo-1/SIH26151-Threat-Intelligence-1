---
name: Gateway trust boundary
description: Why the evidence broker needs its own signed authority on the private API hop.
---

Treat public proxy access and verified upload-broker access as distinct authorities. Bind scope, request body digest, exact method/path/query, user and expiration in the signed hop; enforce upload-broker authority in FastAPI itself.

**Why:** Express can inspect an encoded path while ASGI routes its decoded form. A string-prefix denylist alone allowed percent-encoded broker routes to pass through the ordinary authenticated proxy.

**How to apply:** Preserve backend capability checks when adding internal routes, even if the gateway also rejects ambiguous public paths. Never expose presigned staging paths as finalized evidence originals.