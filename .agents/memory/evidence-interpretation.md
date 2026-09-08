---
name: Evidence interpretation boundaries
description: Why case citations alone are insufficient grounding for scoring or assistant prose.
---

Require support for the specific factor and for both comparison endpoints.
A case-scoped citation, co-mention, or exact quoted substring does not validate an
unrelated metadata assertion or a model's accompanying interpretation.

**Why:** Review exposed a PGP score gaining points from an unrelated jointly
linked document, and an assistant could place an uncited factual assertion in an
"uncertainties" field. Merely checking that evidence IDs exist misses both failures.

**How to apply:** Treat every model-authored prose field as untrusted, including
warnings and gaps. The case assistant deliberately returns extractive,
source-marked findings and controlled gap messages instead of unchecked
paraphrases. Only introduce generated interpretation with a separately validated
grounding contract. Keep stylistic resemblance descriptive and do not score the
same lexical measurement under several factor names.

Keep safe supplied-data analysis useful without silently converting absence into
evidence: raw originals may be preserved before review, but extracted entities
and relationship suggestions require explicit investigator decisions.

**Why:** Preserving the original protects provenance; materializing its claims
would promote unreviewed content into the graph.

**How to apply:** New ingestion sources should preserve this distinction, and
review queues must remain reachable even after later analyses run.

Validate analysis renderers with populated and empty outputs produced by the
actual engine, not hand-written approximations of its JSON.

**Why:** A common typed response envelope does not validate each module's flexible
body. Repeated successful TypeScript checks hid crashes in wallet graphs,
relationship endpoints, and nested stylometry features.

**How to apply:** Pair engine-generated fixtures with real component rendering
when adding or changing a module. Check meaning as well as shape: exact monetary
strings, UTC labels, weekday indexing, unavailable scores, and evidence links.