# AgentArena

Docker sandboxes for **your** MCP agents. Prompt (or template) → world + `skill.md` → connect MCP → **live auto-score** → reset.

Plan: [`PRODUCT-PLAN.md`](./PRODUCT-PLAN.md) · Deploy: [`DEPLOY.md`](./DEPLOY.md)

## How it works

1. **Sign in** — Auth.js on `web` (browser control plane)
2. **Plan** — Bedrock GLM turns your prompt into a World Spec (or use a template)
3. **Materialize** — orchestrator always boots a **Docker** sandbox (SQLite + MCP)
4. **Guide** — `skill.md` + MCP URL (with sandbox token) for your agent
5. **Operate / score** — every tool call auto-updates the live score
6. **Reset** — destroy the container

**Auth split:** Auth.js = you in the UI. Per-sandbox `?token=` = your agent over MCP. Agents never use your Auth.js cookie.

## Local run (Docker required)

```bash
pnpm install
cp .env.example .env
# set AUTH_SECRET, PLATFORM_API_KEY, AUTH_PASSWORD, optional BEDROCK_API_KEY
# Docker Desktop must be running

pnpm --filter @agentarena/shared build
pnpm --filter @agentarena/llm build
pnpm --filter @agentarena/world build
pnpm --filter @agentarena/eval build

# four terminals:
pnpm --filter @agentarena/orchestrator dev   # :7100
pnpm --filter @agentarena/api dev            # :3001
pnpm --filter @agentarena/gateway dev        # :3002
pnpm --filter @agentarena/web dev            # :3000  (Next.js + Auth.js)
```

Open http://localhost:3000/login

## Zerops

CLI-first: see **DEPLOY.md**. Paste secrets in the Zerops UI env panels.
