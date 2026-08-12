"use client";

import { useState, type FormEvent } from "react";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const text = await res.text();
      let data: { error?: string; message?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          text?.slice(0, 120) || `Bad response (${res.status})`,
        );
      }
      if (!res.ok) throw new Error(data.error || `send_failed (${res.status})`);
      setSent(data.message || "Check your email for the magic link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "send_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">AgentArena</div>
        <a href="#enter" className="ghost">
          Enter arena
        </a>
      </header>

      <section className="landing-hero">
        <p className="eyebrow">WeMakeDevs × Zerops</p>
        <h1 className="landing-title">AgentArena</h1>
        <p className="landing-lead">
          Disposable MCP worlds for your agents. Generate a sandbox, connect
          over MCP, watch the live score update, then reset.
        </p>
        <div className="landing-cta" id="enter">
          {!sent ? (
            <form className="magic-form" onSubmit={(e) => void onSubmit(e)}>
              <label htmlFor="email">
                Email magic link — we verify by sending the link to your inbox
              </label>
              <div className="magic-row">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <button type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Email me a link"}
                </button>
              </div>
              {error && <div className="error">{error}</div>}
            </form>
          ) : (
            <div className="magic-sent">
              <p>{sent}</p>
              <button
                type="button"
                className="ghost"
                onClick={() => setSent(null)}
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="landing-strip">
        <div>
          <strong>Worlds</strong>
          <span>Template or prompt → tools, seed, skill.md</span>
        </div>
        <div>
          <strong>MCP</strong>
          <span>Per-sandbox token URL for Cursor / any agent</span>
        </div>
        <div>
          <strong>Score</strong>
          <span>Live requirements — no finalize step</span>
        </div>
      </section>
    </div>
  );
}
