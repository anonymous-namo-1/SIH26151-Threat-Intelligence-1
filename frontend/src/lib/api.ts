import type {
  AiProfile,
  CaseBundle,
  CaseRecord,
  EntityRecord,
  EvidenceRecord,
  GraphData,
  GraphEdge,
  GraphNode,
  InfrastructureData,
  IngestionInput,
  IngestionKind,
  IngestionRecord,
  IngestionResult,
  NodeType,
  ResolutionCandidate,
  RiskLevel,
  RuleHit,
  Signal,
} from "./types";
import {
  createDemoCase,
  getDemoCaseBundle,
  ingestDemoCase,
  listDemoCases,
} from "./mock-data";

/** Public URL is used by Next's server-side rewrite; requests remain same-origin. */
export const apiMode: "live" | "demo" =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ? "live" : "demo";
const PREFIX = "/api/backend/api/v1";
type Wire = Record<string, unknown>;
const object = (value: unknown): Wire =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Wire)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const strings = (value: unknown): string[] =>
  array(value).filter((item): item is string => typeof item === "string");
const risk = (value: unknown): RiskLevel =>
  ["low", "medium", "high", "critical"].includes(str(value))
    ? (value as RiskLevel)
    : "low";
const compact = (value: Wire): Wire =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ""),
  );

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(
  path: string,
  options?: { method: "POST"; body: unknown },
): Promise<Wire> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${PREFIX}${path}`, {
      method: options?.method ?? "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(options ? { "Content-Type": "application/json" } : {}),
      },
      ...(options ? { body: JSON.stringify(options.body) } : {}),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = object(body).detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail
                .map((item) => {
                  const e = object(item);
                  return `${array(e.loc).map(String).join(".")}: ${str(e.msg, "invalid value")}`;
                })
                .join("; ")
            : `Backend request failed (${response.status}).`;
      throw new ApiError(message, response.status);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApiError(
        "The backend returned an unexpected response. Check the configured API URL.",
        response.status,
      );
    return body as Wire;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        "The backend request timed out. Check the API connection and retry.",
      );
    throw new ApiError(
      "Cannot reach the backend. Check NEXT_PUBLIC_API_BASE_URL and that FastAPI is running.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Collect every page rather than silently truncating a large investigation at 50 records. */
async function requestAll(path: string): Promise<Wire[]> {
  const items: Wire[] = [];
  let offset = 0;
  for (;;) {
    const result = await request(`${path}?limit=100&offset=${offset}`);
    if (!Array.isArray(result.items))
      throw new ApiError("The backend returned an invalid paginated response.");
    const page = result.items.map(object);
    items.push(...page);
    const total = num(object(result.pagination).total, items.length);
    if (items.length >= total) return items;
    if (page.length === 0)
      throw new ApiError(
        "The backend returned an incomplete result page. Please retry.",
      );
    offset += page.length;
  }
}

const nodeTypes: Record<string, NodeType> = {
  actor: "actor",
  threat_actor: "actor",
  threat_actors: "actor",
  handle: "actor",
  alias: "alias",
  wallet: "wallet",
  bitcoin_wallet: "wallet",
  ethereum_wallet: "wallet",
  pgp: "pgp",
  pgp_key: "pgp",
  pgp_fingerprint: "pgp",
  telegram: "telegram",
  telegram_handle: "telegram",
  email: "email",
  domain: "domain",
  ip: "ip",
  ip_address: "ip",
  onion: "onion",
  onion_url: "onion",
  malware: "malware",
  malware_name: "malware",
  mitre: "mitre",
  mitre_technique: "mitre",
  cve: "cve",
  source: "evidence",
  ingestion: "evidence",
  evidence: "evidence",
};
const nodeType = (value: unknown): NodeType =>
  str(value).startsWith("wallet:")
    ? "wallet"
    : str(value).startsWith("pgp")
      ? "pgp"
      : (nodeTypes[str(value)] ?? "alias");
const entityType = (value: unknown): EntityRecord["type"] =>
  value === "file_hash" ? "hash" : nodeType(value);

function normalizeCase(w: Wire): CaseRecord {
  return {
    id: str(w.id),
    title: str(w.title, "Untitled case"),
    description: str(w.description),
    status: str(w.status, "open"),
    createdAt: str(w.created_at),
    updatedAt: str(w.updated_at),
    riskScore: null,
    entityCount: null,
    evidenceCount: null,
    correlationCount: null,
  };
}

function normalizeEntity(w: Wire): EntityRecord {
  return {
    id: str(w.id),
    type: entityType(w.entity_type),
    value: str(w.value),
    normalizedValue: str(w.normalized_value, str(w.value).toLowerCase()),
    confidence: num(w.confidence),
    firstSeen: str(w.first_seen),
    lastSeen: str(w.last_seen),
  };
}

function normalizeRule(value: unknown): RuleHit {
  const w = object(value);
  return {
    rule: str(w.rule),
    description: str(w.description),
    score: num(w.score),
    matchedValue: str(w.matched_value) || undefined,
    evidenceSnippets: strings(w.evidence_snippets),
    sourceIngestionIds: strings(w.source_ingestion_ids),
  };
}

function normalizeGraph(w: Wire): GraphData {
  return {
    nodes: array(w.nodes).map((value): GraphNode => {
      const n = object(value),
        metadata = object(n.metadata),
        position = object(metadata.position);
      const type = nodeType(n.type);
      const identifier = str(n.value);
      const label =
        type === "evidence" || !identifier
          ? str(n.label)
          : identifier.length > 27
            ? `${identifier.slice(0, 14)}…${identifier.slice(-8)}`
            : identifier;
      return {
        id: str(n.id),
        entityId: str(n.entity_id) || undefined,
        ingestionId: str(n.ingestion_id) || undefined,
        type,
        label,
        value: identifier,
        group: str(n.group),
        riskLevel: risk(n.risk_level),
        confidence: num(n.confidence),
        metadata,
        ...(typeof position.x === "number" && typeof position.y === "number"
          ? { position: { x: position.x, y: position.y } }
          : {}),
      };
    }),
    edges: array(w.edges).map((value): GraphEdge => {
      const e = object(value);
      return {
        id: str(e.id),
        source: str(e.source),
        target: str(e.target),
        type: str(e.type),
        label: str(e.label),
        confidence: num(e.confidence),
        weight: num(e.weight, 1),
        animated: e.animated === true,
        evidenceSnippets: strings(e.evidence_snippets),
        ruleHits: array(e.rule_hits).map(normalizeRule),
      };
    }),
    warnings: strings(w.warnings),
    generatedAt: str(w.generated_at),
  };
}

function normalizeSignal(value: unknown): Signal {
  const w = object(value);
  return {
    type: str(w.signal_type, str(w.pattern)),
    description: str(w.description),
    confidence: num(w.confidence),
    matchedValues: strings(
      w.matched_values ?? w.supporting_entities ?? w.handles_or_aliases,
    ),
    evidenceSnippets: strings(w.evidence_snippets),
  };
}

function normalizeProfile(w: Wire): AiProfile {
  return {
    summary: str(w.profile_summary),
    riskScore: num(w.risk_score),
    riskLevel: risk(w.risk_level),
    riskBreakdown: array(object(w.risk_breakdown).contributions).map(
      (value) => {
        const c = object(value);
        return {
          factor: str(c.factor),
          points: num(c.points),
          rationale: str(c.rationale),
          evidenceRefs: strings(c.evidence_refs),
        };
      },
    ),
    stylometry: array(w.stylometry).map(normalizeSignal),
    behaviorPatterns: array(w.behavior_patterns).map(normalizeSignal),
    rebrandSignals: array(w.rebrand_signals).map(normalizeSignal),
    attributionExplanations: array(w.attribution_explanations).map((value) => {
      const a = object(value);
      return {
        candidatePair: strings(a.candidate_pair),
        confidence: num(a.confidence),
        explanation: str(a.explanation),
        supportingRules: strings(a.supporting_rules),
        evidenceSnippets: strings(a.evidence_snippets),
        warning: str(a.warning),
      };
    }),
    recommendedNextSteps: strings(w.recommended_next_steps),
    warnings: strings(w.warnings),
  };
}

function normalizeInfrastructure(w: Wire): InfrastructureData {
  return {
    riskScore: num(w.risk_score),
    riskLevel: risk(w.risk_level),
    findings: array(w.findings).map((value, index) => {
      const f = object(value);
      return {
        id: `${str(f.finding_type)}-${index}`,
        type: str(f.finding_type),
        title: str(f.title),
        severity: risk(f.severity),
        confidence: num(f.confidence),
        description: str(f.description),
        matchedValues: strings(f.matched_values),
        evidenceSnippets: strings(f.evidence_snippets),
        relatedHandles: strings(f.related_handles),
      };
    }),
    signals: array(w.signals).map(normalizeSignal),
    warnings: strings(w.warnings),
  };
}

function normalizeIngestion(w: Wire, entityCount = 0): IngestionRecord {
  const metadata = object(w.metadata);
  return {
    id: str(w.id),
    sourceType: str(w.source_type),
    platform: str(w.platform, str(metadata.source_name, "Analyst submission")),
    title: str(
      metadata.title,
      str(
        metadata.source_name,
        str(w.platform, str(w.source_type).replaceAll("_", " ")),
      ),
    ),
    rawText: str(w.raw_text),
    createdAt: str(w.created_at),
    entityCount,
  };
}

const casePath = (id: string) => `/cases/${encodeURIComponent(id)}`;

export async function listCases(): Promise<CaseRecord[]> {
  if (apiMode === "demo") return listDemoCases();
  return (await requestAll("/cases")).map(normalizeCase);
}

export async function createCase(input: {
  title: string;
  description?: string;
}): Promise<CaseRecord> {
  const title = input.title.trim();
  if (!title || title.length > 200)
    throw new ApiError("Enter a case title between 1 and 200 characters.");
  if ((input.description?.length ?? 0) > 5000)
    throw new ApiError("Case descriptions must be 5,000 characters or fewer.");
  if (apiMode === "demo") return createDemoCase({ ...input, title });
  return normalizeCase(
    await request("/cases", {
      method: "POST",
      body: {
        title,
        description: input.description?.trim() || null,
        status: "open",
      },
    }),
  );
}

export async function getCaseBundle(id: string): Promise<CaseBundle> {
  if (apiMode === "demo") return getDemoCaseBundle(id);
  const path = casePath(id);
  const [
    record,
    graph,
    entities,
    evidence,
    resolution,
    profile,
    infrastructure,
    ingestions,
  ] = await Promise.all([
    request(path),
    request(`${path}/graph`),
    requestAll(`${path}/entities`),
    requestAll(`${path}/evidence`),
    request(`${path}/resolution/candidates`),
    request(`${path}/ai-profile`),
    request(`${path}/infrastructure/findings`),
    requestAll(`${path}/ingestions`),
  ]);
  const normalizedGraph = normalizeGraph(graph);
  const normalizedProfile = normalizeProfile(profile);
  const normalizedIngestions = ingestions.map((ingestion) =>
    normalizeIngestion(
      ingestion,
      new Set(
        evidence
          .filter((e) => e.ingestion_id === ingestion.id)
          .map((e) => e.entity_id),
      ).size,
    ),
  );
  const candidates: ResolutionCandidate[] = array(resolution.candidates).map(
    (value) => {
      const c = object(value),
        left = object(c.left_entity),
        right = object(c.right_entity);
      return {
        id: `${str(left.id)}--${str(right.id)}`,
        leftEntityId: str(left.id),
        rightEntityId: str(right.id),
        leftLabel: str(left.value),
        rightLabel: str(right.value),
        confidence: num(c.confidence_score),
        ruleHits: array(c.rule_hits).map(normalizeRule),
        evidenceSnippets: strings(c.evidence_snippets),
        warnings: strings(c.warnings),
      };
    },
  );
  const normalizedEvidence: EvidenceRecord[] = evidence.map((e) => {
    const ingestion = normalizedIngestions.find((i) => i.id === e.ingestion_id);
    return {
      id: str(e.id),
      entityId: str(e.entity_id),
      ingestionId: str(e.ingestion_id),
      source: ingestion?.platform ?? str(e.source_field, "Analyst submission"),
      type: ingestion?.sourceType ?? "analyst_submission",
      title: str(object(e.entity).value, "Evidence excerpt"),
      snippet: str(e.evidence_snippet),
      confidence: num(e.confidence),
      createdAt: str(e.created_at),
    };
  });
  return {
    case: {
      ...normalizeCase(record),
      riskScore: normalizedProfile.riskScore,
      entityCount: entities.length,
      evidenceCount: evidence.length,
      correlationCount: candidates.length,
    },
    graph: normalizedGraph,
    entities: entities.map(normalizeEntity),
    evidence: normalizedEvidence,
    candidates,
    profile: normalizedProfile,
    infrastructure: normalizeInfrastructure(infrastructure),
    ingestions: normalizedIngestions,
  };
}

function ingestionPayload(kind: IngestionKind, input: IngestionInput): Wire {
  const common = compact({
    observed_at: input.observedAt,
    metadata: input.metadata,
  });
  const supplied = input.structuredData ?? {};
  let payload: Wire;
  switch (kind) {
    case "synthetic":
      payload = {
        ...supplied,
        ...common,
        ...compact({
          text: input.text?.trim(),
          platform: input.platform,
          handle: input.handle,
          onion_url: input.onionUrl,
        }),
        source_type: "synthetic_dark_forum",
      };
      break;
    case "osint":
      payload = {
        ...supplied,
        ...common,
        ...compact({
          text: input.text?.trim(),
          source_name: input.sourceName,
          source_url: input.sourceUrl,
        }),
        source_type: "public_report",
      };
      break;
    case "profile":
      payload = {
        ...supplied,
        ...common,
        ...compact({ text: input.text?.trim(), platform: input.platform }),
        source_type: "analyst_submission",
      };
      break;
    case "onion-metadata":
      payload = {
        ...supplied,
        ...compact({
          onion_url: input.onionUrl,
          title: input.title,
          metadata: input.metadata,
        }),
      };
      break;
    case "infrastructure":
      payload = {
        ...supplied,
        ...common,
        ...compact({
          domain: input.domain,
          ip_address: input.ipAddress,
          onion_url: input.onionUrl,
          server_header: input.serverHeader,
          certificate_fingerprint: input.certificateFingerprint,
          page_title: input.title,
          source_label: input.sourceName,
          notes: input.notes || input.text,
        }),
      };
      break;
  }
  if (
    ["synthetic", "osint", "profile"].includes(kind) &&
    !str(payload.text).trim()
  )
    throw new ApiError("Enter source text before extracting entities.");
  if (str(payload.text).length > 200_000)
    throw new ApiError("Source text must be 200,000 characters or fewer.");
  if (kind === "osint" && !str(payload.source_name).trim())
    throw new ApiError("Enter a source name for this public OSINT report.");
  if (
    kind === "osint" &&
    payload.source_url &&
    !/^https?:\/\//i.test(str(payload.source_url))
  )
    throw new ApiError("Source URL must begin with https:// or http://.");
  if (
    kind === "onion-metadata" &&
    !str(payload.onion_url).toLowerCase().includes(".onion")
  )
    throw new ApiError(
      "Enter an analyst-supplied .onion URL in the metadata. No connection will be made.",
    );
  if (
    kind === "infrastructure" &&
    ![
      "domain",
      "ip_address",
      "url",
      "onion_url",
      "certificate",
      "certificate_fingerprint",
      "server_header",
      "headers",
      "notes",
    ].some(
      (key) =>
        Boolean(payload[key]) &&
        (!Array.isArray(payload[key]) ||
          (payload[key] as unknown[]).length > 0),
    )
  )
    throw new ApiError(
      "Supply at least one infrastructure observation, such as a domain, IP address, certificate, or notes.",
    );
  return payload;
}

export async function ingest(
  id: string,
  kind: IngestionKind,
  input: IngestionInput,
): Promise<IngestionResult> {
  const payload = ingestionPayload(kind, input);
  if (apiMode === "demo")
    return ingestDemoCase(id, kind, { ...input, structuredData: payload });
  const result = await request(`${casePath(id)}/ingest/${kind}`, {
    method: "POST",
    body: payload,
  });
  const rawIngestion = object(result.ingestion),
    extraction = object(result.extraction);
  const entities: EntityRecord[] = Object.values(object(extraction.entities))
    .flatMap(array)
    .map((value, index) => {
      const e = object(value);
      return {
        id: `extracted-${str(rawIngestion.id)}-${index}`,
        type: entityType(e.entity_type),
        value: str(e.value),
        normalizedValue: str(e.value).toLowerCase(),
        confidence: num(e.confidence),
        firstSeen: str(rawIngestion.created_at),
        lastSeen: str(rawIngestion.created_at),
      };
    });
  return {
    ingestion: normalizeIngestion(rawIngestion, entities.length),
    entities,
    evidenceSnippets: strings(extraction.evidence_snippets),
    warnings: strings(extraction.warnings),
  };
}

export const api = { listCases, createCase, getCaseBundle, ingest };
