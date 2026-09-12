import type {
  AiProfile,
  CaseBundle,
  CaseRecord,
  EntityRecord,
  GraphEdge,
  GraphNode,
  IngestionInput,
  IngestionKind,
  IngestionResult,
  NodeType,
} from "./types";

export const DEMO_CASE_ID = "ARG-2026-084";
const STAMP = "2026-09-11T14:42:00.000Z";
const DEMO_WARNING =
  "Fictional demonstration data. Analyst support only; correlations are not proof of identity or attribution.";
const STORAGE_KEY = "argus-demo-cases-v1";

const node = (
  id: string,
  type: NodeType,
  label: string,
  value: string,
  x: number,
  y: number,
  confidence = 0.94,
  riskLevel: GraphNode["riskLevel"] = "medium",
  description = "Observed in analyst-supplied demonstration evidence.",
): GraphNode => ({
  id,
  entityId: type === "evidence" ? undefined : id,
  type,
  label,
  value,
  confidence,
  riskLevel,
  group: ["actor", "alias"].includes(type)
    ? "identity"
    : ["domain", "ip", "onion"].includes(type)
      ? "infrastructure"
      : type === "wallet"
        ? "crypto"
        : type === "evidence"
          ? "source"
          : "threat_context",
  position: { x, y },
  metadata: {
    description,
    firstSeen: "2026-09-04",
    lastSeen: "2026-09-11",
    synthetic: true,
  },
});

const nodes: GraphNode[] = [
  node(
    "nightjar",
    "actor",
    "NIGHTJAR",
    "NIGHTJAR",
    470,
    330,
    0.98,
    "critical",
    "Primary subject. A fictional access-broker identity linked through reused infrastructure, contact handles, and cryptographic identifiers.",
  ),
  node(
    "alias-ghost",
    "alias",
    "ghost_moth",
    "ghost_moth",
    235,
    160,
    0.93,
    "high",
    "Candidate alias sharing a PGP fingerprint with NIGHTJAR. Requires analyst validation.",
  ),
  node(
    "alias-nyx",
    "alias",
    "n1ghtjar",
    "n1ghtjar",
    670,
    130,
    0.88,
    "high",
    "Possible rebrand identified in an analyst-supplied marketplace profile.",
  ),
  node(
    "wallet-btc",
    "wallet",
    "bc1q…7k9m",
    "bc1qdemoonly00000000000000000000000007k9m",
    130,
    335,
    0.97,
    "high",
    "Fictional Bitcoin-format payment indicator repeated across two supplied sources; not a usable wallet.",
  ),
  node(
    "wallet-eth",
    "wallet",
    "0x7a3…d42e",
    "0x7a30000000000000000000000000000000000d42e",
    260,
    515,
    0.91,
    "medium",
  ),
  node(
    "pgp-main",
    "pgp",
    "A8F2 · 91C4",
    "A8F2 91C4 D31B 06E9 3FA0 8812 B001 C390 E18D 6F21",
    470,
    65,
    0.99,
    "high",
    "Shared PGP fingerprint is the strongest identity correlation in this demonstration.",
  ),
  node(
    "telegram",
    "telegram",
    "@nightjar_ops",
    "@nightjar_ops",
    775,
    315,
    0.96,
    "high",
    "Contact handle in two supplied profile snapshots. No contact was initiated.",
  ),
  node(
    "contact-email",
    "email",
    "ops@nj-relay.example",
    "ops@nj-relay.example",
    955,
    190,
    0.88,
    "medium",
  ),
  node(
    "domain-relay",
    "domain",
    "nj-relay.example",
    "nj-relay.example",
    680,
    525,
    0.96,
    "high",
    "Reserved example domain referenced in supplied infrastructure metadata.",
  ),
  node(
    "domain-cdn",
    "domain",
    "cdn-nj.example",
    "cdn-nj.example",
    955,
    530,
    0.89,
    "medium",
  ),
  node(
    "ip-main",
    "ip",
    "203.0.113.42",
    "203.0.113.42",
    815,
    700,
    0.98,
    "high",
    "Documentation-only IP address. Two supplied domain observations share this address.",
  ),
  node(
    "onion",
    "onion",
    "nightjar…onion",
    "nightjardemometadataonly2345672345672345672345672345672345.onion",
    1040,
    360,
    0.83,
    "high",
    "Fictional analyst-supplied onion metadata. No crawling, Tor access, or connection occurs.",
  ),
  node(
    "malware",
    "malware",
    "NIGHTSHADE",
    "NIGHTSHADE (fictional)",
    450,
    590,
    0.86,
    "high",
    "Fictional malware family referenced in the exercise report.",
  ),
  node(
    "mitre-1",
    "mitre",
    "T1566 · Phishing",
    "T1566",
    230,
    720,
    0.9,
    "medium",
  ),
  node(
    "mitre-2",
    "mitre",
    "T1071 · App protocol",
    "T1071",
    510,
    770,
    0.84,
    "medium",
  ),
  node(
    "evidence-forum",
    "evidence",
    "Forum snapshot",
    "Synthetic forum snapshot · 08 Sep 2026",
    20,
    130,
    1,
    "low",
  ),
  node(
    "evidence-report",
    "evidence",
    "OSINT report",
    "Fictional public-report exercise · 10 Sep 2026",
    45,
    580,
    1,
    "low",
  ),
  node(
    "evidence-profile",
    "evidence",
    "Profile archive",
    "Analyst-supplied profile exercise · 11 Sep 2026",
    910,
    35,
    1,
    "low",
  ),
];

