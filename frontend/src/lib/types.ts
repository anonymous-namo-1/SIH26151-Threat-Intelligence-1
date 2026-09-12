export type RiskLevel = "low" | "medium" | "high" | "critical";
export type NodeType =
  | "actor"
  | "alias"
  | "wallet"
  | "pgp"
  | "telegram"
  | "email"
  | "domain"
  | "ip"
  | "onion"
  | "malware"
  | "mitre"
  | "evidence"
  | "cve";
export type IngestionKind =
  "synthetic" | "osint" | "profile" | "onion-metadata" | "infrastructure";

export interface CaseRecord {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Summary metrics are unknown until the live case bundle is loaded. */
  riskScore: number | null;
  entityCount: number | null;
  evidenceCount: number | null;
  correlationCount: number | null;
}

export interface RuleHit {
  rule: string;
  description: string;
  score: number;
  matchedValue?: string;
  evidenceSnippets: string[];
  sourceIngestionIds: string[];
}

export interface GraphNode {
  id: string;
  entityId?: string;
  ingestionId?: string;
  type: NodeType;
  label: string;
  value: string;
  group: string;
  riskLevel: RiskLevel;
  confidence: number;
  metadata: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  confidence: number;
  weight: number;
  animated: boolean;
  evidenceSnippets: string[];
  ruleHits: RuleHit[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: string[];
  generatedAt: string;
}

export interface EntityRecord {
  id: string;
  type: NodeType | "hash";
  value: string;
  normalizedValue: string;
  confidence: number;
  firstSeen: string;
  lastSeen: string;
}

export interface EvidenceRecord {
  id: string;
  entityId: string;
  ingestionId: string;
  source: string;
  type: string;
  title: string;
  snippet: string;
  confidence: number;
  createdAt: string;
}

export interface IngestionRecord {
  id: string;
  sourceType: string;
  platform: string;
  title: string;
  rawText: string;
  createdAt: string;
  entityCount: number;
}

export interface ResolutionCandidate {
  id: string;
  leftEntityId: string;
  rightEntityId: string;
  leftLabel: string;
  rightLabel: string;
  confidence: number;
  ruleHits: RuleHit[];
  evidenceSnippets: string[];
  warnings: string[];
}

export interface Signal {
  type: string;
  description: string;
  confidence: number;
  matchedValues: string[];
  evidenceSnippets: string[];
}

export interface AiProfile {
  summary: string;
  riskScore: number;
  riskLevel: RiskLevel;
  riskBreakdown: {
    factor: string;
    points: number;
    rationale: string;
    evidenceRefs: string[];
  }[];
  stylometry: Signal[];
  behaviorPatterns: Signal[];
  rebrandSignals: Signal[];
  attributionExplanations: {
    candidatePair: string[];
    confidence: number;
    explanation: string;
    supportingRules: string[];
    evidenceSnippets: string[];
    warning: string;
  }[];
  recommendedNextSteps: string[];
  warnings: string[];
}

export interface InfrastructureFinding {
  id: string;
  type: string;
  title: string;
  severity: RiskLevel;
  confidence: number;
  description: string;
  matchedValues: string[];
  evidenceSnippets: string[];
  relatedHandles: string[];
}

export interface InfrastructureData {
  riskScore: number;
  riskLevel: RiskLevel;
  findings: InfrastructureFinding[];
  signals: Signal[];
  warnings: string[];
}

export interface CaseBundle {
  case: CaseRecord;
  graph: GraphData;
  entities: EntityRecord[];
  evidence: EvidenceRecord[];
  candidates: ResolutionCandidate[];
  profile: AiProfile;
  infrastructure: InfrastructureData;
  ingestions: IngestionRecord[];
}

export interface IngestionInput {
  text?: string;
  sourceName?: string;
  sourceUrl?: string;
  platform?: string;
  handle?: string;
  onionUrl?: string;
  title?: string;
  domain?: string;
  ipAddress?: string;
  serverHeader?: string;
  certificateFingerprint?: string;
  notes?: string;
  observedAt?: string;
  metadata?: Record<string, unknown>;
  /** Additional analyst-supplied metadata fields in backend snake_case. */
  structuredData?: Record<string, unknown>;
}

export interface IngestionResult {
  ingestion: IngestionRecord;
  entities: EntityRecord[];
  evidenceSnippets: string[];
  warnings: string[];
}
