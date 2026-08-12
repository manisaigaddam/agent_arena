import Fastify from "fastify";
import cors from "@fastify/cors";

const API = (process.env.API_URL || "http://api:3001").replace(/\/$/, "");
const PORT = Number(process.env.PORT_GATEWAY || 3002);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok", service: "gateway" }));

async function resolve(sandboxId: string) {
  const res = await fetch(`${API}/v1/internal/sandboxes/${sandboxId}/route`);
  if (!res.ok) throw new Error("sandbox_route_missing");
  return (await res.json()) as { mcpInternalUrl: string; token: string };
}

app.get("/mcp/:sandboxId/sse", async (req, reply) => {
  const { sandboxId } = req.params as { sandboxId: string };
  const token =
    (req.query as { token?: string }).token ||
    String(req.headers["x-sandbox-token"] || "");
  let route;
  try {
    route = await resolve(sandboxId);
  } catch {
    return reply.code(404).send({ error: "not_found" });
  }
  if (token && token !== route.token) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  // Proxy SSE by redirecting clients to use message endpoint on gateway
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  reply.raw.write(
    `event: endpoint\ndata: /mcp/${sandboxId}/message${q}\n\n`,
  );
  const ping = setInterval(() => {
    reply.raw.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);
  req.raw.on("close", () => clearInterval(ping));
});

app.post("/mcp/:sandboxId/message", async (req, reply) => {
  const { sandboxId } = req.params as { sandboxId: string };
  const token =
    (req.query as { token?: string }).token ||
    String(req.headers["x-sandbox-token"] || "");
  let route;
  try {
    route = await resolve(sandboxId);
  } catch {
    return reply.code(404).send({ error: "not_found" });
  }
  if (token && token !== route.token) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const upstream = await fetch(`${route.mcpInternalUrl}/mcp/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sandbox-token": route.token,
    },
    body: JSON.stringify(req.body ?? {}),
  });
  const data = await upstream.json();
  return reply.code(upstream.status).send(data);
});

app.get("/mcp/:sandboxId/skill.md", async (req, reply) => {
  const { sandboxId } = req.params as { sandboxId: string };
  const res = await fetch(`${API}/v1/sandboxes/${sandboxId}/skill.md`);
  const text = await res.text();
  reply.type("text/markdown").code(res.status).send(text);
});

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`[gateway] :${PORT}`);
