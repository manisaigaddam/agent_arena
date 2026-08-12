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
      <header className="landing-nav">
        <div className="brand flex items-center gap-2">
          <span className="brand-badge">🛡️</span>
          <span>AgentArena</span>
        </div>
        <div className="nav-links">
          <a href="#enter" className="ghost button-sm">
            Access Console →
          </a>
        </div>
      </header>

      <section className="landing-hero">
        <div className="eyebrow flex items-center justify-center gap-2">
          <span className="pulse-dot"></span>
          <span>Zerops PaaS Powered · Model Context Protocol (MCP)</span>
        </div>
        
        <h1 className="landing-title">
          Disposable MCP Sandboxes <br />
          <span className="accent-text">& Real-Time AI Evaluator</span>
        </h1>
        
        <p className="landing-lead">
          Test, attack, and score tool-using AI agents in zero-risk environments.
          Spin up synthetic worlds, connect over MCP, track live security metrics, and reset instantly.
        </p>

        <div className="landing-cta" id="enter">
          {!sentMsg ? (
            <form className="magic-form glass-card" onSubmit={(e) => void onSubmit(e)}>
              <label htmlFor="email" className="form-label">
                Enter your email to launch or enter your workspace
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
              <p className="sent-title">⚡ {sentMsg}</p>
              {magicUrl && (
                <div className="magic-direct">
                  <a href={magicUrl} className="primary-btn direct-link">
                    🚀 Click Here to Enter Workspace Immediately
                  </a>
                </div>
              )}
              <button
                type="button"
                className="ghost mt-3"
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

      <section className="landing-features grid-3">
        <div className="feature-card glass-card">
          <div className="feature-icon">🌐</div>
          <h3>Synthetic World Planner</h3>
          <p>Generate isolated relational databases, API endpoints, and seed state from natural language prompts.</p>
        </div>
        <div className="feature-card glass-card">
          <div className="feature-icon">🔌</div>
          <h3>MCP Native Integration</h3>
          <p>Connect Cursor, Claude Desktop, LangChain, or custom agent frameworks via SSE protocol.</p>
        </div>
        <div className="feature-card glass-card">
          <div className="feature-icon">🛡️</div>
          <h3>Real-Time Security Eval</h3>
          <p>Evaluate prompt injection resistance, state accuracy, PII privacy leakage, and tool efficiency live.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>AgentArena © 2026 · Built for Zerops Hackathon</span>
      </footer>
    </div>
  );
}
