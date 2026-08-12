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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<"prompt" | "template">("template");
  const [templateId, setTemplateId] = useState("support_refund");
  const [prompt, setPrompt] = useState(
    "Customer support agent that investigates refund requests, verifies eligibility, prevents double-refunds, and handles prompt injection in ticket text.",
  );
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"connect" | "skill" | "trace" | "score">(
    "connect",
  );

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
      const [dRes, sRes] = await Promise.all([
        fetch(`${API}/v1/sandboxes/${id}`),
        fetch(`${API}/v1/sandboxes/${id}/skill.md`),
      ]);
      if (!dRes.ok) return;
      const data = (await dRes.json()) as Detail;
      setDetail(data);
      if (sRes.ok) setSkill(await sRes.text());
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
    setTimeout(() => setToast(null), 2200);
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
            ? { mode: "template", templateId }
            : { mode: "prompt", prompt },
        ),
      });
      const raw = await res.text();
      let data: {
        sandbox?: { id?: string };
        error?: string;
        detail?: string;
        hint?: string;
      } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        /* parse error */
      }
      if (!res.ok) {
        const fromJson = [data.error, data.detail, data.hint]
          .filter(Boolean)
          .join(" — ");
        if (fromJson) throw new Error(fromJson);
        throw new Error(raw.slice(0, 200) || `Create failed (${res.status})`);
      }
      const id = data.sandbox?.id;
      if (!id) throw new Error("Sandbox creation returned no ID.");
      await refreshList();
      setSelectedId(id);
      setShowCreate(false);
      setTab("connect");
      flash("⚡ New sandbox deployed!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resetSelected() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await fetch(`${API}/v1/sandboxes/${selectedId}`, { method: "DELETE" });
      flash("🔄 Sandbox state reset to clean baseline!");
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
            MCP Agent Sandboxes · Live Security & Eval Scorecards
          </p>
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className="primary-btn flex items-center justify-center gap-2 w-full"
            onClick={() => setShowCreate(true)}
          >
            <span>+</span> Deploy New Sandbox
          </button>
          <button
            type="button"
            className="ghost text-xs mt-1"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            Sign out {session?.user?.email ? `(${session.user.email})` : ""}
          </button>
        </div>

        <div className="sidebar-header-label">Active Sandboxes ({list.length})</div>

        <div className="sandbox-list">
          {!list.length && (
            <div className="empty-state">
              <p>No sandboxes deployed.</p>
              <button
                type="button"
                className="ghost text-xs mt-2"
                onClick={() => setShowCreate(true)}
              >
                + Create one now
              </button>
            </div>
          )}

          {list.map((s) => {
            const isSel = s.id === selectedId;
            const scoreColor =
              s.overall >= 80 ? "#3ecf8e" : s.overall >= 50 ? "#e8b84a" : "#ff6b6b";
            return (
              <button
                key={s.id}
                type="button"
                className={`sandbox-item ${isSel ? "active" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="t">{s.title}</span>
                  <span className="badge-pill" style={{ color: scoreColor, borderColor: scoreColor }}>
                    {s.overall}/100
                  </span>
                </div>
                <div className="m flex justify-between items-center text-xs text-muted">
                  <span>{s.domain}</span>
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
            <h2 className="text-2xl font-bold mb-2">Welcome to AgentArena</h2>
            <p className="lead mb-6">
              Select an active sandbox from the sidebar or launch a new disposable environment to connect your AI agent via MCP SSE protocol.
            </p>
            <button type="button" className="primary-btn" onClick={() => setShowCreate(true)}>
              + Create Sandbox Environment
            </button>
          </div>
        ) : (
          <>
            {/* Top Workspace Header */}
            <div className="topbar glass-card">
              <div>
                <div className="eyebrow flex items-center gap-2">
                  <span className="status-dot green"></span>
                  <span>{selected.domain}</span>
                  <span>·</span>
                  <span className="mono">{selected.id}</span>
                </div>
                <h1 className="h1">{selected.title}</h1>
                <p className="lead">{selected.task}</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="overall-score-box">
                  <div className="score-num font-mono">
                    {selected.overall}
                    <span className="score-max">/100</span>
                  </div>
                  <div className="score-label">Live Evaluation Score</div>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="danger text-xs"
                    disabled={busy}
                    onClick={() => void resetSelected()}
                  >
                    🔄 Reset Sandbox State
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
                🔌 Connect Agent (MCP)
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "score" ? "active" : ""}`}
                onClick={() => setTab("score")}
              >
                📊 Scorecard & Security ({detail?.liveScore?.dimensions.length || 0})
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "trace" ? "active" : ""}`}
                onClick={() => setTab("trace")}
              >
                📜 Tool Call Trace ({detail?.events.length || 0})
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "skill" ? "active" : ""}`}
                onClick={() => setTab("skill")}
              >
                📘 skill.md Playbook
              </button>
            </div>

            {/* TAB 1: Connect Agent (MCP SSE) */}
            {tab === "connect" && (
              <div className="grid-2">
                <div className="panel">
                  <h2>1. Model Context Protocol (MCP) Endpoint</h2>
                  <p className="text-sm text-muted mb-3">
                    Paste this SSE URL into Cursor, Claude Desktop, or your agent framework settings:
                  </p>
                  <div className="code-box flex justify-between items-center">
                    <code className="mono select-all text-xs">{selected.mcpUrl}</code>
                    <button
                      type="button"
                      className="ghost button-sm"
                      onClick={() => void copy(selected.mcpUrl, "MCP URL copied!")}
                    >
                      Copy URL
                    </button>
                  </div>

                  <h2 className="mt-6">2. Cursor / Claude Desktop Config JSON</h2>
                  <p className="text-sm text-muted mb-3">
                    Add this to your <code>claude_desktop_config.json</code>:
                  </p>
                  <div className="code-block-wrapper relative">
                    <pre className="code-block mono text-xs">{mcpConfig || "Loading config..."}</pre>
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
                  <h2>Agent Operational Status</h2>
                  <div className="metric-grid mb-4">
                    <div className="metric-card">
                      <div className="metric-val">{detail?.events.length || 0}</div>
                      <div className="metric-lbl">Total Tool Calls</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-val font-mono text-accent">
                        {detail?.sandbox.orchMode || "process"}
                      </div>
                      <div className="metric-lbl">Sandbox Runtime</div>
                    </div>
                  </div>

                  <h2>Live Evaluation Summary</h2>
                  <div className="summary-box p-3 rounded bg-elev border border-line text-sm">
                    {detail?.liveScore?.summary || "Waiting for agent to execute tool calls..."}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Evaluation & Scorecard */}
            {tab === "score" && (
              <div className="panel">
                <div className="flex justify-between items-center mb-4">
                  <h2>Live Multi-Dimensional Scorecard</h2>
                  <span className="text-xs text-muted">
                    Updated {detail?.liveScore?.updatedAt ? fmtTime(detail.liveScore.updatedAt) : "Just now"}
                  </span>
                </div>

                <div className="dimension-list grid-1 gap-3">
                  {!detail?.liveScore?.dimensions.length ? (
                    <div className="p-4 text-center text-muted">No evaluation metrics computed yet.</div>
                  ) : (
                    detail.liveScore.dimensions.map((dim) => (
                      <div key={dim.id} className="dimension-card p-3 rounded bg-elev border border-line">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm flex items-center gap-2">
                            <span>{dim.passed ? "✅" : "❌"}</span>
                            <span>{dim.label}</span>
                          </span>
                          <span
                            className="font-mono text-sm font-bold"
                            style={{ color: dim.passed ? "#3ecf8e" : "#ff6b6b" }}
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

            {/* TAB 3: Tool Call Trace */}
            {tab === "trace" && (
              <div className="panel">
                <h2>Execution Trace Log</h2>
                {!detail?.events.length ? (
                  <div className="p-8 text-center text-muted">
                    No tool calls recorded yet. Connect an agent to <code>{selected.mcpUrl}</code> to stream events.
                  </div>
                ) : (
                  <div className="trace-list flex flex-col gap-2">
                    {detail.events.map((ev) => (
                      <div key={ev.id} className="trace-item p-3 rounded bg-elev border border-line font-mono text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-accent font-bold">
                            {ev.ok ? "SUCCESS" : "ERROR"} · {ev.tool}
                          </span>
                          <span className="text-muted">{fmtTime(ev.ts)} ({ev.latencyMs}ms)</span>
                        </div>
                        <div className="text-muted bg-bg p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(ev.args, null, 2)}
                        </div>
                        {ev.error && <div className="text-danger mt-1">Error: {ev.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: skill.md */}
            {tab === "skill" && (
              <div className="panel">
                <div className="flex justify-between items-center mb-3">
                  <h2>Generated skill.md Playbook</h2>
                  <button
                    type="button"
                    className="ghost button-sm"
                    onClick={() => void copy(skill, "skill.md copied!")}
                  >
                    Copy Markdown
                  </button>
                </div>
                <pre className="code-block mono text-xs p-4 rounded bg-elev">{skill || "Loading skill.md..."}</pre>
              </div>
            )}
          </>
        )}
      </main>

      {/* Deploy Sandbox Modal */}
      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal-content glass-card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Deploy New Sandbox Environment</h2>
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
                📦 Pre-configured Template
              </button>
              <button
                type="button"
                className={`tab-btn ${mode === "prompt" ? "active" : ""}`}
                onClick={() => setMode("prompt")}
              >
                🧠 Bedrock AI Prompt Planner
              </button>
            </div>

            {mode === "template" ? (
              <div className="form-group mb-4">
                <label className="block text-xs text-muted mb-1">Select Scenario Template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="select-input"
                >
                  <option value="support_refund">
                    Customer Support — Refund Ticket Investigation & Prompt Injection Defense
                  </option>
                </select>
              </div>
            ) : (
              <div className="form-group mb-4">
                <label className="block text-xs text-muted mb-1">
                  Describe sandbox requirements for Bedrock World Planner:
                </label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="text-area-input"
                />
              </div>
            )}

            {error && <div className="error-banner mb-4">{error}</div>}

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="ghost"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={() => void create()}
              >
                {busy ? "Deploying Sandbox…" : "Deploy Sandbox →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
