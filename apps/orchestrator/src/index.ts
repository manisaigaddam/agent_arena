import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const PORT = Number(process.env.PORT_ORCH || 7100);
/**
 * require (default on Zerops) — Docker only
 * prefer — Docker if daemon up, else process (local convenience)
 * never — process only
 */
const DOCKER_MODE = (process.env.USE_DOCKER || "prefer").toLowerCase();
const SANDBOX_IMAGE =
  process.env.SANDBOX_IMAGE || "agentarena-sandbox-mcp:1.0.0";
/** Hostname other services use to reach MCP ports on this host */
const ADVERTISE_HOST =
  process.env.MCP_ADVERTISE_HOST ||
  process.env.ZEROPS_HOSTNAME ||
  "orch";
/** Zerops Docker VMs need host networking for spawned containers */
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "host";

function resolveSandboxRoot(): string {
  const candidates = [
    process.env.SANDBOX_ROOT,
    join(ROOT, ".sandboxes"),
    "/var/www/.sandboxes",
    "/tmp/agentarena/sandboxes",
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Cannot create SANDBOX_ROOT — set SANDBOX_ROOT to a writable path (e.g. /var/www/.sandboxes)",
  );
}

const SANDBOX_ROOT = resolveSandboxRoot();

type Runtime = {
  sandboxId: string;
  mode: "docker" | "process";
  mcpPort: number;
  token: string;
  dir: string;
  containerName?: string;
  child?: ChildProcess;
};

const runtimes = new Map<string, Runtime>();

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      const p = addr.port;
      s.close(() => resolve(p));
    });
  });
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { stdio?: "inherit" | "ignore" } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: opts.stdio ?? "inherit" });
    p.on("error", reject);
    p.on("exit", (code) => resolve(code ?? 1));
  });
}

async function dockerAvailable(): Promise<boolean> {
  if (
    DOCKER_MODE === "false" ||
    DOCKER_MODE === "0" ||
    DOCKER_MODE === "never" ||
    DOCKER_MODE === "process"
  ) {
    return false;
  }
  try {
    return (await runCmd("docker", ["info"], { stdio: "ignore" })) === 0;
  } catch {
    return false;
  }
}

async function ensureSandboxImage(): Promise<void> {
  const inspect = await runCmd(
    "docker",
    ["image", "inspect", SANDBOX_IMAGE],
    { stdio: "ignore" },
  );
  if (inspect === 0) return;

  const context = join(ROOT, "sandbox", "mcp");
  const code = await runCmd("docker", ["build", "-t", SANDBOX_IMAGE, context]);
  if (code !== 0) {
    throw new Error(
      `docker build failed for ${SANDBOX_IMAGE} (context=${context})`,
    );
  }
}

function writeSandboxFiles(
  sandboxId: string,
  worldSpec: unknown,
  token: string,
) {
  const dir = join(SANDBOX_ROOT, sandboxId);
  mkdirSync(join(dir, "world"), { recursive: true });
  mkdirSync(join(dir, "data"), { recursive: true });
  writeFileSync(
    join(dir, "world", "world_spec.json"),
    JSON.stringify(worldSpec, null, 2),
  );
  writeFileSync(join(dir, "token"), token);
  return dir;
}

async function waitHealthy(port: number, token: string, timeoutMs = 45000) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/health?token=${encodeURIComponent(token)}`,
        { headers: { "x-sandbox-token": token } },
      );
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`sandbox on :${port} failed health check (${lastErr})`);
}

async function startProcessMode(
  sandboxId: string,
  worldSpec: unknown,
  token: string,
  platformEventUrl: string,
): Promise<Runtime> {
  const dir = writeSandboxFiles(sandboxId, worldSpec, token);
  const mcpPort = await freePort();
  const mcpSrc = join(ROOT, "sandbox", "mcp");
  const distServer = join(mcpSrc, "dist", "server.js");
  const child = spawn(process.execPath, [distServer], {
    cwd: mcpSrc,
    env: {
      ...process.env,
      PORT: String(mcpPort),
      WORLD_DIR: join(dir, "world"),
      DATA_DIR: join(dir, "data"),
      SANDBOX_ID: sandboxId,
      SANDBOX_TOKEN: token,
      PLATFORM_EVENT_URL: platformEventUrl,
    },
    stdio: "inherit",
  });
  const rt: Runtime = {
    sandboxId,
    mode: "process",
    mcpPort,
    token,
    dir,
    child,
  };
  runtimes.set(sandboxId, rt);
  await waitHealthy(mcpPort, token);
  return rt;
}

async function startDockerMode(
  sandboxId: string,
  worldSpec: unknown,
  token: string,
  platformEventUrl: string,
): Promise<Runtime> {
  const dir = writeSandboxFiles(sandboxId, worldSpec, token);
  const mcpPort = await freePort();
  await ensureSandboxImage();

  const name = `aa_${sandboxId}`;
  await runCmd("docker", ["rm", "-f", name], { stdio: "ignore" });

  // Zerops Docker VMs require --network=host (docs.zerops.io/docker).
  // Local Docker Desktop can use bridge + -p.
  const useHostNet = DOCKER_NETWORK === "host";
  const containerPort = useHostNet ? mcpPort : 3002;
  const args = [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "--network",
    DOCKER_NETWORK,
    ...(useHostNet ? [] : ["-p", `${mcpPort}:${containerPort}`]),
    "-e",
    `PORT=${containerPort}`,
    "-e",
    "WORLD_DIR=/world",
    "-e",
    "DATA_DIR=/data",
    "-e",
    `SANDBOX_ID=${sandboxId}`,
    "-e",
    `SANDBOX_TOKEN=${token}`,
    "-e",
    `PLATFORM_EVENT_URL=${platformEventUrl}`,
    "-v",
    `${join(dir, "world")}:/world:ro`,
    "-v",
    `${join(dir, "data")}:/data`,
    SANDBOX_IMAGE,
  ];

  const code = await runCmd("docker", args);
  if (code !== 0) {
    throw new Error(`docker run failed for ${name} (exit ${code})`);
  }

  const rt: Runtime = {
    sandboxId,
    mode: "docker",
    mcpPort,
    token,
    dir,
    containerName: name,
  };
  runtimes.set(sandboxId, rt);
  await waitHealthy(mcpPort, token);
  return rt;
}

async function destroyRuntime(sandboxId: string) {
  const rt = runtimes.get(sandboxId);
  if (!rt) return;
  if (rt.mode === "process" && rt.child) {
    rt.child.kill("SIGTERM");
  }
  if (rt.mode === "docker" && rt.containerName) {
    await runCmd("docker", ["rm", "-f", rt.containerName], { stdio: "ignore" });
  }
  try {
    rmSync(rt.dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  runtimes.delete(sandboxId);
}

function mcpInternalUrl(sandboxId: string) {
  return `http://${ADVERTISE_HOST}:${PORT}/sandboxes/${sandboxId}`;
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => {
  const docker = await dockerAvailable();
  return {
    status: "ok",
    service: "orchestrator",
    docker,
    dockerMode: DOCKER_MODE,
    dockerNetwork: DOCKER_NETWORK,
    sandboxImage: SANDBOX_IMAGE,
    advertiseHost: ADVERTISE_HOST,
    active: runtimes.size,
    root: SANDBOX_ROOT,
  };
});

