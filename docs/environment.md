# Environment variable reference

This page lists names and purposes only. Keep values in Replit Secrets or an uncommitted local `.env`; never put credentials in documentation or images.

| Name | Consumer | Purpose |
|---|---|---|
| `DATABASE_URL` | FastAPI | SQLAlchemy database connection |
| `REDIS_URL` | FastAPI/worker | Optional job notifications/cache invalidation |
| `SESSION_SECRET` | gateway and FastAPI | HMAC secret for the private identity hop |
| `ARGUS_INTERNAL_PORT` | gateway and FastAPI | Private Python listen/target port |
| `ARGUS_INTERNAL_HOST` | gateway | Private Python target host |
| `ARGUS_ANALYSIS_WORKER` | FastAPI | Enable the in-process queue worker |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | analysis | Optional OpenAI-compatible endpoint |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | analysis | Optional provider credential |
| `PORT` | gateway or web process | Public process listen port |
| `NODE_ENV` | gateway/web | Runtime mode |
| `LOG_LEVEL` | gateway | Logging threshold |
| `CLERK_PUBLISHABLE_KEY` | gateway | Clerk public application key |
| `CLERK_SECRET_KEY` | gateway | Clerk server credential |
| `CLERK_PROXY_URL` | Clerk client integration | Auth proxy URL where used |
| `VITE_CLERK_PUBLISHABLE_KEY` | web compatibility fallback | Browser Clerk public key |
| `VITE_CLERK_PROXY_URL` | web compatibility fallback | Browser Clerk proxy URL |
| `PRIVATE_OBJECT_DIR` | gateway | Replit private object path |
| `PUBLIC_OBJECT_SEARCH_PATHS` | gateway | Replit public object search paths |

Docker Compose additionally asks for `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` to initialize its local PostgreSQL container. They are Docker-development inputs, not application defaults.