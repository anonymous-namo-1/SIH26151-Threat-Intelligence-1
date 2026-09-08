# ARGUS Security

- Keep Clerk secret keys, `SESSION_SECRET`, database/Redis credentials, provider
  keys, and storage credentials server-side.
- The browser must use Express; never expose or call FastAPI directly.
- Express verifies sessions, mutation origins, request limits, and upload policy.
  FastAPI independently verifies signed request scope and case-level RBAC.
- Validate type, MIME, size, path, and digest for evidence uploads. Store originals
  privately and preserve hashes/provenance.
- Treat imported and AI-generated claims as untrusted drafts until reviewed.
  Conclusions and accepted relationships require specific citations.
- Never commit `.env`, evidence, personal data, exports, or local databases.

Audit rows provide application accountability but remain mutable by database
administrators; they are not an external tamperproof ledger. Report suspected
issues privately to repository maintainers rather than including sensitive
details in a public issue. See [docs/security.md](docs/security.md).