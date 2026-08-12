# Deploy AgentArena (clean)

## Rules
- **`.env`** = real secrets (gitignored)
- **`.env.example`** = placeholders only
- **`zerops.yml`** = build/run only — **no secrets**

## How “fallback” worked (and why we killed it as the product path)
1. Orchestrator prefers Docker (`docker info`).
2. If no daemon → old code spawned MCP as a **host Node process** (process fallback).
3. That path broke on Zerops (`tsx` missing, no isolation) and is **not** what AgentArena sells.

**Docker-only now:** `USE_DOCKER=require`. Creates fail loudly if Docker is missing — no silent process mode.

## Why you saw 502 / raw HTML
| Symptom | Cause |
| --- | --- |
| 502 + “Check if your application is running on a correct port” | Zerops proxy → service down / wrong port / crash |
| Create sandbox dumps HTML in red | UI showed raw proxy body — **fixed** (JSON errors only) |
| `docker_required` / no sandboxes | `apt install docker.io` on **ubuntu** ≠ Docker daemon |
| Ideal `docker@26.1` VM | [Zerops Docker docs](https://docs.zerops.io/docker/overview) — **this org catalog returns `serviceStackTypeNotFound` for all `docker@*`** (same class of gap as missing `nodejs@*`) |

## Docker-only options that actually work

### A) Zerops Docker VM (best, when enabled)
Ask Zerops support to enable **Docker service** on the project/org, then:
```powershell
zcli service delete orchestrator -P ReaxOXR8QDCMOhE2YTBZpQ --confirm
zcli project service-import infra/import-orchestrator-docker.yml -P ReaxOXR8QDCMOhE2YTBZpQ
```
Set `DOCKER_NETWORK=host`, `USE_DOCKER=require`, `MCP_ADVERTISE_HOST=orchestrator`.

### B) Nested dockerd on ubuntu (what we deploy now)
`boot.mjs` starts `dockerd` if missing, builds `agentarena-sandbox-mcp:1.0.0`, runs orchestrator. Works only if the Incus container allows nesting — health must show `"docker": true`. Use **≥2GB RAM** on `orch`.

### C) Remote Docker daemon (still Docker isolation)
On any VPS with Docker:
```bash
# expose daemon carefully (TLS or private VPN) then on orchestrator:
DOCKER_HOST=tcp://your-docker-host:2375
MCP_ADVERTISE_HOST=your-docker-host
DOCKER_NETWORK=bridge
```
Gateway must reach `MCP_ADVERTISE_HOST:mcpPort` (VPN / private net).

## 1. Project
ID: `ReaxOXR8QDCMOhE2YTBZpQ`  
Services: `web`, `api`, `gateway`, `orch` (+ zcp)  
(`orch` = Docker-capable orchestrator with ≥2GB RAM. Old `orchestrator` hostname retired.)

Recreate if needed:
```powershell
zcli project service-import infra/import-orch.yml -P ReaxOXR8QDCMOhE2YTBZpQ
```

## 2. Env paste (restart after)
| Service | Keys |
| --- | --- |
| `web` | AUTH_*, PLATFORM_API_KEY, API_URL |
| `api` | PLATFORM_API_KEY, ORCHESTRATOR_URL=http://orch:7100, PUBLIC_*, BEDROCK_*, PORT_API |
| `gateway` | API_URL=http://api:3001, PORT_GATEWAY |
| `orch` | PORT=7100, USE_DOCKER=require, DOCKER_NETWORK=host, MCP_ADVERTISE_HOST=orch, SANDBOX_IMAGE, SANDBOX_ROOT=/var/www/.sandboxes, PLATFORM_EVENT_URL |

Public URLs after subdomain enable:
- `AUTH_URL` / `NEXT_PUBLIC_APP_URL` = web HTTPS
- `PUBLIC_BASE_URL` = api HTTPS
- `PUBLIC_MCP_BASE_URL` = gateway HTTPS

## 3. Push
```powershell
cd agentarena
zcli push orch --setup orchestrator -P ReaxOXR8QDCMOhE2YTBZpQ -w all
zcli push web --setup web -P ReaxOXR8QDCMOhE2YTBZpQ -w all
zcli push api --setup api -P ReaxOXR8QDCMOhE2YTBZpQ -w all
zcli push gateway --setup gateway -P ReaxOXR8QDCMOhE2YTBZpQ -w all
```

## Sanity
`orch` `/health` must include `"docker": true` before create sandbox works.

Right now nested `dockerd` on ubuntu **does not start** on this project (no Zerops `docker@` stack). Until Docker is available:

1. Paste on **api**: `ORCHESTRATOR_URL=http://orch:7100` then restart api  
2. Paste on **orch**: `USE_DOCKER=require`, `DOCKER_NETWORK=host`, `MCP_ADVERTISE_HOST=orch`, `SANDBOX_ROOT=/var/www/.sandboxes`, `PLATFORM_EVENT_URL=http://api:3001/v1/internal/sandbox-event`  
3. Either ask Zerops to enable **Docker VM** services, **or** set `DOCKER_HOST` on orch to a real remote Docker daemon (still Docker-only isolation)