const edge = (
  source: string,
  target: string,
  type: string,
  label: string,
  confidence: number,
  snippet: string,
  rule?: string,
): GraphEdge => ({
  id: `${source}--${target}`,
  source,
  target,
  type,
  label,
  confidence,
  weight: confidence >= 0.9 ? 4 : 2,
  animated: confidence >= 0.9,
  evidenceSnippets: [snippet],
  ruleHits: rule
    ? [
        {
          rule,
          description: label,
          score: confidence,
          matchedValue: nodes.find((n) => n.id === target)?.value,
          evidenceSnippets: [snippet],
          sourceIngestionIds: ["ingest-forum", "ingest-profile"],
        },
      ]
    : [],
});

const edges: GraphEdge[] = [
  edge(
    "nightjar",
    "alias-ghost",
    "resolved_candidate",
    "possible alias",
    0.93,
    "Both demonstration profiles advertise the same PGP fingerprint A8F2 91C4.",
    "shared_pgp_fingerprint",
  ),
  edge(
    "nightjar",
    "alias-nyx",
    "resolved_candidate",
    "possible rebrand",
    0.88,
    "Profile archive uses n1ghtjar alongside the same contact handle.",
    "shared_contact",
  ),
  edge(
    "nightjar",
    "wallet-btc",
    "uses_wallet",
    "uses wallet",
    0.97,
    "NIGHTJAR's synthetic listing includes the demonstration payment indicator ending 7k9m.",
  ),
  edge(
    "nightjar",
    "wallet-eth",
    "uses_wallet",
    "uses wallet",
    0.91,
    "Exercise profile references the Ethereum-format indicator ending d42e.",
  ),
  edge(
    "nightjar",
    "pgp-main",
    "uses_pgp",
    "uses PGP",
    0.99,
    "The NIGHTJAR profile publishes fingerprint A8F2 91C4 D31B 06E9.",
  ),
  edge(
    "alias-ghost",
    "pgp-main",
    "uses_pgp",
    "shared key",
    0.98,
    "ghost_moth profile repeats the identical fingerprint.",
    "exact_key_match",
  ),
  edge(
    "nightjar",
    "telegram",
    "has_contact",
    "has contact",
    0.96,
    "Contact field in the synthetic profile: @nightjar_ops.",
  ),
  edge(
    "alias-nyx",
    "telegram",
    "has_contact",
    "shared contact",
    0.94,
    "The n1ghtjar archive also lists @nightjar_ops.",
    "exact_contact_match",
  ),
  edge(
    "telegram",
    "contact-email",
    "shared_indicator",
    "same profile",
    0.88,
    "Both contact values appear in the analyst-supplied profile.",
  ),
  edge(
    "nightjar",
    "domain-relay",
    "related_to",
    "linked infrastructure",
    0.96,
    "The fictional exercise report associates nj-relay.example with NIGHTJAR.",
  ),
  edge(
    "domain-relay",
    "ip-main",
    "hosted_on",
    "hosted on",
    0.98,
    "Supplied DNS metadata: nj-relay.example → 203.0.113.42.",
  ),
  edge(
    "domain-cdn",
    "ip-main",
    "hosted_on",
    "hosted on",
    0.94,
    "Supplied DNS metadata: cdn-nj.example → 203.0.113.42.",
  ),
  edge(
    "domain-relay",
    "domain-cdn",
    "shared_indicator",
    "shared certificate",
    0.92,
    "Both supplied TLS observations share the exercise certificate fingerprint.",
    "shared_certificate",
  ),
  edge(
    "onion",
    "domain-relay",
    "shared_indicator",
    "shared header",
    0.83,
    "Analyst-provided metadata includes the same server header in two observations.",
    "shared_server_header",
  ),
  edge(
    "nightjar",
    "malware",
    "mentioned_in",
    "associated with",
    0.86,
    "The exercise report mentions NIGHTJAR alongside fictional family NIGHTSHADE.",
  ),
  edge(
    "malware",
    "mitre-1",
    "related_to",
    "technique",
    0.9,
    "Exercise report tags the fictional campaign with T1566.",
  ),
  edge(
    "malware",
    "mitre-2",
    "related_to",
    "technique",
    0.84,
    "Exercise report tags application-layer communications with T1071.",
  ),
  edge(
    "alias-ghost",
    "evidence-forum",
    "mentioned_in",
    "mentioned in",
    0.98,
    "The synthetic forum snapshot contains the handle ghost_moth.",
  ),
  edge(
    "wallet-btc",
    "evidence-forum",
    "mentioned_in",
    "observed in",
    0.97,
    "The same forum snapshot contains the demonstration wallet indicator.",
  ),
  edge(
    "malware",
    "evidence-report",
    "mentioned_in",
    "mentioned in",
    0.93,
    "NIGHTSHADE is named in the fictional exercise report.",
  ),
  edge(
    "alias-nyx",
    "evidence-profile",
    "mentioned_in",
    "observed in",
    0.98,
    "Profile archive identifies the account as n1ghtjar.",
  ),
  edge(
    "contact-email",
    "evidence-profile",
    "mentioned_in",
    "observed in",
    0.95,
    "Profile archive lists ops@nj-relay.example.",
  ),
];

