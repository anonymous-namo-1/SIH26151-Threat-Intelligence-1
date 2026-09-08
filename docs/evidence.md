# Evidence, citations, and uncertainty

ARGUS is a workbench, not a collector. Import only investigator-supplied material or public material the organization is legally authorized to process. There are no crawlers and parsing does not fetch URLs.

Evidence records preserve source, collection time, collector, notes, reliability, linked entities, parsed content and SHA-256. Direct text evidence hashes UTF-8 content. For files, the digest is always over the original raw bytes, not extracted text. The Replit upload broker checks size, pins the uploaded object generation while reading, and parses a copy in a memory/time-bounded child process. Finalization writes the raw bytes to a new sealed UUID object with a create-only generation precondition; only this never-presigned sealed path and raw-byte digest are committed to evidence. If API finalization fails, the broker removes the new sealed object.

Downloads read the sealed original, recompute SHA-256 over its raw bytes, and refuse delivery with an integrity error if it differs from the evidence digest. These controls preserve a byte-level invariant but do not by themselves establish legal chain of custody; operators must document acquisition authority, source context, handling, time synchronization, retention and exports.

Relationships require at least one evidence ID from the same case. Reports may cite only same-case evidence and exports include an explicit hypothesis warning. AI summaries accept bounded supplied evidence, validate returned IDs, label output `untrusted_draft`, list uncertainties, and require human review.

Confidence values have narrow meanings:

- extraction confidence: certainty that syntax matched an indicator;
- relationship confidence: strength of the stated evidence-backed link;
- comparison score: bounded similarity of observable factors;
- uncertainty: missing/unknown comparison factors.

None is a probability of guilt, identity, source truth, or attribution. Source reliability is separate. Correlation refuses to merge people/personas; duplicate strong indicators draft only `SAME_INDICATOR_AS`.

Token-hash “embeddings” compare lexical overlap. They are deterministic and explicitly **not semantic embeddings**.

## Upload formats and bounds

The gateway accepts `.txt`, `.md`, `.csv`, `.json`, `.pdf`, and `.docx`, from 1 byte through 5 MiB, with filenames up to 180 characters and no path separators. Gateway JSON bodies are limited to 1 MiB; Python middleware rejects request bodies over 6 MiB. PDF/DOCX parsing is text extraction only—there is no OCR, so image-only scans produce no useful text.

External Docker cannot currently upload originals because storage credentials/signing use Replit's sidecar and no external GCS adapter exists. Manual text evidence APIs remain conceptually separate from original-file upload.
