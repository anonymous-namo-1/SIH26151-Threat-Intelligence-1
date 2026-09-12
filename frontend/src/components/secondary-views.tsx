"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronRight,
  Database,
  FileJson,
  FileText,
  Fingerprint,
  Folder,
  Globe2,
  Layers3,
  Loader2,
  Network,
  Plus,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api, apiMode } from "@/lib/api";
import type {
  CaseBundle,
  CaseRecord,
  EntityRecord,
  IngestionInput,
  IngestionKind,
  IngestionResult,
  Signal,
} from "@/lib/types";
import "./secondary.css";

type Props = {
  view: string;
  caseId: string;
  bundle: CaseBundle | null;
  cases: CaseRecord[];
  onRefresh: () => void;
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const humanize = (value: string) =>
  value.replaceAll("_", " ").replaceAll("-", " ");
const shortId = (value: string) => value.slice(0, 8).toUpperCase();
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date unavailable"
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

function Heading({
  eyebrow = "Intelligence workspace",
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="sec-heading">
      <div>
        <div className="sec-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="sec-actions">{children}</div>}
    </div>
  );
}

function Action({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link className={`sec-btn ${primary ? "sec-btn-primary" : ""}`} href={href}>
      {children}
    </Link>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`sec-badge sec-badge-${value.toLowerCase()}`}>
      {humanize(value)}
    </span>
  );
}

function Empty({
  icon: Icon = Database,
  title,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sec-empty">
      <Icon size={27} strokeWidth={1.25} />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
  risk = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  note: string;
  risk?: boolean;
}) {
  return (
    <div className="sec-card sec-stat">
      <div className="sec-stat-label">
        <Icon size={13} />
        {label}
      </div>
      <div className={`sec-stat-value ${risk ? "sec-high" : ""}`}>
        {value ?? "—"}
        {risk && value !== null && <span className="sec-stat-unit">/100</span>}
      </div>
      <div className="sec-stat-note">{note}</div>
    </div>
  );
}

function RiskRing({
  score,
  label = "Risk score",
}: {
  score: number;
  label?: string;
}) {
  return (
    <div
      className="sec-risk-ring"
      role="img"
      aria-label={`${label}: ${score} out of 100`}
      style={
        { "--sec-risk": Math.max(0, Math.min(100, score)) } as CSSProperties
      }
    >
      <strong>{score}</strong>
      <span>{label}</span>
    </div>
  );
}

