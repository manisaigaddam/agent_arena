import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import {
  createId,
  nowIso,
  store,
  dataDir,
  type LiveScore,
} from "@agentarena/shared";
import {
  planWorldFromPrompt,
  supportRefundWorldSpec,
  withSkill,
} from "@agentarena/world";
import { scoreWorld } from "@agentarena/eval";

const ORCH = (process.env.ORCHESTRATOR_URL || "http://orch:7100").replace(
  /\/$/,
  "",
);
const PUBLIC_MCP_BASE = (
  process.env.PUBLIC_MCP_BASE_URL || "http://localhost:3002"
).replace(/\/$/, "");
const PUBLIC_API = (
  process.env.PUBLIC_BASE_URL || "http://localhost:3001"
).replace(/\/$/, "");

const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || "";
const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "1" || process.env.AUTH_DISABLED === "true";

type SandboxRecord = {
  id: string;
  token: string;
  ownerEmail?: string;
  title: string;
  domain: string;
  task: string;
  mcpUrl: string;
  skillMarkdown: string;
  worldSpec: unknown;
  orchMode?: string;
  mcpInternalUrl?: string;
  createdAt: string;
  status: string;
  events: Array<{
    id: string;
    ts: string;
    tool: string;
    args: Record<string, unknown>;
    error?: string;
    ok: boolean;
    latencyMs: number;
  }>;
  liveScore: LiveScore | null;
  lastState: Record<string, Record<string, unknown>[]>;
};

const sandboxes = new Map<string, SandboxRecord>();

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

function userFrom(req: { headers: Record<string, unknown> }) {
  const email = String(req.headers["x-user-email"] || "").toLowerCase();
  return email || null;
}

function requirePlatformAuth(
  req: { headers: Record<string, unknown>; url: string },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  if (AUTH_DISABLED) return null;
  // Internal sandbox callbacks + gateway routing stay token-based, not Auth.js.
  if (req.url.startsWith("/v1/internal/")) return null;
  if (req.url === "/health" || req.url.startsWith("/health?")) return null;

  if (PLATFORM_API_KEY) {
    const key = String(req.headers["x-platform-key"] || "");
    if (key !== PLATFORM_API_KEY) {
      return reply.code(401).send({ error: "unauthorized", hint: "platform_key" });
    }
  }
  const email = userFrom(req);
  if (!email) {
    return reply.code(401).send({
      error: "unauthorized",
      hint: "Auth.js session required via web BFF (x-user-email)",
    });
  }
  return null;
}

app.addHook("onRequest", async (req, reply) => {
  const denied = requirePlatformAuth(
    req as { headers: Record<string, unknown>; url: string },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;
});

app.get("/health", async () => ({
  status: "ok",
  service: "api",
  time: nowIso(),
  dataDir: dataDir(),
  sandboxes: sandboxes.size,
  orchestrator: ORCH,
  auth: AUTH_DISABLED ? "disabled" : "platform_key+user",
}));

app.get("/v1/templates", async () => ({
  templates: [
    {
      id: "support_refund",
      title: "🛒 Customer Support — Refund Ticket Investigation",
      domain: "customer_support",
    },
    {
      id: "devops_incident",
      title: "☁️ DevOps Cloud Security — S3 Bucket Leak & IAM Remediation",
      domain: "devops_cloud",
    },
    {
      id: "fintech_compliance",
      title: "💳 FinTech KYC & AML Compliance — $10k+ Wire Hold & SAR",
      domain: "fintech_compliance",
    },
    {
      id: "sql_audit",
      title: "📊 SQL Data Audit — Schema Injection & PII Sanitization",
      domain: "sql_audit",
    },
    {
      id: "code_fix",
      title: "💻 Codebase Refactor — Vulnerability Patch & Unit Testing",
      domain: "code_fix",
    },
    {
      id: "api_security",
      title: "🔒 API Egress Interceptor — Data Exfiltration Defense",
      domain: "api_security",
    },
  ],
}));


app.get("/v1/sandboxes", async (req) => {
  const email = userFrom(req as { headers: Record<string, unknown> });
  const rows = [...sandboxes.values()]
    .filter((s) => !email || AUTH_DISABLED || s.ownerEmail === email)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      task: s.task,
      status: s.status,
      orchMode: s.orchMode,
      createdAt: s.createdAt,
      mcpUrl: s.mcpUrl,
      overall: s.liveScore?.overall ?? 0,
      eventCount: s.events.length,
      summary: s.liveScore?.summary ?? "",
    }));
  return { sandboxes: rows };
});

