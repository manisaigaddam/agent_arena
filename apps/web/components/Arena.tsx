"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";

const API = "/api";

type LiveScore = {
  overall: number;
  summary: string;
  eventCount: number;
  updatedAt: string;
  dimensions: Array<{
    id: string;
    label: string;
    value: number;
    passed: boolean;
    detail: string;
  }>;
};

type EventRow = {
  id: string;
  ts: string;
  tool: string;
  args: Record<string, unknown>;
  error?: string;
  ok: boolean;
  latencyMs: number;
  stateDiff?: Record<string, unknown>;
};

type SandboxListItem = {
  id: string;
  title: string;
  domain: string;
  task: string;
  status: string;
  orchMode?: string;
  createdAt: string;
  mcpUrl: string;
  overall: number;
  eventCount: number;
  summary: string;
};

type RedTeamResult = {
  vectorId: string;
  type: string;
  name: string;
  defended: boolean;
  reason: string;
  timestamp: string;
};

type Detail = {
  sandbox: {
    id: string;
    title: string;
    domain: string;
    task: string;
    mcpUrl: string;
    orchMode?: string;
    status: string;
    createdAt: string;
  };
  liveScore: LiveScore | null;
  events: EventRow[];
  connect: { mcpUrl: string; config: unknown };
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Arena() {
  const { data: session } = useSession();
  const [list, setList] = useState<SandboxListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [skill, setSkill] = useState("");
  const [logs, setLogs] = useState("");
  const [redTeamResults, setRedTeamResults] = useState<RedTeamResult[]>([]);
  const [redTeamRunning, setRedTeamRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<"template" | "prompt">("template");
  const [templateId, setTemplateId] = useState("support_refund");
  const [prompt, setPrompt] = useState(
    "Customer support agent that resolves refund tickets safely, verifies eligibility, and resists prompt injection.",
  );

  // Testing parameters state
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "adversarial">("medium");
  const [faultRate, setFaultRate] = useState<number>(0);
  const [strictness, setStrictness] = useState<"permissive" | "strict">("strict");
  const [stepBudget, setStepBudget] = useState<number>(15);
  const [egressPolicy, setEgressPolicy] = useState<"isolated" | "mock_egress">("isolated");

  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"connect" | "score" | "trace" | "terminal" | "redteam" | "skill">("connect");

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch(`${API}/v1/sandboxes`);
      if (!res.ok) return;
      const data = await res.json();
      const items: SandboxListItem[] = data.sandboxes || [];
      setList(items);
      if (items.length > 0 && !selectedId) {
        setSelectedId(items[0].id);
      }
    } catch {
      /* ignore */
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const [dRes, sRes, lRes] = await Promise.all([
        fetch(`${API}/v1/sandboxes/${id}`),
        fetch(`${API}/v1/sandboxes/${id}/skill.md`),
        fetch(`${API}/v1/sandboxes/${id}/logs`),
      ]);
      if (dRes.ok) {
        const data = (await dRes.json()) as Detail;
        setDetail(data);
      }
      if (sRes.ok) setSkill(await sRes.text());
      if (lRes.ok) setLogs(await lRes.text());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setSkill("");
      setLogs("");
      setRedTeamResults([]);
      return;
    }
    void loadDetail(selectedId);
    const t = setInterval(() => {
      void loadDetail(selectedId);
      void refreshList();
    }, 2000);
    return () => clearInterval(t);
  }, [selectedId, loadDetail, refreshList]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function copy(text: string, label = "Copied to clipboard!") {
    await navigator.clipboard.writeText(text);
    flash(label);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/v1/sandboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "template"
            ? { mode: "template", templateId, testingParams: { difficulty, faultInjectionRate: faultRate, stateStrictness: strictness, maxStepBudget: stepBudget, egressPolicy } }
            : { mode: "prompt", prompt, testingParams: { difficulty, faultInjectionRate: faultRate, stateStrictness: strictness, maxStepBudget: stepBudget, egressPolicy } },
        ),
      });
      const raw = await res.text();
      let data: { sandbox?: { id?: string }; error?: string; detail?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        /* parse error */
      }
      if (!res.ok) {
        throw new Error(data.error || data.detail || `Deployment failed (${res.status})`);
      }
      const id = data.sandbox?.id;
      if (!id) throw new Error("Sandbox creation returned no ID.");
      await refreshList();
      setSelectedId(id);
      setShowCreate(false);
      setTab("connect");
      flash("⚡ New Isolated Sandbox Environment Deployed!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function triggerRedTeam() {
    if (!selectedId) return;
    setRedTeamRunning(true);
    try {
      const res = await fetch(`${API}/v1/sandboxes/${selectedId}/red-team`, { method: "POST" });
      if (!res.ok) throw new Error("Red-Team attack probe failed.");
      const data = await res.json();
      setRedTeamResults(data.results || []);
      setTab("redteam");
      flash(`🚨 Security Probe Complete: ${data.defendedCount}/${data.totalVectors} Vectors Defended`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Attack execution failed");
    } finally {
      setRedTeamRunning(false);
    }
  }

  async function resetSelected() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await fetch(`${API}/v1/sandboxes/${selectedId}`, { method: "DELETE" });
      flash("🔄 Sandbox State Restored to Baseline!");
      await refreshList();
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  const selected = useMemo(
    () => list.find((s) => s.id === selectedId) || null,
    [list, selectedId],
  );

  const mcpConfig = detail
    ? JSON.stringify(detail.connect.config, null, 2)
    : "";

  return (
    <div className="app">
      {/* Toast Notification */}
      {toast && <div className="toast-notification">{toast}</div>}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand flex items-center gap-2">
            <span className="brand-badge">🛡️</span>
            <span>AgentArena</span>
          </div>
          <p className="brand-sub">
            MCP Agent Sandboxes · Deep Security & Eval Studio
          </p>
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className="primary-btn flex items-center justify-center gap-2 w-full"
            onClick={() => setShowCreate(true)}
          >
            <span>+</span> Launch Isolated Sandbox
          </button>
          <button
            type="button"
            className="ghost text-xs mt-2"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            Sign out {session?.user?.email ? `(${session.user.email})` : ""}
          </button>
        </div>

        <div className="sidebar-header-label">Active Sandbox Environments ({list.length})</div>

        <div className="sandbox-list">
          {!list.length && (
            <div className="empty-state">
              <p>No active sandboxes running.</p>
              <button
                type="button"
                className="ghost text-xs mt-2"
                onClick={() => setShowCreate(true)}
              >
                + Launch Baseline Sandbox
              </button>
            </div>
          )}

          {list.map((s) => {
            const isSel = s.id === selectedId;
            const scoreColor =
              s.overall >= 80 ? "#10b981" : s.overall >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <button
                key={s.id}
                type="button"
                className={`sandbox-item ${isSel ? "active" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="t font-semibold">{s.title}</span>
                  <span className="badge-pill" style={{ color: scoreColor, borderColor: scoreColor }}>
                    {s.overall}/100
                  </span>
                </div>
                <div className="m flex justify-between items-center text-xs text-muted mt-1">
                  <span className="font-mono text-accent">{s.domain}</span>
                  <span>{s.eventCount} tool calls</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Workspace Panel */}
      <main className="main">
        {!selected ? (
          <div className="panel empty-hero flex flex-col items-center justify-center p-12 text-center">
            <div className="hero-icon mb-4">🛡️</div>
            <h2 className="text-2xl font-bold mb-2">Agent Evaluation Plane</h2>
            <p className="lead mb-6">
              Select an active sandbox environment or launch a parameterized runtime container to test your tool-using AI agent via MCP SSE.
            </p>
            <button type="button" className="primary-btn" onClick={() => setShowCreate(true)}>
              + Deploy Test Environment
            </button>
          </div>
        ) : (
          <>
            {/* Top Workspace Header */}
            <div className="topbar glass-card">
              <div>
                <div className="eyebrow flex items-center gap-2 mb-1">
                  <span className="status-dot green"></span>
                  <span className="font-mono text-accent font-bold uppercase">{selected.domain}</span>
                  <span>·</span>
                  <span className="mono text-muted">{selected.id}</span>
                </div>
                <h1 className="h1 text-xl font-extrabold">{selected.title}</h1>
                <p className="lead text-sm text-muted mt-1">{selected.task}</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="overall-score-box text-right">
                  <div className="score-num font-mono text-2xl font-black text-accent">
                    {selected.overall}
                    <span className="score-max text-sm text-muted"> / 100</span>
                  </div>
                  <div className="score-label text-xs text-muted">Evaluation & Safety Score</div>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="danger button-sm text-xs"
                    disabled={redTeamRunning}
                    onClick={() => void triggerRedTeam()}
                  >
                    {redTeamRunning ? "Running Attack Probe…" : "🚨 Run Red-Team Attack"}
                  </button>
                  <button
                    type="button"
                    className="ghost button-sm text-xs"
                    disabled={busy}
                    onClick={() => void resetSelected()}
                  >
                    🔄 Restore Baseline State
                  </button>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="tab-nav flex gap-2 border-b border-line mb-6">
              <button
                type="button"
                className={`tab-btn ${tab === "connect" ? "active" : ""}`}
                onClick={() => setTab("connect")}
              >
                🔌 Agent Connection (MCP)
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "score" ? "active" : ""}`}
                onClick={() => setTab("score")}
              >
                📊 Scorecard & Requirements ({detail?.liveScore?.dimensions.length || 0})
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "trace" ? "active" : ""}`}
                onClick={() => setTab("trace")}
              >
                📜 Tool Trace & State Diffs ({detail?.events.length || 0})
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "terminal" ? "active" : ""}`}
                onClick={() => setTab("terminal")}
              >
                💻 Live Shell & Console Logs
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "redteam" ? "active" : ""}`}
                onClick={() => setTab("redteam")}
              >
                🚨 Red-Team Security Studio ({redTeamResults.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "skill" ? "active" : ""}`}
                onClick={() => setTab("skill")}
              >
                📘 Scenario Playbook
              </button>
            </div>

            {/* TAB 1: Connect Agent (MCP SSE) */}
            {tab === "connect" && (
              <div className="grid-2">
                <div className="panel">
                  <h2>1. Model Context Protocol (MCP) Endpoint</h2>
                  <p className="text-sm text-muted mb-3">
                    Connect Cursor Agent, Claude Desktop, or your custom agent framework via this SSE URL:
                  </p>
                  <div className="code-box flex justify-between items-center bg-bg p-3 rounded border border-line">
                    <code className="mono select-all text-xs text-accent">{selected.mcpUrl}</code>
                    <button
                      type="button"
                      className="ghost button-sm"
                      onClick={() => void copy(selected.mcpUrl, "MCP URL copied!")}
                    >
                      Copy URL
                    </button>
                  </div>

                  <h2 className="mt-6">2. Cursor / Claude Desktop Integration Config</h2>
                  <p className="text-sm text-muted mb-3">
                    Add this snippet to your agent framework or <code>claude_desktop_config.json</code>:
                  </p>
                  <div className="code-block-wrapper relative">
                    <pre className="code-block mono text-xs p-4 rounded bg-bg border border-line overflow-x-auto">
                      {mcpConfig || "Loading config..."}
                    </pre>
                    <button
                      type="button"
                      className="ghost button-sm absolute top-2 right-2"
                      onClick={() => void copy(mcpConfig, "Config JSON copied!")}
                    >
                      Copy JSON
                    </button>
                  </div>
                </div>

                <div className="panel">
                  <h2>Container Execution Status</h2>
                  <div className="metric-grid mb-4 grid-2 gap-3">
                    <div className="metric-card p-4 rounded bg-bg border border-line">
                      <div className="metric-val text-2xl font-bold text-accent">{detail?.events.length || 0}</div>
                      <div className="metric-lbl text-xs text-muted mt-1">Executed Tool Calls</div>
                    </div>
                    <div className="metric-card p-4 rounded bg-bg border border-line">
                      <div className="metric-val font-mono text-xl font-bold text-purple">
                        {detail?.sandbox.orchMode || "isolated_container"}
                      </div>
                      <div className="metric-lbl text-xs text-muted mt-1">Runtime Mode</div>
                    </div>
                  </div>

                  <h2>Live Evaluation Summary</h2>
                  <div className="summary-box p-4 rounded bg-bg border border-line text-sm text-muted">
                    {detail?.liveScore?.summary || "Waiting for agent tool executions..."}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Scorecard & Requirements */}
            {tab === "score" && (
              <div className="panel">
                <div className="flex justify-between items-center mb-4">
                  <h2>Multi-Dimensional Evaluation Scorecard</h2>
                  <span className="text-xs text-muted">
                    Last computed: {detail?.liveScore?.updatedAt ? fmtTime(detail.liveScore.updatedAt) : "Just now"}
                  </span>
                </div>

                <div className="dimension-list grid-1 gap-3">
                  {!detail?.liveScore?.dimensions.length ? (
                    <div className="p-4 text-center text-muted">No evaluation metrics computed yet.</div>
                  ) : (
                    detail.liveScore.dimensions.map((dim) => (
                      <div key={dim.id} className="dimension-card p-4 rounded bg-bg border border-line">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm flex items-center gap-2">
                            <span>{dim.passed ? "✅" : "❌"}</span>
                            <span>{dim.label}</span>
                          </span>
                          <span
                            className="font-mono text-sm font-bold"
                            style={{ color: dim.passed ? "#10b981" : "#ef4444" }}
                          >
                            {dim.value}/100
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1">{dim.detail}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Tool Call Trace & Diffs */}
            {tab === "trace" && (
              <div className="panel">
                <h2>Execution Trajectory & Time-Travel Diffs</h2>
                {!detail?.events.length ? (
                  <div className="p-8 text-center text-muted">
                    No tool calls recorded yet. Execute tool actions to record event trajectory and inspect state diffs.
                  </div>
                ) : (
                  <div className="trace-list flex flex-col gap-3">
                    {detail.events.map((ev, index) => (
                      <div key={ev.id} className="trace-item p-4 rounded bg-bg border border-line font-mono text-xs">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-accent font-bold">
                            Step #{index + 1} · {ev.tool} ({ev.ok ? "SUCCESS" : "ERROR"})
                          </span>
                          <span className="text-muted">{fmtTime(ev.ts)} ({ev.latencyMs}ms)</span>
                        </div>
                        <div className="text-muted bg-elev p-3 rounded overflow-x-auto border border-line">
                          <strong>Arguments:</strong>
                          <pre className="mt-1">{JSON.stringify(ev.args, null, 2)}</pre>
                        </div>
                        {ev.error && <div className="text-danger mt-2">Error: {ev.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Live Terminal Console */}
            {tab === "terminal" && (
              <div className="panel">
                <div className="flex justify-between items-center mb-3">
                  <h2>Container Stdout/Stderr Execution Logs</h2>
                  <span className="text-xs text-accent flex items-center gap-1 font-mono">
                    <span className="pulse-dot"></span> Live Stream Active
                  </span>
                </div>
                <pre className="code-block mono text-xs p-4 rounded bg-bg border border-line font-mono text-muted overflow-x-auto min-h-[300px]">
                  {logs || "Initializing log stream..."}
                </pre>
              </div>
            )}

            {/* TAB 5: Red-Team Security Studio */}
            {tab === "redteam" && (
              <div className="panel">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2>Automated Red-Teaming & Security Studio</h2>
                    <p className="text-xs text-muted mt-1">
                      Runs 5 adversarial prompt injection vectors against the active agent context.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn button-sm"
                    disabled={redTeamRunning}
                    onClick={() => void triggerRedTeam()}
                  >
                    {redTeamRunning ? "Executing Probes…" : "Run Security Probes →"}
                  </button>
                </div>

                {!redTeamResults.length ? (
                  <div className="p-8 text-center text-muted border border-line rounded">
                    Click "Run Security Probes" to execute prompt injection and data exfiltration test suites.
                  </div>
                ) : (
                  <div className="grid-1 gap-3">
                    {redTeamResults.map((res) => (
                      <div
                        key={res.vectorId}
                        className="p-4 rounded bg-bg border flex justify-between items-center"
                        style={{ borderColor: res.defended ? "#10b981" : "#ef4444" }}
                      >
                        <div>
                          <div className="flex items-center gap-2 font-bold text-sm">
                            <span>{res.defended ? "🛡️ DEFENDED" : "⚠️ VULNERABLE"}</span>
                            <span>{res.name}</span>
                          </div>
                          <p className="text-xs text-muted mt-1">{res.reason}</p>
                        </div>
                        <span
                          className="font-mono text-xs px-2 py-1 rounded"
                          style={{
                            backgroundColor: res.defended ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                            color: res.defended ? "#10b981" : "#ef4444",
                          }}
                        >
                          {res.type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: Scenario Playbook */}
            {tab === "skill" && (
              <div className="panel">
                <div className="flex justify-between items-center mb-3">
                  <h2>Scenario Specification (skill.md)</h2>
                  <button
                    type="button"
                    className="ghost button-sm"
                    onClick={() => void copy(skill, "skill.md copied!")}
                  >
                    Copy Markdown
                  </button>
                </div>
                <pre className="code-block mono text-xs p-4 rounded bg-bg border border-line">{skill || "Loading skill.md..."}</pre>
              </div>
            )}
          </>
        )}
      </main>

      {/* Deploy Sandbox Modal */}
      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal-content glass-card">
            <div className="flex justify-between items-center mb-4 border-b border-line pb-3">
              <h2 className="text-lg font-bold">Deploy Parameterized Sandbox Environment</h2>
              <button
                type="button"
                className="ghost text-xs"
                onClick={() => setShowCreate(false)}
              >
                ✕ Close
              </button>
            </div>

            <div className="flex gap-4 mb-4 border-b border-line pb-2">
              <button
                type="button"
                className={`tab-btn ${mode === "template" ? "active" : ""}`}
                onClick={() => setMode("template")}
              >
                📦 Multi-Domain Scenario Blueprint
              </button>
              <button
                type="button"
                className={`tab-btn ${mode === "prompt" ? "active" : ""}`}
                onClick={() => setMode("prompt")}
              >
                🧠 Custom World Planner Prompt
              </button>
            </div>

            {mode === "template" ? (
              <div className="form-group mb-4">
                <label className="block text-xs text-muted mb-1">Select Domain Scenario</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="select-input w-full p-2 bg-bg border border-line rounded text-xs"
                >
                  <option value="support_refund">
                    🛒 Customer Support — Refund Investigation & Prompt Defense
                  </option>
                  <option value="devops_incident">
                    ☁️ DevOps Cloud Security — S3 Leak & IAM Policy Remediation
                  </option>
                  <option value="fintech_compliance">
                    💳 FinTech KYC & AML — $10k+ Wire Hold & SAR Filing
                  </option>
                  <option value="sql_audit">
                    📊 SQL Data Audit — Schema Injection & PII Sanitization
                  </option>
                  <option value="code_fix">
                    💻 Codebase Security — Vulnerability Patch & Unit Testing
                  </option>
                  <option value="api_security">
                    🔒 API Egress Proxy — Data Exfiltration Prevention
                  </option>
                </select>
              </div>
            ) : (
              <div className="form-group mb-4">
                <label className="block text-xs text-muted mb-1">
                  Specify Custom World Specs:
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="text-area-input w-full p-2 bg-bg border border-line rounded text-xs"
                />
              </div>
            )}

            {/* Sandbox Testing Parameters */}
            <div className="testing-params-panel bg-bg p-4 rounded border border-line mb-4">
              <h3 className="text-xs font-bold text-accent uppercase mb-3">Evaluation & Testing Parameters</h3>
              <div className="grid-2 gap-3 text-xs">
                <div>
                  <label className="block text-muted mb-1">Difficulty Tier</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="select-input w-full p-2 bg-elev border border-line rounded"
                  >
                    <option value="easy">Easy (Clean Baseline)</option>
                    <option value="medium">Medium (Standard Edge-Cases)</option>
                    <option value="hard">Hard (Strict Integrity & Complex Data)</option>
                    <option value="adversarial">Adversarial (Active Indirect Injections)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-muted mb-1">Tool Fault Injection Rate</label>
                  <select
                    value={faultRate}
                    onChange={(e) => setFaultRate(Number(e.target.value))}
                    className="select-input w-full p-2 bg-elev border border-line rounded"
                  >
                    <option value={0}>0% (Stable Tools)</option>
                    <option value={0.15}>15% (Low Latency / 500 Jitter)</option>
                    <option value={0.3}>30% (High Network Faults)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-muted mb-1">State Mutation Strictness</label>
                  <select
                    value={strictness}
                    onChange={(e) => setStrictness(e.target.value as any)}
                    className="select-input w-full p-2 bg-elev border border-line rounded"
                  >
                    <option value="strict">Strict (Penalize unintended mutations)</option>
                    <option value="permissive">Permissive (Only check target goals)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-muted mb-1">Execution Tool Budget</label>
                  <input
                    type="number"
                    value={stepBudget}
                    onChange={(e) => setStepBudget(Number(e.target.value))}
                    className="select-input w-full p-2 bg-elev border border-line rounded"
                  />
                </div>
              </div>
            </div>

            {error && <div className="error-banner mb-4 text-xs text-danger">{error}</div>}

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="ghost button-sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn button-sm"
                disabled={busy}
                onClick={() => void create()}
              >
                {busy ? "Deploying Runtime…" : "Deploy Sandbox →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
