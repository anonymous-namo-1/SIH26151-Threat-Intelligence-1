import { Actor, Investigation, InfrastructureAsset, Wallet, Transaction, Persona, EvidenceItem, IntelligenceEvent, Relationship, Report } from '../types';

export const mockActors: Actor[] = [
  {
    id: 'act-nyx-1',
    name: 'NYX COLLECTIVE',
    type: 'CYBERCRIME',
    threatLevel: 'CRITICAL',
    confidenceLevel: 'HIGH',
    aliases: [
      { id: 'al-1', name: 'SilentOmen', context: 'Darknet forums', firstSeen: '2022-04-12T00:00:00Z', lastSeen: '2023-11-05T00:00:00Z' },
      { id: 'al-2', name: 'TKS-88', context: 'Malware deployment signatures', firstSeen: '2023-01-15T00:00:00Z', lastSeen: '2023-12-01T00:00:00Z' }
    ],
    motivation: 'Financial gain via targeted ransomware and extortion, focusing on critical supply chain logistics.',
    origin: 'Eastern Europe (Suspected)',
    activeSince: '2022-04',
    description: 'A highly sophisticated ransomware-as-a-service (RaaS) affiliate group known for double-extortion tactics. Demonstrates advanced defense evasion and novel living-off-the-land (LotL) techniques. Infrastructure analysis indicates overlapping toolsets with historically state-aligned groups, though current operations appear strictly financially motivated.',
    confidenceFactors: [
      { id: 'cf-1', factor: 'Cryptocurrency Tracking', description: 'Blockchain analysis links 4 extortion payouts directly to known NYX consolidation wallets.', reliabilityScore: 92, corroborated: true },
      { id: 'cf-2', factor: 'TTP Overlap', description: 'Deployment of custom Rust-based encryptor matches signatures from 3 distinct incident responses.', reliabilityScore: 88, corroborated: true },
      { id: 'cf-3', factor: 'Linguistic Analysis', description: 'Ransom notes contain specific idiomatic structures consistent across campaigns.', reliabilityScore: 75, corroborated: false }
    ]
  },
  {
    id: 'act-velvet-2',
    name: 'VELVET TYPHOON',
    type: 'NATION_STATE',
    threatLevel: 'HIGH',
    confidenceLevel: 'CONFIRMED',
    aliases: [],
    motivation: 'Strategic IP theft, espionage against aerospace and defense sectors.',
    origin: 'East Asia',
    activeSince: '2019-08',
    description: 'State-sponsored entity targeting advanced manufacturing and defense contractors. Known for prolonged dwell times and zero-day exploitation.',
    confidenceFactors: []
  }
];

export const mockInvestigations: Investigation[] = [
  {
    id: 'inv-2023-088',
    title: 'Operation Obsidian - Supply Chain Compromise',
    status: 'OPEN',
    priority: 'URGENT',
    leadAnalyst: 'A. Chen',
    createdAt: '2023-11-12T08:30:00Z',
    updatedAt: '2023-12-04T14:22:00Z',
    summary: 'Investigating a series of breaches affecting tier-2 logistics providers. TTPs align with NYX COLLECTIVE. Extortion demands range from $2M-$5M.',
    targetId: 'act-nyx-1'
  },
  {
    id: 'inv-2023-042',
    title: 'AeroSpace Telemetry Exfiltration',
    status: 'OPEN',
    priority: 'HIGH',
    leadAnalyst: 'J. Miller',
    createdAt: '2023-09-01T10:15:00Z',
    updatedAt: '2023-11-20T09:45:00Z',
    summary: 'Tracking steady exfiltration of CAD documents from sub-contractors. Suspected VELVET TYPHOON activity.',
    targetId: 'act-velvet-2'
  }
];

export const mockInfrastructure: InfrastructureAsset[] = [
  { id: 'inf-1', type: 'IP', value: '185.192.69.112', asn: 'AS205544', location: 'NL', lastActive: '2023-12-03T18:44:00Z', relatedActorId: 'act-nyx-1', confidence: 'HIGH' },
  { id: 'inf-2', type: 'DOMAIN', value: 'auth-telemetry-update.com', lastActive: '2023-11-28T12:00:00Z', relatedActorId: 'act-nyx-1', confidence: 'MEDIUM' },
  { id: 'inf-3', type: 'MALWARE_C2', value: 'cobaltstrike-https (443)', location: 'RU', lastActive: '2023-12-01T09:15:00Z', relatedActorId: 'act-nyx-1', confidence: 'CONFIRMED' },
  { id: 'inf-4', type: 'IP', value: '45.133.192.88', asn: 'AS51852', location: 'BG', lastActive: '2023-11-15T00:00:00Z', confidence: 'LOW' },
];

