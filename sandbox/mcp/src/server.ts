import Fastify from "fastify";
import cors from "@fastify/cors";
import Database from "better-sqlite3";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

type WorldSpec = {
  entities: Array<{
    name: string;
    fields: Array<{ name: string; type: string }>;
  }>;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    effect: {
      op: string;
      table?: string;
      where?: string;
      set?: Record<string, string>;
      argsMap?: Record<string, string>;
      returning?: boolean;
    };
  }>;
  seedData: Record<string, Record<string, unknown>[]>;
  files?: Record<string, string>;
  requirements: unknown[];
  task: string;
  title: string;
  skillMarkdown?: string;
};

const WORLD_DIR = process.env.WORLD_DIR || "/world";
const DATA_DIR = process.env.DATA_DIR || "/data";
const PORT = Number(process.env.PORT || 3002);
const SANDBOX_ID = process.env.SANDBOX_ID || "local";
const PLATFORM_EVENT_URL = process.env.PLATFORM_EVENT_URL || "";
const TOKEN = process.env.SANDBOX_TOKEN || "";

mkdirSync(DATA_DIR, { recursive: true });

const specPath = join(WORLD_DIR, "world_spec.json");
if (!existsSync(specPath)) {
  throw new Error(`missing ${specPath}`);
}
const spec = JSON.parse(readFileSync(specPath, "utf8")) as WorldSpec;

const db = new Database(join(DATA_DIR, "world.sqlite"));
db.pragma("journal_mode = WAL");

function sqlType(t: string) {
  if (t === "int") return "INTEGER";
  if (t === "real") return "REAL";
  if (t === "bool") return "INTEGER";
  return "TEXT";
}

for (const ent of spec.entities) {
  const cols = ent.fields
    .map((f) => `${f.name} ${sqlType(f.type)}`)
    .join(", ");
  db.exec(`CREATE TABLE IF NOT EXISTS ${ent.name} (${cols})`);
  db.exec(`DELETE FROM ${ent.name}`);
  const rows = spec.seedData[ent.name] || [];
  if (!rows.length) continue;
  const keys = Object.keys(rows[0]!);
  const stmt = db.prepare(
    `INSERT INTO ${ent.name} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
  );
  const tx = db.transaction((items: Record<string, unknown>[]) => {
    for (const row of items) stmt.run(...keys.map((k) => row[k]));
  });
  tx(rows);
}

const files: Record<string, string> = { ...(spec.files || {}) };
writeFileSync(join(DATA_DIR, "files.json"), JSON.stringify(files));

function dumpState(): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const ent of spec.entities) {
    out[ent.name] = db.prepare(`SELECT * FROM ${ent.name}`).all() as Record<
      string,
      unknown
    >[];
  }
  return out;
}

function bindWhere(
  where: string | undefined,
  argsMap: Record<string, string> | undefined,
  args: Record<string, unknown>,
) {
  if (!where) return { sql: "1=1", values: [] as unknown[] };
  let sql = where;
  const values: unknown[] = [];
  const map = argsMap || {};
  for (const [placeholder, argKey] of Object.entries(map)) {
    const token = `$${placeholder}`;
    if (sql.includes(token)) {
      sql = sql.replaceAll(token, "?");
      values.push(args[argKey]);
    }
  }
  // also replace $status style left in SET values handled separately
  return { sql, values };
}

function applySet(
  set: Record<string, string> | undefined,
  args: Record<string, unknown>,
) {
  if (!set) return { clause: "", values: [] as unknown[] };
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const [col, raw] of Object.entries(set)) {
    if (raw.startsWith("$")) {
      parts.push(`${col} = ?`);
      values.push(args[raw.slice(1)]);
    } else if (raw.startsWith("'") && raw.endsWith("'")) {
      parts.push(`${col} = ?`);
      values.push(raw.slice(1, -1));
    } else {
      parts.push(`${col} = ?`);
      values.push(raw);
    }
  }
  return { clause: parts.join(", "), values };
}

function executeTool(toolName: string, args: Record<string, unknown>) {
  const tool = spec.tools.find((t) => t.name === toolName);
  if (!tool) return { ok: false, error: "unknown_tool", result: null };
  const { effect } = tool;
  try {
    switch (effect.op) {
      case "select": {
        const { sql, values } = bindWhere(effect.where, effect.argsMap, args);
        const rows = db
          .prepare(`SELECT * FROM ${effect.table} WHERE ${sql}`)
          .all(...values);
        return { ok: true, result: rows };
      }
      case "select_one": {
        const { sql, values } = bindWhere(effect.where, effect.argsMap, args);
        const row = db
          .prepare(`SELECT * FROM ${effect.table} WHERE ${sql}`)
          .get(...values);
        return row
          ? { ok: true, result: row }
          : { ok: false, error: "not_found", result: null };
      }
      case "update": {
        const { sql, values: wvals } = bindWhere(
          effect.where,
          effect.argsMap,
          args,
        );
        const { clause, values: svals } = applySet(effect.set, args);
        const info = db
          .prepare(
            `UPDATE ${effect.table} SET ${clause} WHERE ${sql}`,
          )
          .run(...svals, ...wvals);
        const row = effect.returning
          ? db
              .prepare(`SELECT * FROM ${effect.table} WHERE ${sql}`)
              .get(...wvals)
          : { changes: info.changes };
        return { ok: true, result: row };
      }
      case "insert_email": {
        const id = `mail_${randomBytes(4).toString("hex")}`;
        db.prepare(
          `INSERT INTO emails (id, to_addr, subject, body) VALUES (?,?,?,?)`,
        ).run(id, args.to, args.subject, args.body);
        return {
          ok: true,
          result: {
            id,
            to_addr: args.to,
            subject: args.subject,
            body: args.body,
          },
        };
      }
      case "read_file": {
        const path = String(args.path || "");
        const content = files[path];
        if (content === undefined)
          return { ok: false, error: "file_not_found", result: null };
        return { ok: true, result: { path, content } };
      }
      case "list_files":
        return { ok: true, result: Object.keys(files) };
      default:
        return { ok: false, error: `unsupported_op:${effect.op}`, result: null };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "tool_error",
      result: null,
    };
  }
}

async function notifyPlatform(payload: Record<string, unknown>) {
  if (!PLATFORM_EVENT_URL) return;
  try {
    await fetch(PLATFORM_EVENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN ? { "x-sandbox-token": TOKEN } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore callback failures
  }
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.addHook("onRequest", async (req, reply) => {
  if (!TOKEN) return;
  const hdr = req.headers["x-sandbox-token"];
  const q = (req.query as { token?: string }).token;
  if (hdr !== TOKEN && q !== TOKEN) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/health", async () => ({
  status: "ok",
  sandboxId: SANDBOX_ID,
  title: spec.title,
}));

app.get("/skill.md", async (_req, reply) => {
  const md =
    spec.skillMarkdown ||
    `# ${spec.title}\n\n${spec.task}\n`;
  reply.type("text/markdown").send(md);
});

