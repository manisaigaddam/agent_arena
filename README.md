# 🛡️ AgentArena
> **Disposable, MCP-Native Agent Sandbox & Real-Time Evaluator Platform**

[![Zerops PaaS](https://img.shields.io/badge/Deployed%20on-Zerops-00DC82?style=flat-square&logo=zerops)](https://zerops.io)
[![MCP Protocol](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol-8A2BE2?style=flat-square)](https://modelcontextprotocol.io)
[![Next.js 15](https://img.shields.io/badge/Frontend-Next.js%2015-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Fastify](https://img.shields.io/badge/Backend-Fastify-000000?style=flat-square&logo=fastify)](https://fastify.io)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 💡 Overview

**AgentArena** is an infrastructure platform built for AI developers to **test, attack, evaluate, and benchmark tool-using AI agents** before deploying them to production.

When you connect an AI agent to real tools (databases, APIs, email, payment systems), non-deterministic LLMs can suffer from **prompt injection, unauthorized operations, catastrophic mistakes, or privacy leaks**. AgentArena provides disposable, zero-risk sandbox environments that record every tool call, evaluate agent behavior against ground truth, and calculate a live multi-dimensional scorecard.

```
       [ AI Agent ] (Cursor / Claude / Custom SDK)
            │
            ▼  (MCP SSE Protocol)
   ┌─────────────────────────────────────────┐
   │         AgentArena MCP Gateway          │
   └────────────────────┬────────────────────┘
                        │
       ┌────────────────┴────────────────┐
       ▼                                 ▼
┌──────────────┐                 ┌──────────────┐
│  Orchestrator│                 │ Control API  │
│  (Sandbox    │                 │ & Live Eval  │
│   Engine)    │                 │   Engine     │
└──────┬───────┘                 └──────┬───────┘
       │                                │
       ▼                                ▼
[ Disposable SQLite ]           [ Live Scorecard ]
(Isolated State + Tools)        (Capability / Security)
```

---

## ✨ Key Features

- **⚡ Zero-Consequence Sandboxes**: Spin up disposable isolated environments per agent run. Reset state instantly with one click.
- **🔌 MCP Native (Model Context Protocol)**: Connect Cursor, Claude Desktop, LangChain, or custom agents via standard SSE MCP endpoints (`/mcp/<sandbox_id>/sse`).
- **📊 Real-Time Multi-Dimensional Evaluation**: Calculates live scores across 6 key metrics:
  - **Capability & Accuracy**: Did the agent fulfill the target goal without state corruption?
  - **Security & Attack Resistance**: Did the agent resist prompt injections & privilege escalation?
  - **Privacy**: Did the agent preserve sensitive PII data?
  - **Recovery**: Did the agent gracefully handle API failures & chaos injection?
  - **Efficiency**: Tool-call count & token conservation.
- **🧠 Bedrock AI World Planner**: Generate custom domain sandboxes from a single natural-language prompt (e.g. *"DevOps agent responding to AWS S3 outage"*).
- **🚀 Zerops PaaS Optimized**: Deployed across micro-services on Zerops (`web`, `api`, `gateway`, `orch`, `db`, `valkey`).

---

## 🛠️ Architecture & Monorepo Structure

```text
agentarena/
├── apps/
│   ├── web/          # Next.js 15 + Auth.js + Cyberpunk Emerald UI
│   ├── api/          # Fastify Control Plane API & Eval Engine
│   ├── gateway/      # Public MCP SSE Router Proxy
│   └── orchestrator/ # Sandbox Lifecycle Engine (Process & Docker)
├── packages/
│   ├── eval/         # Real-time state & trajectory scoring logic
│   ├── llm/          # Bedrock Mantle / AWS LLM client
│   ├── shared/       # Monorepo types, schemas & file storage
│   └── world/        # World generation templates & tool engines
├── sandbox/
│   └── mcp/          # Lightweight isolated MCP tool server
├── infra/
│   └── zerops.yml    # Zerops build & deployment pipeline
└── package.json
```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Run Dev Server
```bash
pnpm dev
```
Open **http://localhost:3000** in your browser.

---

## 🌐 Connecting Your Agent

1. Open AgentArena UI and click **Create Sandbox**.
2. Copy the generated **MCP SSE URL**:
   `http://localhost:3002/mcp/sbx_xxx/sse?token=tok_xxx`
3. Add the URL to your agent client (`claude_desktop_config.json` or Cursor MCP settings).
4. Run your agent task and watch the **Live Scorecard** update in real time!

---

## 📄 License
MIT © [Mani Sai Gaddam](https://github.com/manisaigaddam)
