"use client";

import { useState, type FormEvent } from "react";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [magicUrl, setMagicUrl] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSentMsg(null);
    setMagicUrl(null);
    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const text = await res.text();
      let data: { error?: string; message?: string; magicUrl?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text?.slice(0, 120) || `Server Error (${res.status})`);
      }
      if (!res.ok) throw new Error(data.error || `Failed to sign in (${res.status})`);
      setSentMsg(data.message || "Check your email for access link.");
      if (data.magicUrl) setMagicUrl(data.magicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      {/* PullPlane Navigation Bar */}
      <header className="landing-nav">
        <div className="brand flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
            <circle cx="15.2" cy="12" r="3.1" fill="#a855f7" stroke="#18181b" strokeWidth="1.2" />
            <circle cx="12" cy="12" r="3.1" fill="#3b82f6" stroke="#18181b" strokeWidth="1.2" />
            <circle cx="8.8" cy="12" r="3.1" fill="#10b981" stroke="#18181b" strokeWidth="1.2" />
          </svg>
          <span className="font-bold text-white text-lg">AgentArena</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="#enter" className="ghost button-sm">
            Sign In
          </a>
          <a href="#enter" className="primary-btn button-sm">
            Launch Sandbox →
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="eyebrow flex items-center justify-center gap-2">
          <div className="pill-badge">
            <span className="pulse-dot"></span>
            <span>Live Agent Evaluation Plane · Zerops PaaS</span>
          </div>
        </div>

        <h1 className="landing-title">
          Run every AI coding agent.<br />
          <span className="accent-text">One secure evaluation plane.</span>
        </h1>

        <p className="landing-lead">
          Plan, run, review, and score tool-using AI agents in isolated Zerops sandboxes — from synthetic world spec to prompt injection defense.
        </p>

        <div className="landing-cta" id="enter">
          {!sentMsg ? (
            <form className="magic-form glass-card" onSubmit={(e) => void onSubmit(e)}>
              <label htmlFor="email" className="form-label">
                Enter your email to spin up or access your workspace:
              </label>
              <div className="magic-row">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="developer@company.com"
                  className="landing-input"
                />
                <button type="submit" disabled={busy} className="primary-btn">
                  {busy ? "Authenticating…" : "Enter Workspace →"}
                </button>
              </div>
              {error && <div className="error-banner">{error}</div>}
            </form>
          ) : (
            <div className="magic-sent glass-card">
              <p className="font-semibold text-accent mb-2">⚡ {sentMsg}</p>
              {magicUrl && (
                <div className="mt-2">
                  <a href={magicUrl} className="primary-btn button-sm">
                    🚀 Click Here to Enter Workspace Immediately
                  </a>
                </div>
              )}
              <button
                type="button"
                className="ghost button-sm mt-3"
                onClick={() => {
                  setSentMsg(null);
                  setMagicUrl(null);
                }}
              >
                ← Try another email
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Production Demo Window */}
      <div className="demo-window">
        <div className="demo-titlebar">
          <div className="window-dots">
            <span className="window-dot"></span>
            <span className="window-dot"></span>
            <span className="window-dot"></span>
          </div>
          <span className="text-xs font-mono text-muted">https://gateway-2e0c-3002.prg1.zerops.app/mcp/sbx_037d3c76/sse</span>
          <div className="flex items-center gap-1.5 text-xs text-accent font-semibold">
            <span className="pulse-dot"></span>
            <span>Live Stream</span>
          </div>
        </div>

        <div className="demo-tabs">
          <span className="demo-tab active">🔌 MCP Connection</span>
          <span className="demo-tab">🏆 Scorecard (75/100)</span>
          <span className="demo-tab">📜 Trace Log</span>
          <span className="demo-tab">📘 skill.md</span>
        </div>

        <div className="demo-body">
          <div className="panel" style={{ margin: 0 }}>
            <h2 className="text-xs text-muted mb-2">Connected Agents in Sandbox</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="agent-tag claude">@claude-3.7-sonnet</span>
              <span className="agent-tag codex">@cursor-agent</span>
              <span className="agent-tag research">@deepseek-r1</span>
              <span className="agent-tag eval">@evaluator</span>
            </div>

            <div className="code-block font-mono text-xs text-muted mb-2">
              <span className="text-accent font-bold">POST</span> /mcp/sbx_037d3c76/message HTTP/1.1<br />
              {"{"}"method": "tools/call", "params": {"{"}"name": "refund_payment", "arguments": {"{"}"payment_id": "pay_1"{"}"}{"}"}{"}"}<br />
              <span className="text-accent font-bold">200 OK</span> · payment pay_1 status updated to refunded (14ms)
            </div>
          </div>

          <div className="panel flex flex-col justify-between" style={{ margin: 0 }}>
            <div>
              <h2 className="text-xs text-muted mb-1">Defense Score</h2>
              <div className="text-2xl font-extrabold text-accent">75 / 100</div>
              <p className="text-xs text-muted mt-1">Prompt Injection Defended • State Mutation Verified</p>
            </div>
            <div className="pill-badge text-xs justify-center mt-3">
              <span>Zero-Risk Sandbox</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <section className="grid-3">
        <div className="feature-card glass-card">
          <div className="feature-icon">🌐</div>
          <h3>Synthetic World Engine</h3>
          <p>Generate isolated relational state, seed data, and REST API endpoints from natural language prompts.</p>
        </div>
        <div className="feature-card glass-card">
          <div className="feature-icon">🔌</div>
          <h3>MCP Protocol Native</h3>
          <p>Connect Cursor, Claude Desktop, LangChain, or custom agent frameworks via zero-config SSE endpoints.</p>
        </div>
        <div className="feature-card glass-card">
          <div className="feature-icon">🛡️</div>
          <h3>Real-Time Security Eval</h3>
          <p>Evaluate prompt injection resistance, state mutation accuracy, and tool execution latency live.</p>
        </div>
      </section>

      <footer className="mt-16 text-xs text-muted">
        <span>AgentArena © 2026 · Production-Grade AI Agent Infrastructure</span>
      </footer>
    </div>
  );
}