function EntityTable({ entities }: { entities: EntityRecord[] }) {
  return (
    <div className="sec-table-wrap">
      <table className="sec-table">
        <thead>
          <tr>
            <th>Entity / indicator</th>
            <th>Type</th>
            <th>Confidence</th>
            <th>First observed</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={entity.id}>
              <td className="sec-entity-value">{entity.value}</td>
              <td>
                <Badge value={entity.type} />
              </td>
              <td className="sec-mono sec-cyan">
                {percent(entity.confidence)}
              </td>
              <td>{date(entity.firstSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CasesView({ cases, onRefresh }: Pick<Props, "cases" | "onRefresh">) {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CaseRecord | null>(null);
  const allCases =
    created && !cases.some((item) => item.id === created.id)
      ? [created, ...cases]
      : cases;

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Give this case a title to continue.");
      return;
    }
    setBusy(true);
    try {
      const record = await api.createCase({
        title: title.trim(),
        description: description.trim(),
      });
      setCreated(record);
      setIsCreating(false);
      setTitle("");
      setDescription("");
      onRefresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the case. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        title="Case directory"
        description="Your investigations, evidence, and connected intelligence in one place."
      >
        <button
          className="sec-btn sec-btn-primary"
          onClick={() => setIsCreating(!isCreating)}
        >
          <Plus size={14} />
          New case
        </button>
      </Heading>
      {isCreating && (
        <form
          className="sec-card sec-form"
          onSubmit={create}
          style={{ marginBottom: 22 }}
        >
          <h2>
            <Folder size={16} />
            Create an investigation
          </h2>
          <div className="sec-form-row">
            <label className="sec-label">
              Case title
              <input
                className="sec-input"
                autoFocus
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Operation Nightfall"
              />
            </label>
            <label className="sec-label">
              Description
              <input
                className="sec-input"
                maxLength={5000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Scope and purpose of the investigation"
              />
            </label>
          </div>
          {error && (
            <div className="sec-error" role="alert">
              {error}
            </div>
          )}
          <div className="sec-actions">
            <button className="sec-btn sec-btn-primary" disabled={busy}>
              {busy ? (
                <Loader2 size={14} className="sec-spin" />
              ) : (
                <Plus size={14} />
              )}
              {busy ? "Creating…" : "Create case"}
            </button>
            <button
              className="sec-btn"
              type="button"
              onClick={() => setIsCreating(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {created && (
        <div className="sec-success" role="status" style={{ marginBottom: 18 }}>
          Case created.{" "}
          <Link
            href={`/cases/${created.id}`}
            className="sec-case-link"
            style={{ display: "inline" }}
          >
            Open {created.title} →
          </Link>
        </div>
      )}
      {allCases.length === 0 ? (
        <Empty icon={Folder} title="Start your first investigation">
          Create a case, add analyst-supplied evidence, and explore its
          connected entities.
        </Empty>
      ) : (
        <div className="sec-table-wrap">
          <table className="sec-table">
            <thead>
              <tr>
                <th>Investigation</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Entities</th>
                <th>Updated</th>
                <th aria-label="Open case" />
              </tr>
            </thead>
            <tbody>
              {allCases.map((record) => (
                <tr key={record.id}>
                  <td>
                    <Link
                      className="sec-case-link"
                      href={`/cases/${record.id}`}
                    >
                      <Folder size={17} />
                      <span>
                        {record.title}
                        <span className="sec-title-sub">
                          {record.description || `CASE / ${shortId(record.id)}`}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Badge value={record.status} />
                  </td>
                  <td
                    className={
                      record.riskScore !== null && record.riskScore >= 70
                        ? "sec-high sec-mono"
                        : "sec-mono"
                    }
                  >
                    {record.riskScore === null
                      ? "—"
                      : `${record.riskScore}/100`}
                  </td>
                  <td className="sec-mono">{record.entityCount ?? "—"}</td>
                  <td>{date(record.updatedAt)}</td>
                  <td>
                    <Link
                      className="sec-case-link"
                      aria-label={`Open ${record.title}`}
                      href={`/cases/${record.id}`}
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sec-disclosure">
        {allCases.length} investigation{allCases.length === 1 ? "" : "s"} ·{" "}
        {apiMode === "demo"
          ? "Demo data stored in this browser"
          : "Connected to your configured API"}
      </p>
    </>
  );
}

function CaseDetail({ bundle }: { bundle: CaseBundle }) {
  const { case: record } = bundle;
  const path = `/cases/${record.id}`;
  return (
    <>
      <Heading
        eyebrow={`Case / ${shortId(record.id)}`}
        title={record.title}
        description={`Created ${date(record.createdAt)} · Updated ${date(record.updatedAt)}`}
      >
        <Badge value={record.status} />
        <Action href={`${path}/ingest`}>
          <Upload size={13} />
          Add intelligence
        </Action>
        <Action href={`${path}/graph`} primary>
          <Network size={14} />
          Open graph
        </Action>
      </Heading>
      <p className="sec-detail-description">
        {record.description ||
          "This investigation is ready for analyst-supplied evidence."}
      </p>
      <div className="sec-stats">
        <Stat
          icon={ShieldCheck}
          label="Risk score"
          value={bundle.profile.riskScore}
          note={`${bundle.profile.riskLevel.toUpperCase()} PRIORITY`}
          risk
        />
        <Stat
          icon={Users}
          label="Entities"
          value={bundle.entities.length}
          note="EXTRACTED INDICATORS"
        />
        <Stat
          icon={FileText}
          label="Evidence"
          value={bundle.evidence.length}
          note="SOURCE-LINKED RECORDS"
        />
        <Stat
          icon={Network}
          label="Correlations"
          value={bundle.candidates.length}
          note="CANDIDATES TO REVIEW"
        />
      </div>
      <div className="sec-grid">
        <section className="sec-card">
          <div className="sec-card-top">
            <h2>
              <Layers3 size={15} />
              Recent ingestions
            </h2>
            <Action href={`${path}/ingest`}>
              <Plus size={12} />
              Add
            </Action>
          </div>
          {bundle.ingestions.length === 0 ? (
            <Empty icon={Upload} title="No ingestion history">
              Add a source to start building the evidence trail.
            </Empty>
          ) : (
            <ul className="sec-list">
              {bundle.ingestions.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <div className="sec-list-title">
                    <span>
                      {item.title || item.platform || humanize(item.sourceType)}
                    </span>
                    <time className="sec-ingestion-time">
                      {date(item.createdAt)}
                    </time>
                  </div>
                  <p>
                    {humanize(item.sourceType)} · {item.entityCount} extracted
                    entities
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="sec-card">
          <h2>
            <BrainCircuit size={16} />
            Intelligence summary
          </h2>
          <p className="sec-muted">
            {bundle.profile.summary ||
              "Add evidence to generate case intelligence."}
          </p>
          <div className="sec-divider" />
          <div className="sec-stack">
            <Action href={`${path}/ai-profile`}>
              <BrainCircuit size={14} />
              AI profile
              <ArrowRight size={13} />
            </Action>
            <Action href={`${path}/infrastructure`}>
              <Server size={14} />
              Infrastructure findings
              <ArrowRight size={13} />
            </Action>
            <Action href={`${path}/report`}>
              <FileText size={14} />
              Investigation report
              <ArrowRight size={13} />
            </Action>
          </div>
        </section>
      </div>
    </>
  );
}

const ingestKinds: {
  id: IngestionKind;
  title: string;
  icon: LucideIcon;
  description: string;
}[] = [
  {
    id: "synthetic",
    title: "Synthetic text",
    icon: FileText,
    description:
      "Paste fictional forum or marketplace content to test the extraction workflow.",
  },
  {
    id: "osint",
    title: "Public OSINT",
    icon: Globe2,
    description:
      "Add a legally obtained public report, advisory, or indicator summary with source attribution.",
  },
  {
    id: "profile",
    title: "Profile text",
    icon: Fingerprint,
    description:
      "Extract identities, aliases, contacts, and indicators from analyst-supplied profile text.",
  },
  {
    id: "onion-metadata",
    title: "Onion metadata",
    icon: Layers3,
    description:
      "Record previously collected, analyst-supplied onion metadata for correlation.",
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    icon: Server,
    description:
      "Correlate supplied domains, IP addresses, headers, and certificate observations.",
  },
];

function IngestView({
  caseId,
  onRefresh,
}: Pick<Props, "caseId" | "onRefresh">) {
  const [kind, setKind] = useState<IngestionKind>("synthetic");
  const [fields, setFields] = useState<Record<string, string>>({
    text: "",
    sourceName: "",
    metadata: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IngestionResult | null>(null);
  const selected = ingestKinds.find((item) => item.id === kind)!;
  const set = (key: string, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const fieldLimits: Record<string, number> = {
    sourceUrl: 1000,
    sourceName: 200,
    platform: 200,
    handle: 200,
    domain: 255,
    ipAddress: 80,
    serverHeader: 1000,
    certificateFingerprint: 200,
    category: 120,
    language: 80,
    status: 80,
  };
  const field = (
    key: string,
    title: string,
    placeholder: string,
    required = false,
    type = "text",
  ) => (
    <label className="sec-label" key={key}>
      {title}
      {required ? " *" : ""}
      <input
        className="sec-input"
        type={type}
        required={required}
        maxLength={fieldLimits[key] ?? 500}
        value={fields[key] || ""}
        onChange={(event) => set(key, event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (!caseId) {
      setError("Create or select a case before adding intelligence.");
      return;
    }
    const input: IngestionInput = {};
    try {
      if (fields.metadata?.trim()) {
        const metadata: unknown = JSON.parse(fields.metadata);
        if (
          !metadata ||
          typeof metadata !== "object" ||
          Array.isArray(metadata)
        )
          throw new Error(
            'Metadata must be a JSON object, such as {"analyst_note": "reviewed"}.',
          );
        input.metadata = metadata as Record<string, unknown>;
      }
      if (["synthetic", "osint", "profile"].includes(kind)) {
        if (!fields.text?.trim())
          throw new Error("Paste source text before submitting.");
        input.text = fields.text.trim();
        if (kind === "osint") {
          if (!fields.sourceName?.trim())
            throw new Error("Add the public source name for attribution.");
          input.sourceName = fields.sourceName.trim();
          if (fields.sourceUrl?.trim())
            input.sourceUrl = fields.sourceUrl.trim();
        } else {
          if (fields.platform?.trim()) input.platform = fields.platform.trim();
          if (kind === "synthetic" && fields.handle?.trim())
            input.handle = fields.handle.trim();
        }
      } else if (kind === "onion-metadata") {
        if (!fields.onionUrl?.toLowerCase().includes(".onion"))
          throw new Error("Enter an onion host or URL containing .onion.");
        input.onionUrl = fields.onionUrl.trim();
        if (fields.title?.trim()) input.title = fields.title.trim();
        input.structuredData = Object.fromEntries(
          ["category", "language", "status"]
            .filter((key) => fields[key]?.trim())
            .map((key) => [key, fields[key].trim()]),
        );
      } else {
        if (
          ![
            "domain",
            "ipAddress",
            "serverHeader",
            "certificateFingerprint",
          ].some((key) => fields[key]?.trim())
        )
          throw new Error(
            "Add at least one domain, IP address, server header, or certificate fingerprint.",
          );
        if (fields.domain?.trim()) input.domain = fields.domain.trim();
        if (fields.ipAddress?.trim()) input.ipAddress = fields.ipAddress.trim();
        if (fields.serverHeader?.trim())
          input.serverHeader = fields.serverHeader.trim();
        if (fields.certificateFingerprint?.trim())
          input.certificateFingerprint = fields.certificateFingerprint.trim();
        if (fields.notes?.trim()) input.notes = fields.notes.trim();
      }
      if (fields.observedAt) input.observedAt = fields.observedAt;
      setBusy(true);
      const response = await api.ingest(caseId, kind, input);
      setResult(response);
      onRefresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ingestion failed. Check the source and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        eyebrow="Collection / analyst supplied"
        title="Add intelligence"
        description="Turn source material into connected, traceable investigation data."
      >
        <Action href={`/cases/${caseId}/graph`}>
          <Network size={14} />
          View graph
        </Action>
      </Heading>
      <div className="sec-segments" role="tablist" aria-label="Ingestion type">
        {ingestKinds.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={item.id === kind}
            aria-controls="ingestion-form"
            id={`ingest-tab-${item.id}`}
            key={item.id}
            className={`sec-segment ${item.id === kind ? "active" : ""}`}
            onClick={() => {
              setKind(item.id);
              setError("");
              setResult(null);
            }}
          >
            <item.icon size={13} />
            {item.title}
          </button>
        ))}
      </div>
      <div className="sec-grid sec-ingest-grid">
        <section
          className="sec-card"
          id="ingestion-form"
          role="tabpanel"
          aria-labelledby={`ingest-tab-${kind}`}
        >
          <h2>
            <selected.icon size={16} />
            {selected.title}
          </h2>
          <p className="sec-muted" style={{ marginBottom: 22 }}>
            {selected.description}
          </p>
          <form onSubmit={submit} className="sec-form">
            {kind === "osint" && (
              <div className="sec-form-row">
                {field(
                  "sourceName",
                  "Source name",
                  "Public advisory or report publisher",
                  true,
                )}
                {field(
                  "sourceUrl",
                  "Source URL",
                  "https://example.org/report",
                  false,
                  "url",
                )}
              </div>
            )}
            {(kind === "synthetic" || kind === "profile") && (
              <div className="sec-form-row">
                {field(
                  "platform",
                  "Platform / source",
                  kind === "synthetic"
                    ? "Synthetic forum"
                    : "Analyst-supplied profile",
                )}
                {kind === "synthetic"
                  ? field("handle", "Handle", "e.g. @nightjar")
                  : field("observedAt", "Observed on", "", false, "date")}
              </div>
            )}
            {["synthetic", "osint", "profile"].includes(kind) && (
              <label className="sec-label">
                Source text *
                <textarea
                  className="sec-input"
                  rows={9}
                  required
                  maxLength={200000}
                  value={fields.text || ""}
                  onChange={(event) => set("text", event.target.value)}
                  placeholder={
                    kind === "synthetic"
                      ? "Actor: Nightjar. Alias: void_walker. Contact: @nightjar_ops.\nObserved domain: relay.example. IP: 203.0.113.42.\n\nPaste synthetic source content here…"
                      : "Paste the source content for entity extraction…"
                  }
                />
                <small>
                  Preserve context around indicators so extracted evidence
                  remains useful.
                </small>
              </label>
            )}
            {kind === "onion-metadata" && (
              <>
                {field(
                  "onionUrl",
                  "Onion host / URL",
                  "Analyst-supplied .onion address",
                  true,
                )}
                {field("title", "Page title", "Recorded page or service title")}
                <div className="sec-form-row">
                  {field("category", "Category", "e.g. forum")}
                  {field("language", "Language", "e.g. English")}
                </div>
                {field(
                  "status",
                  "Recorded status",
                  "e.g. observed in supplied report",
                )}
              </>
            )}
            {kind === "infrastructure" && (
              <>
                <div className="sec-form-row">
                  {field("domain", "Domain", "relay.example")}
                  {field("ipAddress", "IP address", "203.0.113.42")}
                </div>
                {field("serverHeader", "Server header", "e.g. nginx/1.24")}
                {field(
                  "certificateFingerprint",
                  "Certificate fingerprint",
                  "Supplied SHA-256 certificate fingerprint",
                )}
                <label className="sec-label">
                  Analyst notes
                  <textarea
                    className="sec-input"
                    rows={3}
                    maxLength={5000}
                    value={fields.notes || ""}
                    onChange={(event) => set("notes", event.target.value)}
                    placeholder="Describe the source and context of these observations."
                  />
                </label>
              </>
            )}
            {kind !== "profile" &&
              kind !== "onion-metadata" &&
              field("observedAt", "Observed on", "", false, "date")}
            <details>
              <summary className="sec-muted" style={{ cursor: "pointer" }}>
                Additional metadata (optional JSON)
              </summary>
              <label className="sec-label" style={{ marginTop: 12 }}>
                <span>Metadata object</span>
                <textarea
                  className="sec-input"
                  rows={3}
                  value={fields.metadata || ""}
                  onChange={(event) => set("metadata", event.target.value)}
                  placeholder={'{"analyst_note": "source reviewed"}'}
                />
              </label>
            </details>
            {error && (
              <div className="sec-error" role="alert">
                {error}
              </div>
            )}
            <div className="sec-actions">
              <button
                className="sec-btn sec-btn-primary"
                type="submit"
                disabled={busy || !caseId}
              >
                {busy ? (
                  <Loader2 size={14} className="sec-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {busy
                  ? "Extracting intelligence…"
                  : kind === "onion-metadata" || kind === "infrastructure"
                    ? "Analyze metadata"
                    : "Extract entities"}
              </button>
              <span className="sec-muted">
                {apiMode === "demo"
                  ? "Demo extraction"
                  : "Processed by your API"}
              </span>
            </div>
          </form>
        </section>
        <aside className="sec-stack">
          <div className="sec-note">
            <ShieldCheck size={16} />
            <span>
              Analyst-supplied or legal public data only. No live onion
              crawling, no Tor, and no active scanning. Supplied URLs are
              treated as evidence.
            </span>
          </div>
          <section className="sec-card">
            <h2>
              <Database size={15} />
              Extraction results
            </h2>
            {busy ? (
              <Empty icon={Loader2} title="Processing your source">
                Extracting entities and linking source evidence…
              </Empty>
            ) : result ? (
              <>
                <div className="sec-success" role="status">
                  <Check
                    size={13}
                    style={{ display: "inline", marginRight: 5 }}
                  />
                  Source added · {result.entities.length} entities extracted
                </div>
                {result.entities.length > 0 ? (
                  <ul className="sec-list" style={{ marginTop: 17 }}>
                    {result.entities.map((entity) => (
                      <li key={entity.id}>
                        <div className="sec-list-title">
                          <Badge value={entity.type} />
                          <span className="sec-mono sec-cyan">
                            {percent(entity.confidence)}
                          </span>
                        </div>
                        <p
                          className="sec-mono"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {entity.value}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sec-muted" style={{ marginTop: 14 }}>
                    No recognizable entities were found in this source. The
                    ingestion has been saved.
                  </p>
                )}
                {result.evidenceSnippets.slice(0, 3).map((snippet, index) => (
                  <blockquote className="sec-snippet" key={index}>
                    {snippet}
                  </blockquote>
                ))}
                {result.warnings.map((warning, index) => (
                  <p className="sec-disclosure" key={index}>
                    {warning}
                  </p>
                ))}
                <div className="sec-divider" />
                <Action href={`/cases/${caseId}/graph`}>
                  <Network size={13} />
                  Explore updated graph
                  <ArrowRight size={12} />
                </Action>
              </>
            ) : (
              <Empty icon={Fingerprint} title="Your evidence starts here">
                Submit a source to review extracted identities, indicators, and
                confidence scores.
              </Empty>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function EntitiesView({ bundle }: { bundle: CaseBundle }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const types = [
    ...new Set(bundle.entities.map((entity) => entity.type)),
  ].sort();
  const filtered = useMemo(
    () =>
      bundle.entities.filter(
        (entity) =>
          (type === "all" || entity.type === type) &&
          `${entity.value} ${entity.type}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [bundle.entities, query, type],
  );
  return (
    <>
      <Heading
        title="Entity registry"
        description="Review the identities and indicators extracted from this investigation."
      >
        <Action href={`/cases/${bundle.case.id}/graph`} primary>
          <Network size={14} />
          Explore graph
        </Action>
      </Heading>
      <div className="sec-toolbar">
        <div className="sec-search">
          <Search size={14} />
          <input
            aria-label="Search entities"
            className="sec-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search indicators, names, or types…"
          />
        </div>
        <div className="sec-actions" style={{ width: "auto" }}>
          <span className="sec-muted">{filtered.length} entities</span>
          <select
            aria-label="Filter entity type"
            className="sec-input"
            style={{ width: 145 }}
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">All entity types</option>
            {types.map((item) => (
              <option value={item} key={item}>
                {humanize(item)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {filtered.length ? (
        <EntityTable entities={filtered} />
      ) : (
        <Empty
          icon={Search}
          title={
            bundle.entities.length ? "No matching entities" : "No entities yet"
          }
        >
          {bundle.entities.length
            ? "Try another search or choose a different entity type."
            : "Add source material to extract your first indicators."}
        </Empty>
      )}
    </>
  );
}

function Signals({
  title,
  icon: Icon,
  signals,
}: {
  title: string;
  icon: LucideIcon;
  signals: Signal[];
}) {
  return (
    <section className="sec-card">
      <h2>
        <Icon size={16} />
        {title}
      </h2>
      {signals.length ? (
        <ul className="sec-list">
          {signals.map((signal, index) => (
            <li key={`${signal.type}-${index}`}>
              <div className="sec-list-title">
                <span style={{ textTransform: "capitalize" }}>
                  {humanize(signal.type)}
                </span>
                <span className="sec-mono sec-cyan">
                  {percent(signal.confidence)}
                </span>
              </div>
              <p>{signal.description}</p>
              {signal.evidenceSnippets
                .slice(0, 1)
                .map((snippet, snippetIndex) => (
                  <blockquote className="sec-snippet" key={snippetIndex}>
                    {snippet}
                  </blockquote>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sec-muted">
          No supported signals in the current evidence.
        </p>
      )}
    </section>
  );
}

function AiProfileView({ bundle }: { bundle: CaseBundle }) {
  const profile = bundle.profile;
  return (
    <>
      <Heading
        eyebrow="Analysis / AI profile"
        title="Behavioral intelligence"
        description="Evidence-backed signals that support your assessment of this investigation."
      >
        <Action href={`/cases/${bundle.case.id}/graph`}>
          <Network size={14} />
          Open graph
        </Action>
      </Heading>
      <div className="sec-note sec-note-warn" style={{ marginBottom: 20 }}>
        <ShieldCheck size={16} />
        <span>
          Analyst support only, not proof of identity or attribution. Confidence
          scores describe the available signals; corroborate conclusions with
          independent evidence.
        </span>
      </div>
      <div className="sec-grid" style={{ marginBottom: 17 }}>
        <section className="sec-card sec-risk-card">
          <RiskRing score={profile.riskScore} />
          <div className="sec-risk-info">
            <Badge value={profile.riskLevel} />
            <h2>Investigation risk</h2>
            <p>
              {profile.summary ||
                "Additional evidence is needed to generate a profile."}
            </p>
          </div>
        </section>
        <section className="sec-card">
          <h2>
            <SlidersHorizontal size={15} />
            Risk breakdown
          </h2>
          {profile.riskBreakdown.length ? (
            <ul className="sec-list">
              {profile.riskBreakdown.map((factor, index) => (
                <li key={index}>
                  <div className="sec-list-title">
                    <span>{humanize(factor.factor)}</span>
                    <span className="sec-mono">+{factor.points} pts</span>
                  </div>
                  <p>{factor.rationale}</p>
                  <div className="sec-progress">
                    <span
                      style={{ width: `${Math.min(100, factor.points)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sec-muted">No contributing factors recorded.</p>
          )}
        </section>
      </div>
      <div className="sec-grid sec-grid-thirds" style={{ marginBottom: 17 }}>
        <Signals
          title="Stylometry"
          icon={Fingerprint}
          signals={profile.stylometry}
        />
        <Signals
          title="Behavior patterns"
          icon={BrainCircuit}
          signals={profile.behaviorPatterns}
        />
        <Signals
          title="Rebrand signals"
          icon={Users}
          signals={profile.rebrandSignals}
        />
      </div>
      <section className="sec-card">
        <h2>
          <Network size={16} />
          Attribution explanations
        </h2>
        {profile.attributionExplanations.length ? (
          <ul className="sec-list">
            {profile.attributionExplanations.map((item, index) => (
              <li key={index}>
                <div className="sec-list-title">
                  <span>{item.candidatePair.join(" ↔ ")}</span>
                  <span className="sec-mono sec-cyan">
                    {percent(item.confidence)} confidence
                  </span>
                </div>
                <p>{item.explanation}</p>
                {item.warning && (
                  <p className="sec-disclosure">{item.warning}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sec-muted">
            No attribution candidates supported by the current evidence.
          </p>
        )}
      </section>
      {profile.warnings.map((warning, index) => (
        <p className="sec-disclosure" key={index}>
          {warning}
        </p>
      ))}
    </>
  );
}

function InfrastructureView({ bundle }: { bundle: CaseBundle }) {
  const infrastructure = bundle.infrastructure;
  return (
    <>
      <Heading
        eyebrow="Analysis / infrastructure"
        title="Infrastructure findings"
        description="Shared certificates, headers, domains, and IP signals from supplied observations."
      >
        <Action href={`/cases/${bundle.case.id}/ingest`} primary>
          <Plus size={14} />
          Add observation
        </Action>
      </Heading>
      <div className="sec-stats">
        <Stat
          icon={ShieldCheck}
          label="Infrastructure risk"
          value={infrastructure.riskScore}
          note={`${infrastructure.riskLevel.toUpperCase()} PRIORITY`}
          risk
        />
        <Stat
          icon={Server}
          label="Findings"
          value={infrastructure.findings.length}
          note="CORRELATED OBSERVATIONS"
        />
        <Stat
          icon={Layers3}
          label="Signals"
          value={infrastructure.signals.length}
          note="SUPPORTING PATTERNS"
        />
        <Stat
          icon={Globe2}
          label="Infrastructure entities"
          value={
            bundle.entities.filter((entity) =>
              ["domain", "ip", "onion"].includes(entity.type),
            ).length
          }
          note="DOMAINS · IPs · ONIONS"
        />
      </div>
      {infrastructure.findings.length ? (
        <div className="sec-grid">
          {infrastructure.findings.map((finding) => (
            <article className="sec-card sec-finding" key={finding.id}>
              <div className="sec-card-top">
                <h2>
                  <Server size={15} />
                  {finding.title}
                </h2>
                <Badge value={finding.severity} />
              </div>
              <p>{finding.description}</p>
              <div className="sec-finding-tags">
                {finding.matchedValues.map((value, index) => (
                  <span className="sec-tag" key={index}>
                    {value}
                  </span>
                ))}
              </div>
              {finding.evidenceSnippets.slice(0, 2).map((snippet, index) => (
                <blockquote className="sec-snippet" key={index}>
                  {snippet}
                </blockquote>
              ))}
              <span className="sec-mono sec-cyan">
                {percent(finding.confidence)} confidence
              </span>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Server} title="No infrastructure findings">
          Add related infrastructure observations to identify shared
          certificates, headers, IPs, and domains.
        </Empty>
      )}
      {infrastructure.signals.length > 0 && (
        <div style={{ marginTop: 17 }}>
          <Signals
            title="Supporting infrastructure signals"
            icon={Network}
            signals={infrastructure.signals}
          />
        </div>
      )}
      {infrastructure.warnings.map((warning, index) => (
        <p className="sec-disclosure" key={index}>
          {warning}
        </p>
      ))}
    </>
  );
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function ReportView({ bundle }: { bundle: CaseBundle }) {
  const [exported, setExported] = useState("");
  const actors = bundle.entities.filter((entity) =>
    ["actor", "alias"].includes(entity.type),
  );
  const stem = `argus-${shortId(bundle.case.id).toLowerCase()}`;
  function exportJson() {
    download(
      JSON.stringify(
        {
          exportFormat: "argus-case-v1",
          exportedAt: new Date().toISOString(),
          mode: apiMode,
          ...bundle,
        },
        null,
        2,
      ),
      `${stem}.json`,
      "application/json",
    );
    setExported("JSON report downloaded.");
  }
  function exportCsv() {
    const rows = [
      [
        "Evidence ID",
        "Entity ID",
        "Source",
        "Type",
        "Title",
        "Evidence snippet",
        "Confidence",
        "Observed at",
      ],
      ...bundle.evidence.map((item) => [
        item.id,
        item.entityId,
        item.source,
        item.type,
        item.title,
        item.snippet,
        item.confidence,
        item.createdAt,
      ]),
    ];
    download(
      `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`,
      `${stem}-evidence.csv`,
      "text/csv;charset=utf-8",
    );
    setExported("Evidence CSV downloaded.");
  }
  return (
    <>
      <Heading
        eyebrow={`Reporting / ${shortId(bundle.case.id)}`}
        title="Investigation report"
        description={`${bundle.case.title} · Evidence prepared for analyst review`}
      >
        <button className="sec-btn" disabled title="PDF export is coming soon">
          <ArrowDownToLine size={13} />
          PDF · Coming soon
        </button>
        <button className="sec-btn" onClick={exportCsv}>
          <ArrowDownToLine size={13} />
          CSV
        </button>
        <button className="sec-btn sec-btn-primary" onClick={exportJson}>
          <FileJson size={14} />
          Export JSON
        </button>
      </Heading>
      {exported && (
        <div className="sec-success" role="status" style={{ marginBottom: 18 }}>
          {exported}
        </div>
      )}
      <div className="sec-grid" style={{ marginBottom: 22 }}>
        <section className="sec-card">
          <h2>
            <Users size={16} />
            Actor & alias summary
          </h2>
          <p className="sec-muted" style={{ marginBottom: 16 }}>
            {bundle.profile.summary ||
              bundle.case.description ||
              "No analysis summary available."}
          </p>
          {actors.length ? (
            <ul className="sec-list">
              {actors.slice(0, 5).map((entity) => (
                <li key={entity.id}>
                  <div className="sec-list-title">
                    <span className="sec-mono">{entity.value}</span>
                    <Badge value={entity.type} />
                  </div>
                  <p>
                    {percent(entity.confidence)} extraction confidence · First
                    observed {date(entity.firstSeen)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sec-muted">No actor or alias entities recorded.</p>
          )}
        </section>
        <section className="sec-card">
          <h2>
            <Network size={16} />
            Graph snapshot
          </h2>
          <div className="sec-empty sec-report-snapshot">
            <Network size={27} strokeWidth={1.2} />
            <strong>Snapshot export is coming soon</strong>
            <p>
              The interactive workspace contains {bundle.graph.nodes.length}{" "}
              nodes and {bundle.graph.edges.length} relationships.
            </p>
            <Action href={`/cases/${bundle.case.id}/graph`}>
              Open interactive graph
              <ArrowRight size={12} />
            </Action>
          </div>
        </section>
      </div>
      <div className="sec-toolbar">
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
          Evidence register
        </h2>
        <span className="sec-muted">
          {bundle.evidence.length} source-linked records
        </span>
      </div>
      {bundle.evidence.length ? (
        <div className="sec-table-wrap">
          <table className="sec-table">
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Source</th>
                <th>Snippet</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {bundle.evidence.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span style={{ color: "#d0dce7" }}>
                      {item.title || humanize(item.type)}
                    </span>
                    <span className="sec-title-sub sec-mono">
                      {shortId(item.id)}
                    </span>
                  </td>
                  <td>{item.source || humanize(item.type)}</td>
                  <td
                    style={{
                      minWidth: 240,
                      maxWidth: 500,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.snippet}
                  </td>
                  <td className="sec-mono sec-cyan">
                    {percent(item.confidence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={FileText} title="No evidence to report">
          Ingest source material to begin assembling the evidence register.
        </Empty>
      )}
      <p className="sec-disclosure">
        {apiMode === "demo" ? "DEMO DATA · " : ""}This report supports analyst
        review. Correlations and AI assessments are not proof of identity or
        wrongdoing. JSON includes the current case data; CSV includes the
        evidence register.
      </p>
    </>
  );
}

function SettingsView() {
  return (
    <>
      <Heading
        title="Workspace settings"
        description="Connection details and the defaults for this analyst workspace."
      />
      <div className="sec-grid">
        <section className="sec-card">
          <h2>
            <Server size={16} />
            Connection
          </h2>
          <div className="sec-settings-row">
            <div>
              Data mode
              <p>Determined by the frontend environment configuration.</p>
            </div>
            <Badge value={apiMode === "demo" ? "Demo mode" : "Live API"} />
          </div>
          <div className="sec-settings-row">
            <div>
              API base URL<p>Configured with NEXT_PUBLIC_API_BASE_URL.</p>
            </div>
            <span className="sec-settings-value">
              {process.env.NEXT_PUBLIC_API_BASE_URL || "Not configured"}
            </span>
          </div>
          <div className="sec-settings-row">
            <div>
              Persistence
              <p>
                {apiMode === "demo"
                  ? "Demo case changes are saved in this browser."
                  : "Your FastAPI backend manages case persistence."}
              </p>
            </div>
            <span className="sec-settings-value">
              {apiMode === "demo" ? "Local browser storage" : "Backend"}
            </span>
          </div>
        </section>
        <section className="sec-card">
          <h2>
            <SlidersHorizontal size={16} />
            Workspace defaults
          </h2>
          <div className="sec-settings-row">
            <div>
              Appearance<p>Dark investigation canvas with cyan accents.</p>
            </div>
            <span className="sec-settings-value">Dark</span>
          </div>
          <div className="sec-settings-row">
            <div>
              Analyst identity
              <p>Authentication is planned for a future release.</p>
            </div>
            <Badge value="UI placeholder" />
          </div>
          <div className="sec-settings-row">
            <div>
              Motion
              <p>Animations follow your device accessibility preference.</p>
            </div>
            <span className="sec-settings-value">System preference</span>
          </div>
        </section>
      </div>
      <div className="sec-note" style={{ marginTop: 18 }}>
        <ShieldCheck size={16} />
        <span>
          Argus analyzes supplied evidence and legal public data. Collection
          does not include active scanning, Tor, or live onion crawling.
        </span>
      </div>
    </>
  );
}

export function SecondaryViews({
  view,
  caseId,
  bundle,
  cases,
  onRefresh,
}: Props) {
  let content: ReactNode;
  if (view === "cases")
    content = <CasesView cases={cases} onRefresh={onRefresh} />;
  else if (view === "settings") content = <SettingsView />;
  else if (view === "ingest")
    content = <IngestView caseId={caseId} onRefresh={onRefresh} />;
  else if (!bundle)
    content = (
      <Empty icon={Folder} title="No case selected">
        Choose an investigation from the case selector or create one in the case
        directory.
      </Empty>
    );
  else if (view === "entities") content = <EntitiesView bundle={bundle} />;
  else if (view === "ai-profile") content = <AiProfileView bundle={bundle} />;
  else if (view === "infrastructure")
    content = <InfrastructureView bundle={bundle} />;
  else if (view === "report") content = <ReportView bundle={bundle} />;
  else content = <CaseDetail bundle={bundle} />;
  return <div className="sec-page">{content}</div>;
}
