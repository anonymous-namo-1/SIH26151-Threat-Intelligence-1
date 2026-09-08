export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CONFIRMED';
export type ThreatLevel = 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export interface ConfidenceFactor {
  id: string;
  factor: string;
  description: string;
  reliabilityScore: number; // 0-100
  corroborated: boolean;
}

export interface Actor {
  id: string;
  name: string;
  type: 'NATION_STATE' | 'CYBERCRIME' | 'HACKTIVIST' | 'INSIDER' | 'UNKNOWN';
  threatLevel: ThreatLevel;
  confidenceLevel: ConfidenceLevel;
  aliases: Alias[];
  motivation: string;
  origin: string;
  activeSince: string;
  description: string;
  confidenceFactors: ConfidenceFactor[];
}

export interface Alias {
  id: string;
  name: string;
  context: string;
  firstSeen: string;
  lastSeen: string;
}

export interface Investigation {
  id: string;
  title: string;
  status: 'OPEN' | 'CLOSED' | 'ON_HOLD';
  priority: 'ROUTINE' | 'HIGH' | 'URGENT';
  leadAnalyst: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  targetId?: string;
}

export interface InfrastructureAsset {
  id: string;
  type: 'IP' | 'DOMAIN' | 'SERVER' | 'MALWARE_C2' | 'DROP_ZONE';
  value: string;
  asn?: string;
  location?: string;
  lastActive: string;
  relatedActorId?: string;
  confidence: ConfidenceLevel;
}

export interface Wallet {
  id: string;
  address: string;
  currency: 'BTC' | 'ETH' | 'XMR' | 'USDT';
  balance: number;
  totalReceived: number;
  totalSent: number;
  lastActivity: string;
  riskScore: number; // 0-100
  relatedActorId?: string;
}

export interface Transaction {
  id: string;
  walletId: string;
  txHash: string;
  amount: number;
  timestamp: string;
  type: 'INBOUND' | 'OUTBOUND';
  counterpartyAddress: string;
  exposure: 'EXCHANGE' | 'MIXER' | 'DARKNET' | 'UNKNOWN';
}

export interface Persona {
  id: string;
  handle: string;
  platform: string;
  language: string;
  activitySchedule: string; // e.g. "UTC+3 Business Hours"
  traits: string[];
  associatedActorId?: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  type: 'LOG' | 'PCAP' | 'DOCUMENT' | 'OSINT' | 'HUMINT';
  source: string;
  dateCollected: string;
  reliability: number; // 0-100
  contentSnippet: string;
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
}

export interface IntelligenceEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  eventType: 'CAMPAIGN_LAUNCH' | 'INFRA_SETUP' | 'FUNDS_TRANSFER' | 'COMMUNICATION' | 'BREACH';
  relatedEntities: string[]; // IDs of actors, infra, etc.
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'CONTROLS' | 'USES' | 'COMMUNICATES_WITH' | 'TRANSFERS_TO' | 'ALIAS_OF';
  confidence: ConfidenceLevel;
  lastObserved: string;
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  evidenceIds: string[];
  order: number;
}

export interface Report {
  id: string;
  title: string;
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  author: string;
  date: string;
  sections: ReportSection[];
}
