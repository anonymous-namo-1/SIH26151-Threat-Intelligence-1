"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Database,
  FileText,
  FolderClosed,
  LayoutDashboard,
  LoaderCircle,
  Network,
  Plus,
  Search,
  Settings2,
  Shield,
  Upload,
  X,
  AlertCircle,
  ScanLine,
} from "lucide-react";
import { motion, MotionConfig } from "framer-motion";
import { apiMode, getCaseBundle, listCases } from "@/lib/api";
import type { CaseBundle, CaseRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { GraphWorkspace } from "@/components/graph-workspace";
import { SecondaryViews } from "@/components/secondary-views";

export function ArgusMark() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M18 3 32 28H4L18 3Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m18 12 8 14H10l8-14Z"
        fill="currentColor"
        fillOpacity=".13"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M18 18v16M3 28l9-5m21 5-9-5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="18" cy="22" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function AppShell({
  initialNodeId = null,
}: {
  initialNodeId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const parts = pathname.split("/").filter(Boolean);
  const routeCaseId = parts[0] === "cases" ? parts[1] : undefined;
  const view =
    parts[0] === "dashboard"
      ? "graph"
      : parts[0] === "cases"
        ? parts[2] || (parts[1] ? "case-detail" : "cases")
        : "settings";
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [activeId, setActiveId] = useState("");
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchNode, setSearchNode] = useState<string | null>(initialNodeId);
  const [searchSequence, setSearchSequence] = useState(0);
  const [help, setHelp] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const caseId = routeCaseId || activeId;
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  useEffect(() => setSearchNode(initialNodeId), [initialNodeId]);

  useEffect(() => {
    let alive = true;
    setError("");
    setLoading(true);
    listCases()
      .then((data) => {
        if (!alive) return;
        setCases(data);
        setActiveId((current) =>
          current && data.some((c) => c.id === current)
            ? current
            : data[0]?.id || "",
        );
        if (!data.length) setLoading(false);
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  useEffect(() => {
    if (!caseId) {
      setBundle(null);
      return;
    }
    let alive = true;
    setBundle((current) => (current?.case.id === caseId ? current : null));
    setLoading(true);
    setError("");
    getCaseBundle(caseId)
      .then((data) => {
        if (alive) {
          setBundle(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [caseId, refreshKey]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setHelp(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const caseHref = (suffix = "") =>
    caseId ? `/cases/${encodeURIComponent(caseId)}${suffix}` : "/cases";
  const results =
    bundle?.graph.nodes
      .filter((n) =>
        `${n.label} ${n.value} ${n.type}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .slice(0, 6) || [];
  const currentCase = bundle?.case || cases.find((c) => c.id === caseId);
  const nav = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
      active: parts[0] === "dashboard",
    },
    {
      label: "Cases",
      icon: FolderClosed,
      href: "/cases",
      active: view === "cases" || view === "case-detail",
    },
    {
      label: "Ingest",
      icon: Upload,
      href: caseHref("/ingest"),
      active: view === "ingest",
    },
    {
      label: "Graph",
      icon: Network,
      href: caseHref("/graph"),
      active: view === "graph" && parts[0] !== "dashboard",
    },
    {
      label: "Entities",
      icon: Boxes,
      href: caseHref("/entities"),
      active: view === "entities",
    },
    {
      label: "Reports",
      icon: FileText,
      href: caseHref("/report"),
      active: view === "report",
    },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header className="top-header">
          <Link
            href="/dashboard"
            className="brand"
            aria-label="Argus dashboard"
          >
            <ArgusMark />
            <span>
              ARGUS<span className="brand-sub">INTELLIGENCE PLATFORM</span>
            </span>
          </Link>
          <div className="header-divider" />
          <div className="case-picker">
            <FolderClosed size={15} />
            <select
              aria-label="Select case"
              value={caseId}
              onChange={(e) => {
                setActiveId(e.target.value);
                setSearchNode(null);
                if (parts[0] === "cases" && parts[1])
                  router.push(
                    `/cases/${encodeURIComponent(e.target.value)}/${parts[2] || "graph"}`,
                  );
              }}
            >
              <option value="" disabled>
                {cases.length ? "Select investigation" : "No investigations"}
              </option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
          <div className="global-search">
            <Search size={16} />
            <input
              ref={searchRef}
              aria-label="Search case entities"
              placeholder="Search entities, indicators, evidence…"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
            />
            <kbd>⌘ K</kbd>
            {searchOpen && (
              <>
                <button
                  className="search-dismiss"
                  aria-label="Close search"
                  onClick={() => setSearchOpen(false)}
                />
                <div className="search-results">
                  <span className="eyebrow">SEARCH THIS INVESTIGATION</span>
                  {results.length ? (
                    results.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setSearchNode(n.id);
                          setSearchSequence((v) => v + 1);
                          setSearchOpen(false);
                          router.push(
                            `${caseHref("/graph")}?node=${encodeURIComponent(n.id)}`,
                          );
                        }}
                      >
                        <ScanLine size={16} />
                        <span>
                          {n.label}
                          <small>{n.value}</small>
                        </span>
                        <span className="search-type">{n.type}</span>
                      </button>
                    ))
                  ) : (
                    <p>No matching entities in this case.</p>
                  )}
                </div>
              </>
            )}
          </div>
          <div
            className={`api-status ${error ? "is-error" : ""}`}
            title={
              error ||
              (apiMode === "demo"
                ? "Fictional local data. No backend requests."
                : "Connected through the configured API.")
            }
          >
            <i />
            <span>
              {error
                ? "API unavailable"
                : loading
                  ? "Connecting"
                  : apiMode === "demo"
                    ? "Demo environment"
                    : "API connected"}
            </span>
          </div>
          <Button asChild variant="outline" size="sm" className="export-header">
            <Link href={caseHref("/report")}>
              <ArrowDownToLine />
              Export report
            </Link>
          </Button>
          <div
            className="analyst-badge"
            title="Analyst placeholder · Authentication not enabled"
          >
            AK
            <span />
          </div>
        </header>
        <aside className="nav-rail" aria-label="Main navigation">
          <div className="rail-top-label">WORKSPACE</div>
          <nav>
            {nav.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                aria-label={n.label}
                aria-current={n.active ? "page" : undefined}
                className={`rail-link ${n.active ? "active" : ""}`}
                title={n.label}
              >
                <n.icon size={20} />
                <span>{n.label}</span>
              </Link>
            ))}
          </nav>
          <div className="rail-bottom">
            <button
              className="rail-link"
              aria-label="Workspace help"
              onClick={() => setHelp(true)}
              title="Workspace help"
            >
              <CircleHelp size={20} />
              <span>Help</span>
            </button>
            <Link
              className={`rail-link ${view === "settings" ? "active" : ""}`}
              href="/settings"
              aria-label="Settings"
              title="Settings"
            >
              <Settings2 size={20} />
              <span>Settings</span>
            </Link>
            <div className="rail-separator" />
            <div className="rail-version">
              A<span>V.06</span>
            </div>
          </div>
        </aside>
        <main
          className={`main-content ${view === "graph" ? "graph-page" : "secondary-page"}`}
        >
          {view === "graph" ? (
            <>
              <section className="workspace-heading">
                <div>
                  <div className="breadcrumb">
                    <span>Workspace</span>
                    <ChevronRight size={12} />
                    <span>Investigation graph</span>
                  </div>
                  <div className="workspace-title">
                    <h1>{currentCase?.title || "Investigation workspace"}</h1>
                    <span className="status-tag">
                      <i />
                      {currentCase?.status || "Ready"}
                    </span>
                  </div>
                  <p>Follow the signals. Connect the evidence.</p>
                </div>
                <div className="heading-actions">
                  <span className="case-reference">
                    {caseId
                      ? caseId.length > 20
                        ? `${caseId.slice(0, 8).toUpperCase()}`
                        : caseId
                      : "NO ACTIVE CASE"}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link href={caseHref("/ingest")}>
                      <Plus />
                      Add intelligence
                    </Link>
                  </Button>
                </div>
              </section>
              <section className="metrics-row" aria-label="Case statistics">
                <Metric
                  label="Entities identified"
                  value={bundle?.entities.length}
                  icon={Boxes}
                  detail="Across all sources"
                />
                <Metric
                  label="Evidence records"
                  value={bundle?.evidence.length}
                  icon={Database}
                  detail="Traceable source records"
                />
                <Metric
                  label="Correlations"
                  value={bundle?.candidates.length}
                  icon={Network}
                  detail="Candidate relationships"
                />
                <Metric
                  label="Case risk score"
                  value={bundle?.profile.riskScore}
                  icon={Shield}
                  risk
                  detail={
                    bundle
                      ? `${bundle.profile.riskLevel} priority · Analyst review`
                      : "Awaiting analysis"
                  }
                />
              </section>
              <motion.section
                className="graph-container"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {loading && !bundle ? (
                  <div className="workspace-state">
                    <div className="loading-orbit">
                      <LoaderCircle className="spin" size={26} />
                    </div>
                    <h2>Building the investigation</h2>
                    <p>
                      Connecting entities, evidence, and analytical signals.
                    </p>
                  </div>
                ) : error ? (
                  <div className="workspace-state error-state">
                    <AlertCircle size={32} />
                    <h2>Unable to load this investigation</h2>
                    <p>{error}</p>
                    <Button variant="outline" onClick={refresh}>
                      Retry connection
                    </Button>
                    <Link href="/cases">View cases</Link>
                  </div>
                ) : bundle ? (
                  <GraphWorkspace
                    key={bundle.case.id}
                    bundle={bundle}
                    searchNodeId={searchNode}
                    searchSequence={searchSequence}
                  />
                ) : (
                  <div className="workspace-state">
                    <FolderClosed size={34} />
                    <h2>Every investigation starts with a signal.</h2>
                    <p>
                      Create a case and add your first source to build a graph.
                    </p>
                    <Button asChild>
                      <Link href="/cases">
                        Create a case
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                )}
              </motion.section>
              <footer className="workspace-footer">
                <span>
                  <Shield size={12} />
                  Evidence-led analysis. Human judgment.
                </span>
                <span>
                  ARGUS<span className="footer-dot">/</span>MODULE 06
                  <span className="footer-dot">·</span>
                  {apiMode === "demo"
                    ? "SYNTHETIC DEMO DATA"
                    : "LIVE CASE DATA"}
                </span>
              </footer>
            </>
          ) : (
            <>
              {error && (
                <div className="page-error" role="alert">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                  <Button variant="outline" size="sm" onClick={refresh}>
                    Retry
                  </Button>
                </div>
              )}
              {loading && !bundle && view !== "cases" && view !== "settings" ? (
                <div className="workspace-state">
                  <LoaderCircle className="spin" />
                  <h2>Loading case intelligence</h2>
                </div>
              ) : (
                <SecondaryViews
                  view={view}
                  caseId={caseId}
                  bundle={bundle}
                  cases={cases}
                  onRefresh={refresh}
                />
              )}
            </>
          )}
        </main>
        {help && (
          <div className="dialog-backdrop" onClick={() => setHelp(false)}>
            <section
              className="help-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Workspace help"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                className="dialog-close"
                variant="ghost"
                size="icon"
                aria-label="Close help"
                onClick={() => setHelp(false)}
              >
                <X />
              </Button>
              <div className="eyebrow">ANALYST FIELD GUIDE</div>
              <h2>A clearer view of the connections.</h2>
              <p>
                Click an entity to inspect its signals. Click a relationship to
                review confidence, rule hits, and source evidence.
              </p>
              <div className="help-tip">
                <Network />
                Drag the canvas to pan. Scroll or use the controls to zoom.
              </div>
              <div className="help-tip">
                <Command />
                Use ⌘ / Ctrl + K to find an entity in the active case.
              </div>
              <div className="help-tip">
                <Activity />
                Move the inspector by its top handle. Resize from its lower
                corners.
              </div>
              <p className="help-note">
                Risk and correlation are analyst support only, never proof of
                identity or attribution.
              </p>
              <Button onClick={() => setHelp(false)}>
                Return to investigation
                <ArrowRight />
              </Button>
            </section>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  detail,
  risk = false,
}: {
  label: string;
  value?: number;
  icon: typeof Boxes;
  detail: string;
  risk?: boolean;
}) {
  return (
    <div className={`metric ${risk ? "risk-metric" : ""}`}>
      <div className="metric-icon">
        <Icon size={19} />
      </div>
      <div className="metric-copy">
        <span>{label}</span>
        <div>
          <strong>
            {value === undefined ? "—" : String(value).padStart(2, "0")}
          </strong>
          {risk && value !== undefined && <small>/ 100</small>}
          <span className="metric-detail">{detail}</span>
        </div>
      </div>
      {risk ? (
        <div className="risk-sparkline" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : (
        <svg
          className="metric-sparkline"
          viewBox="0 0 68 30"
          aria-hidden="true"
        >
          <path
            d="m0 27 9-5 7 2 8-12 7 5 9-5 7 2 7-9 7 2 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      )}
    </div>
  );
}