const profile: AiProfile = {
  summary:
    "NIGHTJAR is a fictional access-broker identity with two candidate aliases. Reused cryptographic identifiers and contact details provide the strongest correlations. Shared infrastructure adds context; independent validation is required.",
  riskScore: 87,
  riskLevel: "high",
  riskBreakdown: [
    {
      factor: "Identity correlations",
      points: 32,
      rationale: "PGP and contact reuse across three supplied profiles.",
      evidenceRefs: ["ingest-profile", "ingest-forum"],
    },
    {
      factor: "Infrastructure overlap",
      points: 25,
      rationale: "Two example domains share an IP and certificate fingerprint.",
      evidenceRefs: ["ingest-infrastructure"],
    },
    {
      factor: "Threat context",
      points: 20,
      rationale:
        "Fictional malware and technique references in an exercise report.",
      evidenceRefs: ["ingest-report"],
    },
    {
      factor: "Behavioral consistency",
      points: 10,
      rationale:
        "Similar wording and activity windows in supplied observations.",
      evidenceRefs: ["ingest-profile"],
    },
  ],
  stylometry: [
    {
      type: "Repeated phrasing",
      description:
        "The phrase ‘escrow preferred’ appears in both supplied profile excerpts; this is a weak, non-exclusive signal.",
      confidence: 0.69,
      matchedValues: ["escrow preferred"],
      evidenceSnippets: [
        "Synthetic profile A: escrow preferred.",
        "Synthetic profile B: escrow preferred.",
      ],
    },
  ],
  behaviorPatterns: [
    {
      type: "Contact reuse",
      description:
        "Two candidate identities publish the same contact and cryptographic fingerprint.",
      confidence: 0.94,
      matchedValues: ["@nightjar_ops", "A8F2 91C4"],
      evidenceSnippets: ["Both exercise profiles list @nightjar_ops."],
    },
  ],
  rebrandSignals: [
    {
      type: "Candidate alias transition",
      description:
        "n1ghtjar appears after the last supplied ghost_moth observation. Timing alone does not establish a rebrand.",
      confidence: 0.78,
      matchedValues: ["ghost_moth", "n1ghtjar"],
      evidenceSnippets: [
        "Last supplied ghost_moth observation: 08 Sep. First n1ghtjar observation: 09 Sep.",
      ],
    },
  ],
  attributionExplanations: [
    {
      candidatePair: ["NIGHTJAR", "ghost_moth"],
      confidence: 0.93,
      explanation:
        "The supplied profiles share an exact PGP fingerprint and contact identifier. These are candidate links for analyst review.",
      supportingRules: ["shared_pgp_fingerprint", "shared_contact"],
      evidenceSnippets: ["Both profiles publish fingerprint A8F2 91C4."],
      warning:
        "A shared identifier is not proof that accounts belong to the same person.",
    },
  ],
  recommendedNextSteps: [
    "Validate source provenance and timestamps.",
    "Review the shared PGP fingerprint in the supplied source material.",
    "Document alternative explanations before accepting candidate links.",
  ],
  warnings: [DEMO_WARNING],
};

