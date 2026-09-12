"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Rnd } from "react-rnd";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock3,
  Code2,
  FileText,
  Grip,
  Info,
  Link2,
  Network,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import type { CaseBundle, GraphEdge, GraphNode, Signal } from "@/lib/types";

export type Selection =
  { kind: "node"; node: GraphNode } | { kind: "edge"; edge: GraphEdge } | null;
const tabs = [
  "Overview",
  "Evidence",
  "AI Profile",
  "Infrastructure",
  "Timeline",
  "Raw JSON",
] as const;
type Tab = (typeof tabs)[number];

export function AnalystPanel({
  bundle,
  selection,
  onClose,
  onClear,
  containerRef,
}: {
  bundle: CaseBundle;
  selection: Selection;
  onClose: () => void;
  onClear: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [bounds, setBounds] = useState({ width: 1000, height: 600 });
  const [position, setPosition] = useState({ x: 0, y: 16 });
  const [size, setSize] = useState({ width: 344, height: 560 });
  const [ready, setReady] = useState(false);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  useEffect(() => {
    if (!containerRef.current) return;
    let initialized = false;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width < 1 || height < 1) return;
      const wasInitialized = initialized;
      const nextSize = {
        width: Math.min(sizeRef.current.width, width - 24),
        height: Math.min(
          wasInitialized ? sizeRef.current.height : 560,
          height - 32,
        ),
      };
      setBounds({ width, height });
      setSize(nextSize);
      sizeRef.current = nextSize;
      setPosition((old) => ({
        x: wasInitialized
          ? Math.min(
              Math.max(8, old.x),
              Math.max(8, width - nextSize.width - 8),
            )
          : Math.max(8, width - nextSize.width - 16),
        y: Math.min(
          Math.max(8, old.y),
          Math.max(8, height - nextSize.height - 8),
        ),
      }));
      initialized = true;
      setReady(true);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef]);
  useEffect(
    () => setTab("Overview"),
    [
      selection?.kind,
      selection?.kind === "node"
        ? selection.node.id
        : selection?.kind === "edge"
          ? selection.edge.id
          : "",
    ],
  );
  const node = selection?.kind === "node" ? selection.node : null;
  const edge = selection?.kind === "edge" ? selection.edge : null;
  const evidence = node
    ? bundle.evidence.filter(
        (e) =>
          e.entityId === (node.entityId || node.id) ||
          e.ingestionId === node.ingestionId,
      )
    : bundle.evidence;
  const links = node
    ? bundle.graph.edges.filter(
        (e) => e.source === node.id || e.target === node.id,
      )
    : bundle.graph.edges;
  const risk = node?.riskLevel || bundle.profile.riskLevel;
  const confidence = node?.confidence ?? edge?.confidence;
  const relatedIngestionIds = new Set(evidence.map((e) => e.ingestionId));
  const timeline = node
    ? bundle.ingestions.filter((i) => relatedIngestionIds.has(i.id))
    : bundle.ingestions;
  const renderContent = () => {
    if (tab === "Raw JSON")
      return (
        <>
          <PanelSectionTitle icon={Code2}>Structured record</PanelSectionTitle>
          <pre className="json-block">
            {JSON.stringify(node || edge || bundle, null, 2)}
          </pre>
        </>
      );
    if (tab === "Evidence")
      return (
        <>
          <PanelSectionTitle icon={FileText}>
            {edge ? "Relationship evidence" : "Source evidence"}
          </PanelSectionTitle>
          {edge ? (
            edge.evidenceSnippets.length ? (
              edge.evidenceSnippets.map((snippet, i) => (
                <div className="evidence-card" key={i}>
                  <span className="eyebrow">
                    LINK EVIDENCE {String(i + 1).padStart(2, "0")}
                  </span>
                  <blockquote>{snippet}</blockquote>
                  <span className="evidence-meta">
                    <Check size={11} />
                    Linked source excerpt
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No source snippets are attached to this relationship." />
            )
          ) : evidence.length ? (
            evidence.map((e) => (
              <div className="evidence-card" key={e.id}>
                <div>
                  <span className="evidence-source">
                    <FileText size={12} />
                    {e.source}
                  </span>
                  <span className="confidence-small">
                    {Math.round(e.confidence * 100)}%
                  </span>
                </div>
                <h4>{e.title}</h4>
                <blockquote>{e.snippet}</blockquote>
                <span className="evidence-meta">
                  <Clock3 size={11} />
                  {formatDate(e.createdAt)}
                </span>
              </div>
            ))
          ) : (
            <Empty text="No linked evidence is available for this entity." />
          )}
        </>
      );
    if (tab === "AI Profile")
      return (
        <>
          <span className="context-label">CASE-LEVEL ANALYSIS</span>
          <PanelSectionTitle icon={Sparkles}>
            AI-assisted profile
          </PanelSectionTitle>
          <p className="panel-prose">{bundle.profile.summary}</p>
          <SignalList title="Stylometry" signals={bundle.profile.stylometry} />
          <SignalList
            title="Behavior patterns"
            signals={bundle.profile.behaviorPatterns}
          />
          <SignalList
            title="Rebrand signals"
            signals={bundle.profile.rebrandSignals}
          />
          {bundle.profile.attributionExplanations.map((e, i) => (
            <div className="signal-card" key={i}>
              <strong>{e.candidatePair.join(" ↔ ")}</strong>
              <p>{e.explanation}</p>
            </div>
          ))}
          <div className="analyst-caution">
            <Info size={14} />
            <p>
              Analyst support only. These signals are not proof of attribution
              or identity.
            </p>
          </div>
        </>
      );
    if (tab === "Infrastructure")
      return (
        <>
          <span className="context-label">CASE-LEVEL ANALYSIS</span>
          <PanelSectionTitle icon={Network}>
            Infrastructure findings
          </PanelSectionTitle>
          <div className="infra-score">
            <span>Infrastructure risk</span>
            <strong>
              {bundle.infrastructure.riskScore}
              <small>/100</small>
            </strong>
          </div>
          {bundle.infrastructure.findings.length ? (
            bundle.infrastructure.findings.map((f) => (
              <div className="signal-card" key={f.id}>
                <div className="finding-heading">
                  <strong>{f.title}</strong>
                  <span className={`severity-badge ${f.severity}`}>
                    {f.severity}
                  </span>
                </div>
                <p>{f.description}</p>
                {f.evidenceSnippets[0] && (
                  <blockquote>{f.evidenceSnippets[0]}</blockquote>
                )}
              </div>
            ))
          ) : (
            <Empty text="No infrastructure findings in the supplied metadata." />
          )}
          <p className="panel-footnote">
            Derived from supplied metadata. No active scanning.
          </p>
        </>
      );
    if (tab === "Timeline")
      return (
        <>
          <PanelSectionTitle icon={Clock3}>
            Evidence chronology
          </PanelSectionTitle>
          {timeline.length ? (
            <div className="timeline-list">
              {timeline.map((i) => (
                <div key={i.id} className="timeline-item">
                  <i />
                  <span className="eyebrow">{formatDate(i.createdAt)}</span>
                  <h4>{i.title || i.platform}</h4>
                  <p>
                    {i.sourceType.replaceAll("_", " ")} · {i.entityCount}{" "}
                    entities
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No linked ingestion events are available." />
          )}
        </>
      );
    if (edge)
      return (
        <>
          <div className="selection-type">
            <Link2 size={14} />
            RELATIONSHIP
          </div>
          <h3 className="selection-title">{edge.label}</h3>
          <div className="edge-endpoints">
            <span>
              {bundle.graph.nodes.find((n) => n.id === edge.source)?.label ||
                edge.source}
            </span>
            <ArrowDownRight size={15} />
            <span>
              {bundle.graph.nodes.find((n) => n.id === edge.target)?.label ||
                edge.target}
            </span>
          </div>
          <div className="confidence-card">
            <span>Link confidence</span>
            <strong>
              {Math.round(edge.confidence * 100)}
              <small>%</small>
            </strong>
            <div className="confidence-track">
              <i style={{ width: `${edge.confidence * 100}%` }} />
            </div>
          </div>
          <PanelSectionTitle icon={Shield}>Rule hits</PanelSectionTitle>
          {edge.ruleHits.length ? (
            edge.ruleHits.map((r, i) => (
              <div className="signal-card" key={i}>
                <strong>{r.rule.replaceAll("_", " ")}</strong>
                <p>{r.description}</p>
                {r.matchedValue && <code>{r.matchedValue}</code>}
              </div>
            ))
          ) : (
            <p className="panel-prose">
              This link is derived from source co-occurrence or a graph
              relationship. No resolution rules are attached.
            </p>
          )}
          <PanelSectionTitle icon={FileText}>
            Evidence snippets
          </PanelSectionTitle>
          {edge.evidenceSnippets.length ? (
            edge.evidenceSnippets.map((s, i) => (
              <blockquote className="standalone-quote" key={i}>
                {s}
              </blockquote>
            ))
          ) : (
            <Empty text="No evidence snippets attached." />
          )}
          <div className="analyst-caution">
            <Info size={14} />
            <p>
              A candidate connection is an analytical signal, not proof of
              identity.
            </p>
          </div>
        </>
      );
    if (node)
      return (
        <>
          <div className="selection-type">
            <span className={`severity-dot ${risk}`} />
            {node.type.replaceAll("_", " ")}
          </div>
          <h3 className="selection-title">{node.label}</h3>
          <code className="entity-value">{node.value}</code>
          <div className="entity-stat-grid">
            <div>
              <span>Confidence</span>
              <strong>
                {Math.round((confidence || 0) * 100)}
                <small>%</small>
              </strong>
            </div>
            <div>
              <span>Risk level</span>
              <strong className={`risk-text ${risk}`}>{risk}</strong>
            </div>
          </div>
          <div className="panel-counts">
            <span>
              <FileText size={13} />
              {evidence.length} evidence records
            </span>
            <span>
              <Network size={13} />
              {links.length} connections
            </span>
          </div>
          <PanelSectionTitle icon={Link2}>
            Connected intelligence
          </PanelSectionTitle>
          {links.length ? (
            links.slice(0, 6).map((l) => {
              const neighbor = bundle.graph.nodes.find(
                (n) => n.id === (l.source === node.id ? l.target : l.source),
              );
              return (
                <div className="connection-row" key={l.id}>
                  <span className="connection-glyph">
                    <Network size={14} />
                  </span>
                  <div>
                    <strong>{neighbor?.label || "Entity"}</strong>
                    <span>{l.label}</span>
                  </div>
                  <small>{Math.round(l.confidence * 100)}%</small>
                </div>
              );
            })
          ) : (
            <Empty text="No relationships yet." />
          )}
          {Object.keys(node.metadata).length > 0 && (
            <>
              <PanelSectionTitle icon={Info}>Entity context</PanelSectionTitle>
              <dl className="metadata-list">
                {Object.entries(node.metadata)
                  .filter(([key]) => key !== "position")
                  .slice(0, 5)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </>
          )}
        </>
      );
    return (
      <>
        <div className="summary-eyebrow">
          <span className="eyebrow">CASE INTELLIGENCE</span>
          <span className={`severity-badge ${risk}`}>{risk} risk</span>
        </div>
        <h3 className="summary-title">The bigger picture.</h3>
        <p className="panel-prose summary-description">
          {bundle.case.description}
        </p>
        <div className="case-risk-card">
          <div className={`risk-ring ${risk}`}>
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" className="risk-ring-track" />
              <circle
                cx="50"
                cy="50"
                r="42"
                className="risk-ring-progress"
                strokeDasharray={`${bundle.profile.riskScore * 2.64} 264`}
              />
            </svg>
            <div>
              <strong>{bundle.profile.riskScore}</strong>
              <small>RISK SCORE</small>
            </div>
          </div>
          <div>
            <span className="risk-label">{risk} exposure</span>
            <p>
              {bundle.profile.riskScore > 60
                ? "Multiple signals warrant analyst attention."
                : "Review emerging signals and source context."}
            </p>
            <span className="risk-support">
              <Shield size={11} />
              Explainable scoring
            </span>
          </div>
        </div>
        <PanelSectionTitle icon={ActivityIcon}>
          Key signals
          <span className="section-count">
            {bundle.profile.riskBreakdown.length}
          </span>
        </PanelSectionTitle>
        {bundle.profile.riskBreakdown.slice(0, 3).map((r, i) => (
          <div className="risk-signal" key={r.factor}>
            <span className="signal-number">0{i + 1}</span>
            <div>
              <strong>{r.factor.replaceAll("_", " ")}</strong>
              <p>{r.rationale}</p>
            </div>
            <span className="signal-points">+{r.points}</span>
          </div>
        ))}
        {!bundle.profile.riskBreakdown.length && (
          <Empty text="Ingest evidence to generate risk signals." />
        )}
        <button
          className="panel-text-link"
          onClick={() => setTab("AI Profile")}
        >
          Explore AI profile
          <ArrowUpRight size={14} />
        </button>
        <div className="analyst-caution">
          <Info size={14} />
          <p>
            Signals inform investigation.
            <br />
            Attribution requires analyst verification.
          </p>
        </div>
      </>
    );
  };
  const content = (
    <motion.section
      className={`analyst-panel ${bounds.width < 720 ? "panel-mobile" : ""}`}
      aria-label="Analyst inspector"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="panel-drag-handle" aria-label="Analyst panel drag handle">
        <Grip size={15} />
        <span>ANALYST INSPECTOR</span>
        <div className="panel-header-actions">
          {selection && (
            <button
              title="Return to case summary"
              aria-label="Clear selection"
              onClick={onClear}
            >
              <ArrowDownRight size={14} />
            </button>
          )}
          <button aria-label="Close analyst panel" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="panel-tabs" role="tablist" aria-label="Inspector views">
        {tabs.map((t) => (
          <button
            id={`inspector-tab-${t.replaceAll(" ", "-")}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls="inspector-content"
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        className="panel-scroll"
        id="inspector-content"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab.replaceAll(" ", "-")}`}
      >
        {renderContent()}
      </div>
      <div className="panel-bottom">
        <span>
          <i />
          {selection ? "SELECTED INTELLIGENCE" : "CASE OVERVIEW"}
        </span>
        <Link href={`/cases/${encodeURIComponent(bundle.case.id)}`}>
          Open case
          <ArrowUpRight size={12} />
        </Link>
      </div>
    </motion.section>
  );
  if (!ready) return null;
  if (bounds.width < 720)
    return <div className="mobile-inspector-wrapper">{content}</div>;
  return (
    <Rnd
      className="inspector-rnd"
      size={size}
      position={position}
      minWidth={300}
      minHeight={280}
      maxWidth={Math.min(540, bounds.width - 16)}
      maxHeight={bounds.height - 16}
      bounds="parent"
      dragHandleClassName="panel-drag-handle"
      cancel="button"
      onDragStop={(_, d) => setPosition({ x: d.x, y: d.y })}
      onResizeStop={(_, __, ref, ___, p) => {
        setSize({ width: ref.offsetWidth, height: ref.offsetHeight });
        setPosition(p);
      }}
      resizeHandleStyles={{
        bottomRight: { right: 0, bottom: 0, width: 22, height: 22, zIndex: 30 },
      }}
      resizeHandleComponent={{
        bottomRight: (
          <span className="resize-grip" aria-label="Resize analyst panel" />
        ),
      }}
    >
      {content}
    </Rnd>
  );
}

const ActivityIcon = Sparkles;
function PanelSectionTitle({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon: typeof Shield;
}) {
  return (
    <h4 className="panel-section-title">
      <Icon size={13} />
      {children}
    </h4>
  );
}
function SignalList({ title, signals }: { title: string; signals: Signal[] }) {
  return (
    <>
      <PanelSectionTitle icon={Sparkles}>{title}</PanelSectionTitle>
      {signals.length ? (
        signals.map((s, i) => (
          <div className="signal-card" key={i}>
            <strong>{s.type.replaceAll("_", " ")}</strong>
            <p>{s.description}</p>
            <span className="confidence-small">
              {Math.round(s.confidence * 100)}% confidence
            </span>
          </div>
        ))
      ) : (
        <Empty text="No supported signals identified." />
      )}
    </>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="panel-empty">{text}</p>;
}
function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
