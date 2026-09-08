---
name: Vercel deployment boundary
description: The agreed hosting split for deploying the ARGUS web frontend on Vercel.
---

Use Vercel for the Next.js frontend and same-origin rewrites only. Keep the Express security gateway, FastAPI worker, PostgreSQL, Redis and private evidence storage together on a persistent external host.

**Why:** The user chose the recommended hybrid architecture. ARGUS relies on leased background work, child-process document parsing and sealed object handling that should not be compressed into request-limited frontend functions.

**How to apply:** Browser requests remain relative `/api/*`; configure the server-only gateway origin in Vercel. Do not place backend secrets in Vercel or bypass the Express gateway by exposing FastAPI.