export const mockWallets: Wallet[] = [
  { id: 'wal-1', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', currency: 'BTC', balance: 14.5, totalReceived: 185.2, totalSent: 170.7, lastActivity: '2023-12-02T10:22:00Z', riskScore: 98, relatedActorId: 'act-nyx-1' },
  { id: 'wal-2', address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', currency: 'ETH', balance: 450.1, totalReceived: 1200.5, totalSent: 750.4, lastActivity: '2023-11-29T14:11:00Z', riskScore: 85 }
];

export const mockTransactions: Transaction[] = [
  { id: 'tx-1', walletId: 'wal-1', txHash: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16', amount: 2.5, timestamp: '2023-12-02T10:22:00Z', type: 'OUTBOUND', counterpartyAddress: 'bc1qxyz...', exposure: 'MIXER' },
  { id: 'tx-2', walletId: 'wal-1', txHash: 'a1075fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16', amount: 15.0, timestamp: '2023-11-20T08:15:00Z', type: 'INBOUND', counterpartyAddress: '1A1zP...', exposure: 'EXCHANGE' },
];

export const mockPersonas: Persona[] = [
  { id: 'per-1', handle: 'SilentOmen', platform: 'Exploit.in', language: 'Russian', activitySchedule: 'UTC+3 10:00-18:00', traits: ['Highly technical', 'Brokers access', 'Avoids political discussions'], associatedActorId: 'act-nyx-1' },
  { id: 'per-2', handle: 'TKS-88', platform: 'Telegram', language: 'English (Non-native)', activitySchedule: 'UTC+3 12:00-22:00', traits: ['Aggressive negotiator', 'Impatient', 'Uses crypto slang'], associatedActorId: 'act-nyx-1' }
];

export const mockEvidence: EvidenceItem[] = [
  { id: 'ev-1', title: 'C2 Beacon Packet Capture', type: 'PCAP', source: 'Sensor-Alpha-04', dateCollected: '2023-11-15T03:22:11Z', reliability: 95, contentSnippet: '...sleep 60000; jitter 10%; uri /jquery-3.3.1.min.js...', classification: 'CONFIDENTIAL' },
  { id: 'ev-2', title: 'Ransomware Binary (Rust)', type: 'DOCUMENT', source: 'Incident Response #401', dateCollected: '2023-11-18T14:00:00Z', reliability: 99, contentSnippet: 'SHA256: 8f4e3... Encryptor requires --pass parameter to execute payload.', classification: 'RESTRICTED' as any },
  { id: 'ev-3', title: 'Forum post offering logistics network access', type: 'OSINT', source: 'Exploit.in', dateCollected: '2023-10-25T09:11:00Z', reliability: 80, contentSnippet: '"Have VPN access to major EU shipping firm. $15k escrow only."', classification: 'UNCLASSIFIED' }
];

export const mockEvents: IntelligenceEvent[] = [
  { id: 'evt-1', timestamp: '2023-10-25T09:11:00Z', title: 'Access Broker Listing', description: 'SilentOmen listed access to an EU logistics firm.', eventType: 'COMMUNICATION', relatedEntities: ['per-1', 'act-nyx-1'] },
  { id: 'evt-2', timestamp: '2023-11-12T03:00:00Z', title: 'Initial Access / Recon', description: 'Logistics firm reports anomalous VPN authentications.', eventType: 'CAMPAIGN_LAUNCH', relatedEntities: ['act-nyx-1', 'inf-1'] },
  { id: 'evt-3', timestamp: '2023-11-15T03:22:11Z', title: 'C2 Infrastructure Active', description: 'Beaconing observed to 185.192.69.112.', eventType: 'INFRA_SETUP', relatedEntities: ['inf-1', 'ev-1'] },
  { id: 'evt-4', timestamp: '2023-11-20T08:15:00Z', title: 'Ransom Deployment', description: 'Network-wide encryption initiated using custom Rust payload.', eventType: 'BREACH', relatedEntities: ['act-nyx-1', 'ev-2'] }
];

export const mockRelationships: Relationship[] = [
  { id: 'rel-1', sourceId: 'act-nyx-1', targetId: 'inf-1', type: 'CONTROLS', confidence: 'HIGH', lastObserved: '2023-12-03T18:44:00Z' },
  { id: 'rel-2', sourceId: 'act-nyx-1', targetId: 'inf-2', type: 'USES', confidence: 'MEDIUM', lastObserved: '2023-11-28T12:00:00Z' },
  { id: 'rel-3', sourceId: 'act-nyx-1', targetId: 'wal-1', type: 'CONTROLS', confidence: 'CONFIRMED', lastObserved: '2023-12-02T10:22:00Z' },
  { id: 'rel-4', sourceId: 'per-1', targetId: 'act-nyx-1', type: 'ALIAS_OF', confidence: 'HIGH', lastObserved: '2023-11-05T00:00:00Z' }
];

export const mockReports: Report[] = [
  {
    id: 'rep-1',
    title: 'Threat Profile: NYX COLLECTIVE',
    classification: 'CONFIDENTIAL',
    author: 'A. Chen',
    date: '2023-12-05T00:00:00Z',
    sections: [
      { id: 'sec-1', title: 'Executive Summary', content: 'NYX COLLECTIVE represents an escalating threat to supply chain operations...', evidenceIds: [], order: 1 },
      { id: 'sec-2', title: 'Technical Analysis', content: 'The group utilizes a custom Rust-based encryptor...', evidenceIds: ['ev-2'], order: 2 }
    ]
  }
];
