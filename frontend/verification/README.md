# Argus frontend verification

The screenshots in this directory were captured in Chrome and visually inspected during implementation.

- `desktop-dashboard.png`: default graph and case inspector at 1440×1000.
- `desktop-inspector-moved.png`: selected actor after dragging and resizing the inspector.
- `desktop-relationship-evidence.png`: an edge's supporting evidence.
- `mobile-dashboard.png`, `mobile-inspector.png`: graph and scrollable inspector at 390×844.
- `tablet-dashboard.png`, `tablet-inspector.png`: graph and inspector at 768×1024.
- `mobile-ingest.png`, `mobile-ai-profile.png`, `mobile-report.png`: supporting mobile views.
- `live-api-graph.png`, `live-api-error.png`: isolated FastAPI integration and explicit API failure handling.

All 11 Playwright tests passed. TypeScript, the production webpack build, and Prettier checks passed. Live verification used a temporary SQLite database and exercised case creation, all five ingestion endpoints (HTTP 201), graph/entity/evidence/profile/findings reads, and an HTTP 503 error with no demo fallback. The local backend test process was stopped afterward.

Rerun the browser suite from `frontend/` with `npm run test:e2e`. See the root README for browser installation and live-mode configuration.
