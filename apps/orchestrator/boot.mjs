import { spawn } from "node:child_process";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SANDBOX_ROOT = process.env.SANDBOX_ROOT || "/var/www/.sandboxes";
const SANDBOX_IMAGE =
  process.env.SANDBOX_IMAGE || "agentarena-sandbox-mcp:1.0.0";
const DOCKER_DATA = process.env.DOCKER_DATA_ROOT || "/var/www/.docker-data";
const DOCKER_SOCK =
  process.env.DOCKER_SOCK || "/var/www/.docker.sock";

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      stdio: opts.stdio ?? "ignore",
      env: process.env,
      ...opts,
    });
    p.on("error", () => resolve(1));
    p.on("exit", (code) => resolve(code ?? 1));
  });
}

async function dockerOk() {
  return (await run("docker", ["info"])) === 0;
}

async function tryStartDockerd() {
  console.log("[orchestrator-boot] no docker daemon — attempting dockerd...");

  // System package path (may work if service unit is allowed)
  await run("sudo", ["service", "docker", "start"]);
  await run("sudo", ["systemctl", "start", "docker"]);
  if (await dockerOk()) {
    console.log("[orchestrator-boot] system docker service is up");
    return true;
  }

  try {
    mkdirSync(DOCKER_DATA, { recursive: true });
  } catch (e) {
    console.log(
      "[orchestrator-boot] cannot create docker data dir:",
      e instanceof Error ? e.message : e,
    );
    return false;
  }

  const sockDir = dirname(DOCKER_SOCK);
  try {
    mkdirSync(sockDir, { recursive: true });
  } catch {
    /* ignore */
  }

  process.env.DOCKER_HOST = `unix://${DOCKER_SOCK}`;

  const args = [
    `--data-root=${DOCKER_DATA}`,
    `--host=unix://${DOCKER_SOCK}`,
    "--iptables=false",
    "--ip-forward=false",
    "--bridge=none",
  ];

  // Prefer sudo when available (Zerops runtime often non-root).
  const useSudo = (await run("sudo", ["-n", "true"])) === 0;
  const cmd = useSudo ? "sudo" : "dockerd";
  const cmdArgs = useSudo ? ["dockerd", ...args] : args;

  spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" }).unref();

  for (let i = 0; i < 40; i++) {
    if (await dockerOk()) {
      console.log("[orchestrator-boot] dockerd is up");
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function ensureImage() {
  if ((await run("docker", ["image", "inspect", SANDBOX_IMAGE])) === 0) {
    return;
  }
  console.log("[orchestrator-boot] building", SANDBOX_IMAGE);
  const ctx = join(ROOT, "sandbox", "mcp");
  await run("docker", ["build", "-t", SANDBOX_IMAGE, ctx], {
    stdio: "inherit",
  });
}

async function main() {
  try {
    mkdirSync(SANDBOX_ROOT, { recursive: true });
  } catch (e) {
    console.log(
      "[orchestrator-boot] SANDBOX_ROOT mkdir failed:",
      e instanceof Error ? e.message : e,
    );
  }

  let ok = false;
  try {
    ok = await dockerOk();
    if (!ok) ok = await tryStartDockerd();
  } catch (e) {
    console.log(
      "[orchestrator-boot] docker probe failed:",
      e instanceof Error ? e.message : e,
    );
  }

  if (ok) {
    console.log("[orchestrator-boot] docker ok");
    try {
      await ensureImage();
    } catch (e) {
      console.log(
        "[orchestrator-boot] image build failed:",
        e instanceof Error ? e.message : e,
      );
    }
  } else {
    console.log(
      "[orchestrator-boot] WARNING: Docker unavailable. USE_DOCKER=require will fail creates.",
    );
    console.log(
      "[orchestrator-boot] Enable Zerops docker@ VM or set DOCKER_HOST to a remote daemon.",
    );
    if (existsSync("/tmp/dockerd.log")) {
      try {
        console.log(readFileSync("/tmp/dockerd.log", "utf8").slice(-2000));
      } catch {
        /* ignore */
      }
    }
  }

  const dist = join(__dirname, "dist", "index.js");
  const child = spawn(process.execPath, [dist], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((e) => {
  console.error("[orchestrator-boot] fatal", e);
  // Still try to start the API so /health is reachable
  const dist = join(__dirname, "dist", "index.js");
  const child = spawn(process.execPath, [dist], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
});