function seedBundle(): CaseBundle {
  const entities = nodes
    .filter((n) => n.type !== "evidence")
    .map((n): EntityRecord => ({
      id: n.id,
      type: n.type,
      value: n.value,
      normalizedValue: n.value.toLowerCase(),
      confidence: n.confidence,
      firstSeen: "2026-09-04T09:20:00.000Z",
      lastSeen: STAMP,
    }));
  const sourceForEdge = (edge: GraphEdge) => {
    if (
      edge.target === "evidence-report" ||
      ["malware", "mitre-1", "mitre-2"].includes(edge.target)
    )
      return {
        id: "ingest-report",
        label: "Fictional exercise report",
        type: "public_report",
      };
    if (
      ["hosted_on", "shared_indicator"].includes(edge.type) &&
      edge.target !== "contact-email"
    )
      return {
        id: "ingest-infrastructure",
        label: "Infrastructure metadata",
        type: "analyst_submission",
      };
    if (edge.target === "evidence-forum" || edge.target === "alias-ghost")
      return {
        id: "ingest-forum",
        label: "Synthetic forum snapshot",
        type: "synthetic_dark_forum",
      };
    return {
      id: "ingest-profile",
      label: "Profile archive",
      type: "analyst_submission",
    };
  };
  const evidence = edges.flatMap((edge, index) => {
    const source = sourceForEdge(edge);
    return [edge.source, edge.target]
      .filter((id) => !id.startsWith("evidence-"))
      .map((entityId) => ({
        id: `evidence-${index}-${entityId}`,
        entityId,
        ingestionId: source.id,
        source: source.label,
        type: source.type,
        title: `${nodes.find((n) => n.id === edge.source)?.label} · ${edge.label}`,
        snippet: edge.evidenceSnippets[0],
        confidence: edge.confidence,
        createdAt: STAMP,
      }));
  });
  const graphNodes = nodes.map((n) => ({
    ...n,
    ...(n.type === "evidence"
      ? { ingestionId: n.id.replace("evidence-", "ingest-") }
      : {}),
  }));
  const candidates = edges
    .filter((e) => e.type === "resolved_candidate")
    .map((e) => ({
      id: e.id,
      leftEntityId: e.source,
      rightEntityId: e.target,
      leftLabel: nodes.find((n) => n.id === e.source)!.label,
      rightLabel: nodes.find((n) => n.id === e.target)!.label,
      confidence: e.confidence,
      ruleHits: e.ruleHits,
      evidenceSnippets: e.evidenceSnippets,
      warnings: ["Candidate correlation requires analyst review."],
    }));
  return {
    case: {
      id: DEMO_CASE_ID,
      title: "Operation Nightfall",
      description:
        "Investigating identity convergence and infrastructure reuse across a fictional access-broker network.",
      status: "open",
      createdAt: "2026-09-04T09:20:00.000Z",
      updatedAt: STAMP,
      riskScore: 87,
      entityCount: entities.length,
      evidenceCount: evidence.length,
      correlationCount: candidates.length,
    },
    graph: {
      nodes: graphNodes,
      edges,
      generatedAt: STAMP,
      warnings: [DEMO_WARNING],
    },
    entities,
    evidence,
    candidates,
    profile,
    infrastructure: {
      riskScore: 78,
      riskLevel: "high",
      findings: [
        {
          id: "infra-cert",
          type: "shared_certificate",
          title: "Shared TLS certificate",
          severity: "high",
          confidence: 0.92,
          description:
            "Two supplied domain observations share the same certificate fingerprint. Certificate reuse can also reflect shared hosting.",
          matchedValues: ["nj-relay.example", "cdn-nj.example"],
          evidenceSnippets: [
            "Supplied observations: certificate fingerprint DEMO:A8:F2:91:C4 on both hosts.",
          ],
          relatedHandles: ["NIGHTJAR"],
        },
        {
          id: "infra-ip",
          type: "shared_ip",
          title: "Infrastructure convergence",
          severity: "high",
          confidence: 0.94,
          description:
            "Both example domains resolve to a documentation-only IP in the supplied DNS metadata.",
          matchedValues: ["203.0.113.42"],
          evidenceSnippets: [
            "nj-relay.example and cdn-nj.example → 203.0.113.42",
          ],
          relatedHandles: ["NIGHTJAR"],
        },
        {
          id: "infra-header",
          type: "shared_header",
          title: "Matching server signature",
          severity: "medium",
          confidence: 0.73,
          description:
            "A matching server header appears in supplied onion and domain metadata. Common software can explain this overlap.",
          matchedValues: ["nginx / exercise-build-17"],
          evidenceSnippets: [
            "Analyst observation: Server: nginx / exercise-build-17",
          ],
          relatedHandles: [],
        },
      ],
      signals: [],
      warnings: [
        "Analysis uses supplied metadata only. No scanning, fetching, or Tor access.",
        DEMO_WARNING,
      ],
    },
    ingestions: [
      {
        id: "ingest-profile",
        sourceType: "analyst_submission",
        platform: "Profile archive",
        title: "Candidate alias profile",
        rawText:
          "Username: n1ghtjar. Contact: @nightjar_ops. PGP: A8F2 91C4 D31B 06E9 3FA0 8812 B001 C390 E18D 6F21.",
        createdAt: STAMP,
        entityCount: 4,
      },
      {
        id: "ingest-infrastructure",
        sourceType: "analyst_submission",
        platform: "Infrastructure metadata",
        title: "Shared hosting observations",
        rawText:
          "nj-relay.example and cdn-nj.example share 203.0.113.42 and certificate DEMO:A8:F2:91:C4.",
        createdAt: "2026-09-11T13:18:00.000Z",
        entityCount: 3,
      },
      {
        id: "ingest-report",
        sourceType: "public_report",
        platform: "Fictional exercise report",
        title: "NIGHTSHADE campaign analysis",
        rawText:
          "Fictional NIGHTJAR campaign references NIGHTSHADE, T1566, and T1071.",
        createdAt: "2026-09-10T16:30:00.000Z",
        entityCount: 4,
      },
      {
        id: "ingest-forum",
        sourceType: "synthetic_dark_forum",
        platform: "Synthetic forum snapshot",
        title: "Access-broker listing",
        rawText:
          "Handle: ghost_moth. Escrow preferred. Contact: @nightjar_ops.",
        createdAt: "2026-09-08T11:06:00.000Z",
        entityCount: 4,
      },
    ],
  };
}

