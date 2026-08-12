import { Suspense } from "react";
import VerifyClient from "./VerifyClient";

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <div className="login-card">
            <div className="brand">AgentArena</div>
            <h1>Signing you in…</h1>
          </div>
        </div>
      }
    >
      <VerifyClient />
    </Suspense>
  );
}
