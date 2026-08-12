"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function VerifyClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing magic link token.");
      return;
    }
    void (async () => {
      const res = await signIn("magic-link", {
        token,
        redirect: false,
        callbackUrl: "/app",
      });
      if (res?.error) {
        setError("Magic link expired or invalid. Request a new one.");
        return;
      }
      window.location.href = "/app";
    })();
  }, [token]);

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand">AgentArena</div>
        <h1>{error ? "Link failed" : "Signing you in…"}</h1>
        <p className="muted">
          {error || "One-time magic link — no password."}
        </p>
        {error && (
          <a className="btn-link" href="/">
            Back to home
          </a>
        )}
      </div>
    </div>
  );
}