function emptyBundle(record: CaseRecord): CaseBundle {
  return {
    case: record,
    graph: {
      nodes: [],
      edges: [],
      generatedAt: record.createdAt,
      warnings: [DEMO_WARNING],
    },
    entities: [],
    evidence: [],
    candidates: [],
    ingestions: [],
    profile: {
      summary: "Ingest analyst-supplied evidence to begin building this case.",
      riskScore: 0,
      riskLevel: "low",
      riskBreakdown: [],
      stylometry: [],
      behaviorPatterns: [],
      rebrandSignals: [],
      attributionExplanations: [],
      recommendedNextSteps: ["Add a source from the ingestion workspace."],
      warnings: [
        DEMO_WARNING,
        "No scoring has been performed for this demo case.",
      ],
    },
    infrastructure: {
      riskScore: 0,
      riskLevel: "low",
      findings: [],
      signals: [],
      warnings: ["No infrastructure observations supplied."],
    },
  };
}

function initialState(): Record<string, CaseBundle> {
  const secondary = [
    {
      id: "ARG-2026-083",
      title: "Glass Harbor",
      description:
        "An empty demonstration case for reviewing infrastructure observations.",
      status: "open",
    },
    {
      id: "ARG-2026-079",
      title: "Silent Meridian",
      description:
        "An archived demonstration case. Add a new case to start an investigation.",
      status: "closed",
    },
  ].map((c) =>
    emptyBundle({
      ...c,
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-09T12:00:00.000Z",
      riskScore: 0,
      entityCount: 0,
      evidenceCount: 0,
      correlationCount: 0,
    }),
  );
  return {
    [DEMO_CASE_ID]: seedBundle(),
    ...Object.fromEntries(secondary.map((b) => [b.case.id, b])),
  };
}

