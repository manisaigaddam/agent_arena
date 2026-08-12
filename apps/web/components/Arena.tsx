"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";

/** Browser calls go through Next.js BFF (`/api/v1/*`) which enforces Auth.js. */
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
    "Sandbox for a customer support agent that investigates refund tickets, refunds only eligible payments, and ignores prompt injections in ticket text.",
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
      setList(data.sandboxes || []);
    } catch {
      /* ignore */
    }
  }, []);

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
    }, 1600);
    return () => clearInterval(t);
  }, [selectedId, loadDetail, refreshList]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function copy(text: string, label = "Copied") {
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
        /* gateway HTML / non-JSON */
      }
      if (!res.ok) {
        const fromJson = [data.error, data.detail, data.hint]
          .filter(Boolean)
          .join(" — ");
        if (fromJson) throw new Error(fromJson);
        if (raw.includes("502") || res.status === 502) {
          throw new Error(
            "502 Bad Gateway — orchestrator/API not reachable on the expected port. Check Zerops orchestrator is docker@26.1 and running.",
          );
        }
        throw new Error(raw.slice(0, 240) || `create_failed (${res.status})`);
      }
      const id = data.sandbox?.id;
      if (!id) throw new Error("create_failed: missing sandbox id");
      await refreshList();
      setSelectedId(id);
      setShowCreate(false);
      setTab("connect");
      flash("Sandbox ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetSelected() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await fetch(`${API}/v1/sandboxes/${selectedId}`, { method: "DELETE" });
      flash("World reset");
      await refreshList();
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "reset_failed");
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
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand">AgentArena</div>
          <p className="brand-sub">
            Disposable MCP worlds. Live scores. Reset anything.
          </p>
        </div>

        <div className="sidebar-actions">
          <button type="button" onClick={() => setShowCreate(true)}>
            New sandbox
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            Sign out
            {session?.user?.email ? ` · ${session.user.email}` : ""}
          </button>
        </div>

        <div className="sandbox-list">
          {!list.length && (
            <div className="empty">No sandboxes yet. Create one to start.</div>
          )}
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sandbox-item ${selectedId === s.id ? "active" : ""}`}
              onClick={() => setSelectedId(s.id)}
            >
              <div className="t">{s.title}</div>
              <div className="m">
                {s.domain} · {s.status} · {fmtTime(s.createdAt)}
              </div>
              <span className="score-pill">{s.overall}/100</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        {!selectedId && (
          <div className="topbar">
            <div>
              <div className="eyebrow">Workspace</div>
              <h1 className="h1">Your arenas</h1>
              <p className="lead">
                Spin up multiple sandboxes — each with its own MCP endpoint,
                skill.md, and live evaluation. Pick one from the left or create
                a new world.
              </p>
              <div className="row" style={{ marginTop: "1.1rem" }}>
                <button type="button" onClick={() => setShowCreate(true)}>
                  Create sandbox
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedId && detail && (
          <>
            <div className="topbar">
              <div>
                <div className="eyebrow">{detail.sandbox.domain}</div>
                <h1 className="h1">{detail.sandbox.title}</h1>
                <p className="lead">{detail.sandbox.task}</p>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowCreate(true)}
                >
                  New
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy || detail.sandbox.status === "reset"}
                  onClick={() => void resetSelected()}
                >
                  Reset world
                </button>
              </div>
            </div>

            <div className="grid-3" style={{ marginBottom: "1rem" }}>
              <div className="stat">
                <b>{detail.liveScore?.overall ?? 0}</b>
                <span>Live score</span>
              </div>
              <div className="stat">
                <b>{detail.events.length}</b>
                <span>Tool events</span>
              </div>
              <div className="stat">
                <b>{detail.sandbox.orchMode || "—"}</b>
                <span>Runtime · {detail.sandbox.status}</span>
              </div>
            </div>

            <div className="tabs">
              {(
                [
                  ["connect", "Connect"],
                  ["skill", "skill.md"],
                  ["trace", "Trace"],
                  ["score", "Score"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`tab ${tab === id ? "on" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "connect" && (
              <div className="grid-2">
                <section className="panel">
                  <h2>MCP endpoint</h2>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Paste into Cursor / Claude Desktop / any MCP client. Scores
                    update automatically — no finalize step.
                  </p>
                  <div className="copy-row">
                    <pre className="codebox">{detail.sandbox.mcpUrl}</pre>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void copy(detail.sandbox.mcpUrl, "MCP URL copied")
                      }
                    >
                      Copy
                    </button>
                  </div>
                  <h2 style={{ marginTop: "1.1rem" }}>Client config</h2>
                  <div className="copy-row">
                    <pre className="codebox">{mcpConfig}</pre>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void copy(mcpConfig, "Config copied")}
                    >
                      Copy
                    </button>
                  </div>
                </section>
                <section className="panel">
                  <h2>Agent brief</h2>
                  <p className="muted">
                    Give your agent the mission below, then point it at the MCP
                    server. Full playbook is in skill.md.
                  </p>
                  <pre className="codebox">{detail.sandbox.task}</pre>
                  <div className="row" style={{ marginTop: "0.85rem" }}>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void copy(detail.sandbox.task, "Task copied")}
                    >
                      Copy task
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setTab("skill")}
                    >
                      Open skill.md
                    </button>
                  </div>
                </section>
              </div>
            )}

            {tab === "skill" && (
              <section className="panel">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 style={{ margin: 0 }}>skill.md</h2>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void copy(skill, "skill.md copied")}
                  >
                    Copy
                  </button>
                </div>
                <pre className="skillbox">{skill || "Loading…"}</pre>
              </section>
            )}

            {tab === "trace" && (
              <section className="panel">
                <h2>Live tool trace</h2>
                <div className="timeline">
                  {!detail.events.length && (
                    <div className="empty">
                      Waiting for MCP tool calls from your agent…
                    </div>
                  )}
                  {[...detail.events].reverse().map((e) => (
                    <div
                      key={e.id}
                      className={`event ${e.error ? "bad" : ""}`}
                    >
                      <div>
                        <strong>{e.tool}</strong>
                      </div>
                      <div className="meta">
                        {fmtTime(e.ts)} · {e.latencyMs}ms
                        {e.error ? ` · ${e.error}` : ""}
                      </div>
                      <div className="meta">{JSON.stringify(e.args)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tab === "score" && detail.liveScore && (
              <section className="panel">
                <div className="score-head">
                  <div
                    className="score-ring"
                    style={{ ["--pct" as string]: String(detail.liveScore.overall) }}
                  >
                    <strong>{detail.liveScore.overall}</strong>
                  </div>
                  <div>
                    <div className="eyebrow">Auto-updating</div>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "1.05rem" }}>
                      {detail.liveScore.summary}
                    </p>
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      {detail.liveScore.eventCount} events · updated{" "}
                      {fmtTime(detail.liveScore.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="dim-grid">
                  {detail.liveScore.dimensions.map((d) => (
                    <div className="dim" key={d.id}>
                      <span
                        className={`badge ${d.passed ? "pass" : "open"}`}
                      >
                        {d.passed ? "pass" : "open"}
                      </span>
                      <div>
                        <div className="label">{d.label}</div>
                        <div className="detail">{d.detail}</div>
                      </div>
                      <div className="val">{d.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {selected && !detail && (
          <div className="empty">Loading sandbox…</div>
        )}
      </main>

      {showCreate && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setShowCreate(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New sandbox</h2>
            <p className="sub">
              Static template for a fast demo, or describe any agent world and
              we’ll generate tools, data, and requirements.
            </p>

            <div className="tabs">
              <button
                type="button"
                className={`tab ${mode === "prompt" ? "on" : ""}`}
                onClick={() => setMode("prompt")}
              >
                Dynamic prompt
              </button>
              <button
                type="button"
                className={`tab ${mode === "template" ? "on" : ""}`}
                onClick={() => setMode("template")}
              >
                Template
              </button>
            </div>

            {mode === "prompt" ? (
              <div className="field">
                <label htmlFor="prompt">What should this world test?</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="template">Pick a static template</label>
                <select
                  id="template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="support_refund">
                    Refund Investigation — customer support (injection +
                    eligibility)
                  </option>
                </select>
                <p className="muted" style={{ marginTop: "0.65rem" }}>
                  No Bedrock needed. Fast path for demos.
                </p>
              </div>
            )}

            {error && <div className="error">{error}</div>}

            <div className="row" style={{ marginTop: "1rem" }}>
              <button type="button" disabled={busy} onClick={() => void create()}>
                {busy ? "Generating…" : "Generate sandbox"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