app.post("/sandboxes/:id/message", handleMcpMessage);
app.post("/sandboxes/:id/mcp/message", handleMcpMessage);

async function handleMcpMessage(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const rt = runtimes.get(id);
  if (!rt) return reply.code(404).send({ error: "sandbox_not_found" });

  const token =
    (req.headers["x-sandbox-token"] as string) ||
    (req.query as { token?: string }).token;
  if (token && token !== rt.token) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  try {
    const upstream = await fetch(`http://127.0.0.1:${rt.mcpPort}/mcp/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sandbox-token": rt.token,
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await upstream.json();
    return reply.code(upstream.status).send(data);
  } catch (err) {
    return reply.code(502).send({
      error: "sandbox_upstream_error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

app.post("/sandboxes", async (req, reply) => {
  const body = (req.body || {}) as {
    sandboxId?: string;
    token?: string;
    worldSpec?: unknown;
    platformEventUrl?: string;
  };
  if (!body.sandboxId || !body.worldSpec || !body.token) {
    return reply.code(400).send({ error: "sandboxId, token, worldSpec required" });
  }
  if (runtimes.has(body.sandboxId)) {
    return reply.code(409).send({ error: "already_exists" });
  }

  const platformEventUrl =
    body.platformEventUrl ||
    process.env.PLATFORM_EVENT_URL ||
    "http://127.0.0.1:3001/v1/internal/sandbox-event";

  try {
    const neverDocker =
      DOCKER_MODE === "false" ||
      DOCKER_MODE === "0" ||
      DOCKER_MODE === "never" ||
      DOCKER_MODE === "process";

    const hasDocker = await dockerAvailable();
    let rt: Runtime;

    if (!neverDocker && hasDocker) {
      try {
        rt = await startDockerMode(
          body.sandboxId,
          body.worldSpec,
          body.token,
          platformEventUrl,
        );
      } catch (e) {
        req.log.warn(`Docker start failed, falling back to process mode: ${e}`);
        rt = await startProcessMode(
          body.sandboxId,
          body.worldSpec,
          body.token,
          platformEventUrl,
        );
      }
    } else {
      rt = await startProcessMode(
        body.sandboxId,
        body.worldSpec,
        body.token,
        platformEventUrl,
      );
    }

    return {
      sandboxId: rt.sandboxId,
      mode: rt.mode,
      mcpPort: rt.mcpPort,
      mcpInternalUrl: mcpInternalUrl(rt.sandboxId),
      token: rt.token,
    };
  } catch (err) {
    req.log.error(err);
    try {
      await destroyRuntime(body.sandboxId);
    } catch {
      /* ignore */
    }
    return reply.code(500).send({
      error: "sandbox_create_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/sandboxes/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rt = runtimes.get(id);
  if (!rt) return reply.code(404).send({ error: "not_found" });
  return {
    sandboxId: rt.sandboxId,
    mode: rt.mode,
    mcpPort: rt.mcpPort,
    mcpInternalUrl: mcpInternalUrl(rt.sandboxId),
  };
});

app.delete("/sandboxes/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  await destroyRuntime(id);
  return { ok: true };
});

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(
  `[orchestrator] :${PORT} dockerMode=${DOCKER_MODE} network=${DOCKER_NETWORK} image=${SANDBOX_IMAGE} advertise=${ADVERTISE_HOST} root=${SANDBOX_ROOT}`,
);