app.get("/state", async () => ({ state: dumpState(), files: Object.keys(files) }));

app.get("/tools", async () => ({
  tools: spec.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

app.post("/tools/call", async (req) => {
  const body = (req.body || {}) as {
    tool?: string;
    args?: Record<string, unknown>;
  };
  const started = Date.now();
  const tool = body.tool || "";
  const args = body.args || {};
  const out = executeTool(tool, args);
  const event = {
    sandboxId: SANDBOX_ID,
    tool,
    args,
    result: out.result,
    error: out.error,
    ok: out.ok,
    latencyMs: Date.now() - started,
    state: dumpState(),
  };
  await notifyPlatform({ type: "tool_call", ...event });
  return event;
});

// Minimal MCP JSON-RPC over HTTP
app.post("/mcp/message", async (req) => {
  const msg = (req.body || {}) as {
    method?: string;
    id?: string | number;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };

  if (msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "agentarena-sandbox", version: "0.1.0" },
      },
    };
  }
  if (msg.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: spec.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    };
  }
  if (msg.method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        resources: [
          {
            uri: `arena://skill/${SANDBOX_ID}`,
            name: "skill.md",
            mimeType: "text/markdown",
          },
        ],
      },
    };
  }
  if (msg.method === "resources/read") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        contents: [
          {
            uri: `arena://skill/${SANDBOX_ID}`,
            mimeType: "text/markdown",
            text: spec.skillMarkdown || spec.task,
          },
        ],
      },
    };
  }
  if (msg.method === "tools/call") {
    const name = msg.params?.name || "";
    const args = msg.params?.arguments || {};
    const started = Date.now();
    const out = executeTool(name, args);
    await notifyPlatform({
      type: "tool_call",
      sandboxId: SANDBOX_ID,
      tool: name,
      args,
      result: out.result,
      error: out.error,
      ok: out.ok,
      latencyMs: Date.now() - started,
      state: dumpState(),
    });
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              out.ok ? out.result : { error: out.error },
              null,
              2,
            ),
          },
        ],
        isError: !out.ok,
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: `Method not found: ${msg.method}` },
  };
});

app.get("/mcp/sse", async (req, reply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const q = TOKEN ? `?token=${TOKEN}` : "";
  reply.raw.write(`event: endpoint\ndata: /mcp/message${q}\n\n`);
  const ping = setInterval(() => {
    reply.raw.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);
  req.raw.on("close", () => clearInterval(ping));
});

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`[sandbox-mcp] ${SANDBOX_ID} on ${PORT}`);