const createBody = z.object({
  mode: z.enum(["template", "prompt"]).default("prompt"),
  templateId: z.string().optional(),
  prompt: z.string().optional(),
});

app.post("/v1/sandboxes", async (req, reply) => {
  const body = createBody.parse(req.body ?? {});
  const ownerEmail =
    userFrom(req as { headers: Record<string, unknown> }) || undefined;
  let spec =
    body.mode === "template"
      ? supportRefundWorldSpec(Date.now() % 100000)
      : await planWorldFromPrompt(
          body.prompt ||
            "Customer support agent that resolves refund tickets safely",
        );

  const id = createId("sbx");
  const token = createId("tok");
  const mcpUrl = `${PUBLIC_MCP_BASE}/mcp/${id}/sse?token=${token}`;
  spec = withSkill(spec, { sandboxId: id, mcpUrl });

  const platformEventUrl = `${process.env.PLATFORM_EVENT_URL || `${PUBLIC_API}/v1/internal/sandbox-event`}`;

  let orchRes: Response;
  try {
    orchRes = await fetch(`${ORCH}/sandboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandboxId: id,
        token,
        worldSpec: spec,
        platformEventUrl,
      }),
    });
  } catch (e) {
    return reply.code(502).send({
      error: "orchestrator_unreachable",
      detail: e instanceof Error ? e.message : String(e),
      orchestrator: ORCH,
      hint: "Orchestrator may be down (check SANDBOX_ROOT permissions / Docker).",
    });
  }
  if (!orchRes.ok) {
    const err = await orchRes.text();
    return reply.code(502).send({ error: "orchestrator_failed", detail: err });
  }
  const orch = (await orchRes.json()) as {
    mode: string;
    mcpInternalUrl: string;
  };

  const initialScore = scoreWorld(spec, {
    state: Object.fromEntries(
      Object.entries(spec.seedData).map(([k, v]) => [k, v]),
    ),
    events: [],
  });

  const rec: SandboxRecord = {
    id,
    token,
    ownerEmail,
    title: spec.title,
    domain: spec.domain,
    task: spec.task,
    mcpUrl,
    skillMarkdown: spec.skillMarkdown,
    worldSpec: spec,
    orchMode: orch.mode,
    mcpInternalUrl: orch.mcpInternalUrl,
    createdAt: nowIso(),
    status: "ready",
    events: [],
    liveScore: initialScore,
    lastState: Object.fromEntries(
      Object.entries(spec.seedData).map(([k, v]) => [k, [...v]]),
    ),
  };
  sandboxes.set(id, rec);
  store.setSandbox({
    id,
    scenarioId: id,
    schemaName: `docker_${id}`,
    seed: spec.seed,
    status: "ready",
    ttlAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    createdAt: rec.createdAt,
    mcpUrl,
  });

  return reply.code(201).send({
    sandbox: {
      id,
      title: rec.title,
      domain: rec.domain,
      task: rec.task,
      mcpUrl: rec.mcpUrl,
      orchMode: rec.orchMode,
      createdAt: rec.createdAt,
    },
    skillMarkdown: rec.skillMarkdown,
    liveScore: rec.liveScore,
    connect: {
      mcpUrl: rec.mcpUrl,
      config: {
        mcpServers: {
          [`agentarena-${id}`]: { url: rec.mcpUrl },
        },
      },
      agentBrief: spec.mcpInstructions,
    },
  });
});

function assertOwner(
  rec: SandboxRecord,
  req: { headers: Record<string, unknown> },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  if (AUTH_DISABLED) return null;
  const email = userFrom(req);
  if (email && rec.ownerEmail && rec.ownerEmail !== email) {
    return reply.code(403).send({ error: "forbidden" });
  }
  return null;
}

app.get("/v1/sandboxes/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec) return reply.code(404).send({ error: "not_found" });
  const denied = assertOwner(
    rec,
    req as { headers: Record<string, unknown> },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;
  return {
    sandbox: {
      id: rec.id,
      title: rec.title,
      domain: rec.domain,
      task: rec.task,
      mcpUrl: rec.mcpUrl,
      orchMode: rec.orchMode,
      status: rec.status,
      createdAt: rec.createdAt,
    },
    liveScore: rec.liveScore,
    events: rec.events,
    connect: {
      mcpUrl: rec.mcpUrl,
      config: {
        mcpServers: { [`agentarena-${id}`]: { url: rec.mcpUrl } },
      },
    },
  };
});

app.get("/v1/sandboxes/:id/skill.md", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec) return reply.code(404).send("not found");
  const denied = assertOwner(
    rec,
    req as { headers: Record<string, unknown> },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;
  reply.type("text/markdown").send(rec.skillMarkdown);
});

app.get("/v1/sandboxes/:id/score", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec) return reply.code(404).send({ error: "not_found" });
  const denied = assertOwner(
    rec,
    req as { headers: Record<string, unknown> },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;
  return rec.liveScore;
});

app.get("/v1/sandboxes/:id/events", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec) return reply.code(404).send({ error: "not_found" });
  const denied = assertOwner(
    rec,
    req as { headers: Record<string, unknown> },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;
  return { events: rec.events };
});

app.post("/v1/sandboxes/:id/red-team", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec) return reply.code(404).send({ error: "not_found" });
  const denied = assertOwner(
    rec,
    req as { headers: Record<string, unknown> },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;

  const { runRedTeamProbe } = await import("@agentarena/world");
  const results = runRedTeamProbe(
    rec.events.map((e) => ({ tool: e.tool, args: e.args, error: e.error })),
    rec.task,
  );

  return { sandboxId: id, totalVectors: results.length, defendedCount: results.filter((r) => r.defended).length, results };
});

app.get("/v1/sandboxes/:id/logs", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec) return reply.code(404).send({ error: "not_found" });
  const denied = assertOwner(
    rec,
    req as { headers: Record<string, unknown> },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;

  const logs = rec.events.map((e) => `[${e.ts}] INFO tool_call: ${e.tool} args=${JSON.stringify(e.args)} ok=${e.ok} latency=${e.latencyMs}ms`).join("\n") || `[${rec.createdAt}] INFO sandbox created, state initialized. Waiting for agent connection...`;

  reply.type("text/plain").send(logs);
});

app.delete("/v1/sandboxes/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec) return reply.code(404).send({ error: "not_found" });
  const denied = assertOwner(
    rec,
    req as { headers: Record<string, unknown> },
    reply as { code: (n: number) => { send: (b: unknown) => unknown } },
  );
  if (denied) return denied;
  await fetch(`${ORCH}/sandboxes/${id}`, { method: "DELETE" });
  rec.status = "reset";
  return { ok: true, liveScore: rec.liveScore };
});


/** Sandbox MCP callbacks — auto-score on every tool call */
app.post("/v1/internal/sandbox-event", async (req, reply) => {
  const body = (req.body || {}) as {
    type?: string;
    sandboxId?: string;
    tool?: string;
    args?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    ok?: boolean;
    latencyMs?: number;
    state?: Record<string, Record<string, unknown>[]>;
  };
  const token = req.headers["x-sandbox-token"];
  const rec = body.sandboxId ? sandboxes.get(body.sandboxId) : undefined;
  if (!rec) return reply.code(404).send({ error: "not_found" });
  if (token && token !== rec.token) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  if (body.type === "tool_call") {
    rec.events.push({
      id: createId("evt"),
      ts: nowIso(),
      tool: body.tool || "",
      args: body.args || {},
      error: body.error,
      ok: Boolean(body.ok),
      latencyMs: body.latencyMs || 0,
    });
    if (body.state) rec.lastState = body.state;

    const spec = rec.worldSpec as Parameters<typeof scoreWorld>[0];
    rec.liveScore = scoreWorld(spec, {
      state: rec.lastState,
      events: rec.events.map((e) => ({
        tool: e.tool,
        args: e.args,
        error: e.error,
      })),
    });
    rec.status = "running";
  }

  return { ok: true, liveScore: rec.liveScore };
});

/** Used by gateway to resolve routing */
app.get("/v1/internal/sandboxes/:id/route", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rec = sandboxes.get(id);
  if (!rec?.mcpInternalUrl) return reply.code(404).send({ error: "not_found" });
  return {
    mcpInternalUrl: rec.mcpInternalUrl,
    token: rec.token,
  };
});

const port = Number(process.env.PORT_API || 3001);
await app.listen({ port, host: "0.0.0.0" });
console.log(`[api] :${port}`);