let memoryState: Record<string, CaseBundle> | undefined;
function readState(): Record<string, CaseBundle> {
  if (typeof window === "undefined") return initialState();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        parsed &&
        typeof parsed === "object" &&
        Object.values(parsed).every(
          (b) => b && typeof b === "object" && "case" in b && "graph" in b,
        )
      )
        return parsed as Record<string, CaseBundle>;
    }
  } catch {
    /* Browsing the fixture remains possible when storage is unavailable. */
  }
  return (memoryState ??= initialState());
}

function saveState(state: Record<string, CaseBundle>) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      throw new Error(
        "Demo changes could not be saved. Allow browser storage and try again.",
      );
    }
  }
  memoryState = state;
}

export function listDemoCases(): CaseRecord[] {
  return Object.values(readState())
    .map((b) => ({ ...b.case }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDemoCaseBundle(id: string): CaseBundle {
  const bundle = readState()[id];
  if (!bundle)
    throw new Error(
      "Case not found. Select an available case or create a new one.",
    );
  return structuredClone(bundle);
}

export function createDemoCase(input: {
  title: string;
  description?: string;
}): CaseRecord {
  const title = input.title.trim();
  if (!title || title.length > 200)
    throw new Error("Enter a case title between 1 and 200 characters.");
  const now = new Date().toISOString();
  const record: CaseRecord = {
    id: `ARG-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    title,
    description: input.description?.trim() ?? "",
    status: "open",
    createdAt: now,
    updatedAt: now,
    riskScore: 0,
    entityCount: 0,
    evidenceCount: 0,
    correlationCount: 0,
  };
  const state = { ...readState(), [record.id]: emptyBundle(record) };
  saveState(state);
  return record;
}

/** A deliberately small, local demo extractor. It only emits values present in the supplied input. */
function extractDemoEntities(
  text: string,
): { type: NodeType; value: string }[] {
  const found = new Map<string, { type: NodeType; value: string }>();
  const add = (type: NodeType, value: string) => {
    const trimmed = value.trim().replace(/[.,;]+$/, "");
    if (trimmed)
      found.set(`${type}:${trimmed.toLowerCase()}`, { type, value: trimmed });
  };
  const patterns: [NodeType, RegExp][] = [
    ["onion", /\b[a-z2-7]{16,56}\.onion\b/gi],
    ["wallet", /\b0x[a-f0-9]{40}\b/gi],
    ["wallet", /\b(?:bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g],
    ["email", /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi],
    ["telegram", /(?<![\w.])@[a-z0-9_]{3,32}\b/gi],
    ["mitre", /\bT\d{4}(?:\.\d{3})?\b/gi],
    ["cve", /\bCVE-\d{4}-\d{4,7}\b/gi],
    [
      "pgp",
      /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/g,
    ],
  ];
  for (const [type, pattern] of patterns)
    for (const match of text.matchAll(pattern)) add(type, match[0]);
  for (const match of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g))
    if (match[0].split(".").every((octet) => Number(octet) <= 255))
      add("ip", match[0]);
  for (const match of text.matchAll(
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi,
  ))
    if (!match[0].toLowerCase().endsWith(".onion")) add("domain", match[0]);
  for (const match of text.matchAll(
    /\b(actor|alias|username|handle|malware)\s*[:=]\s*([a-z0-9_.-]{2,80})/gi,
  ))
    add(
      match[1].toLowerCase() === "actor"
        ? "actor"
        : match[1].toLowerCase() === "malware"
          ? "malware"
          : "alias",
      match[2],
    );
  for (const match of text.matchAll(
    /\b(?:PGP|fingerprint)\s*[:=]\s*((?:[a-f0-9]{4}\s*){10})\b/gi,
  ))
    add("pgp", match[1]);
  for (const match of text.matchAll(
    /\b(?:PGP|key id)\s*[:=]\s*([a-f0-9]{8,40})\b/gi,
  ))
    add("pgp", match[1]);
  return [...found.values()];
}

export function ingestDemoCase(
  id: string,
  kind: IngestionKind,
  input: IngestionInput,
): IngestionResult {
  const bundle = getDemoCaseBundle(id);
  const now = new Date().toISOString();
  const ingestionId = crypto.randomUUID();
  const { structuredData, metadata, ...plain } = input;
  const rawText = [
    input.text,
    input.notes,
    input.handle ? `handle: ${input.handle}` : "",
    ...Object.entries(plain)
      .filter(([key]) => !["text", "notes", "handle"].includes(key))
      .map(([key, value]) => `${key}: ${value}`),
    structuredData ? JSON.stringify(structuredData) : "",
    metadata ? JSON.stringify(metadata) : "",
  ]
    .filter(Boolean)
    .join("\n");
  const extracted = extractDemoEntities(rawText);
  const entities: EntityRecord[] = extracted.map((entity) => {
    const existing = bundle.entities.find(
      (e) =>
        e.type === entity.type &&
        e.normalizedValue === entity.value.toLowerCase(),
    );
    return existing
      ? { ...existing, lastSeen: now }
      : {
          id: crypto.randomUUID(),
          type: entity.type,
          value: entity.value,
          normalizedValue: entity.value.toLowerCase(),
          confidence: 0.8,
          firstSeen: now,
          lastSeen: now,
        };
  });
  const ingestion = {
    id: ingestionId,
    sourceType:
      kind === "synthetic"
        ? "synthetic_dark_forum"
        : kind === "osint"
          ? "public_report"
          : "analyst_submission",
    platform: input.platform || input.sourceName || "Analyst submission",
    title:
      input.title ||
      input.sourceName ||
      `${kind.replaceAll("-", " ")} submission`,
    rawText,
    createdAt: now,
    entityCount: entities.length,
  };
  const evidenceSnippets: string[] = [];
  const baseX = bundle.graph.nodes.length
    ? Math.max(...bundle.graph.nodes.map((n) => n.position?.x ?? 0)) + 260
    : 240;
  const sourceId = `source-${ingestionId}`;
  bundle.graph.nodes.push({
    id: sourceId,
    ingestionId,
    type: "evidence",
    label: ingestion.title,
    value: rawText,
    group: "source",
    riskLevel: "low",
    confidence: 1,
    metadata: {
      synthetic: true,
      description:
        "Locally supplied demo source. No network collection was performed.",
    },
    position: { x: baseX, y: 260 },
  });
  entities.forEach((entity, index) => {
    const existingIndex = bundle.entities.findIndex((e) => e.id === entity.id);
    if (existingIndex >= 0) bundle.entities[existingIndex] = entity;
    else bundle.entities.push(entity);
    let graphNode = bundle.graph.nodes.find((n) => n.entityId === entity.id);
    if (!graphNode) {
      graphNode = node(
        entity.id,
        entity.type === "hash" ? "evidence" : entity.type,
        entity.value.length > 27
          ? `${entity.value.slice(0, 14)}…${entity.value.slice(-8)}`
          : entity.value,
        entity.value,
        baseX + 220 + Math.floor(index / 6) * 250,
        (index % 6) * 135,
        entity.confidence,
        "low",
        "Extracted locally from analyst-supplied demo text. Risk has not been evaluated.",
      );
      bundle.graph.nodes.push(graphNode);
    }
    const occurrence = rawText
      .toLowerCase()
      .indexOf(entity.value.toLowerCase());
    const snippet =
      occurrence >= 0
        ? rawText.slice(
            Math.max(0, occurrence - 70),
            occurrence + entity.value.length + 100,
          )
        : entity.value;
    evidenceSnippets.push(snippet);
    bundle.evidence.push({
      id: crypto.randomUUID(),
      entityId: entity.id,
      ingestionId,
      source: ingestion.platform,
      type: ingestion.sourceType,
      title: entity.value,
      snippet,
      confidence: entity.confidence,
      createdAt: now,
    });
    bundle.graph.edges.push({
      id: `${entity.id}--${sourceId}`,
      source: graphNode.id,
      target: sourceId,
      type: "mentioned_in",
      label: "mentioned in",
      confidence: entity.confidence,
      weight: 2,
      animated: false,
      evidenceSnippets: [snippet],
      ruleHits: [],
    });
  });
  bundle.ingestions.unshift(ingestion);
  bundle.case = {
    ...bundle.case,
    updatedAt: now,
    entityCount: bundle.entities.length,
    evidenceCount: bundle.evidence.length,
    correlationCount: bundle.candidates.length,
  };
  bundle.graph.generatedAt = now;
  const warnings = [
    "Demo extraction runs locally and identifies only supported text patterns. AI and infrastructure scoring are not recomputed in demo mode.",
  ];
  if (!entities.length)
    warnings.push(
      "No supported entity patterns were found. The supplied source was saved; try a domain, IP, @contact, wallet, or ‘alias: name’.",
    );
  bundle.profile.warnings = [
    ...new Set([...bundle.profile.warnings, ...warnings.slice(0, 1)]),
  ];
  saveState({ ...readState(), [id]: bundle });
  return { ingestion, entities, evidenceSnippets, warnings };
}
