# Security, RBAC, and case boundaries

Clerk authenticates users and manages passwords; ARGUS never stores password hashes. The gateway validates the Clerk session, rejects cross-origin state-changing requests, applies a 180 requests/minute per-user limit, and signs the private request. MFA is supported architecturally through Clerk policy/configuration but ARGUS does **not** force MFA today.

New authenticated subjects are provisioned as active `INVESTIGATOR`s on first API use. A trusted operator can bootstrap an administrator only after an account exists/its Clerk subject is known:

```sh
python -m apps.api.manage provision-admin --clerk-sub <known-clerk-subject>
```

The CLI action is audited. Admin APIs prevent removing or disabling the final active administrator.

## Permission matrix

| Permission | Admin | Lead investigator | Investigator | Analyst | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Create case | ✓ | ✓ | ✓ | — | — |
| Edit case/entities/graph | ✓ | ✓ | ✓ | — | — |
| Delete case | ✓ | ✓ | — | — | — |
| Write evidence | ✓ | ✓ | ✓ | ✓ | — |
| Run analysis | ✓ | ✓ | ✓ | ✓ | — |
| Write/export reports | ✓ | ✓ | ✓ | — | — |
| Manage users | ✓ | — | — | — | — |
| Read visible records | ✓ | ✓ | ✓ | ✓ | ✓ |

Admin and lead investigator can see all cases. Other roles see only cases they created or are assigned to. Entity, evidence, relationship, job, report, view, timeline, audit and graph endpoints resolve that case visibility before returning data. Cross-case entity/evidence references and report citations are rejected. Unauthorized resources generally appear as `404` to limit discovery.

## Deployment review points

Keep Python private; rotate and share `SESSION_SECRET` only between gateway/API; require TLS and secure proxy headers in production; configure Clerk allowed origins/session policy/MFA as organizational policy requires; restrict database and object-store IAM; back up and monitor audit data; review retention and deletion law. Local nginx uses HTTP on port 8088 solely for development and needs a production TLS/security review.
