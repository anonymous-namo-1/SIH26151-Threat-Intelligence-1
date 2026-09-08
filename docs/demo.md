# Operation Nightglass demo

Operation Nightglass is an opt-in, per-user, entirely fictional case. It contains
NullRaven, CipherWolf, GreyMerchant, reserved domains and IP addresses,
deliberately invalid wallets and PGP identifiers, supplied posts/messages,
simulated transactions, timestamps, and accepted HUMAN-attributed relationships.
Every relationship cites one or more evidence records.

## Evidence-first walkthrough

1. Sign in and opt in to seed the case.
2. Open **Operation Nightglass** and search for **NullRaven**.
3. Inspect the persona and cited graph edges.
4. Follow the graph to CipherWolf and run persona correlation.
5. Review the score factors and their evidence citations.
6. Run contradiction analysis. `SAME_PERSON_AS` (H1) and `DISTINCT_FROM` (H2)
   are competing, cited analyst hypotheses; neither is a factual identity ruling.
7. Open the fictional wallet graph and supplied transaction timeline.
8. Review the broader case timeline.
9. If an assistant provider is configured, ask for an evidence-linked
   explanation. The underlying seed tests require no provider and validate that
   sufficient cited context exists.
10. Generate and inspect a cited investigation report.

`tests/backend/test_seed_service.py` uses disposable SQLite and checks seed
completeness, idempotence, and the data preconditions for all 14 requested demo
steps without calling live AI. The scenario does not identify real people,
contain valid keys/wallets, or reference exploitable/live infrastructure.

The intended web deployment is Vercel frontend plus same-origin rewrites to a
persistent external Express/FastAPI backend. External gateway DNS is unresolved;
this repository does not claim the demo is published.