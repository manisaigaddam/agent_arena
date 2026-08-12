import { getPool, useMemoryStore } from "./db.js";

const PLATFORM_SQL = `
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_key TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  task_prompt TEXT NOT NULL,
  world_spec JSONB NOT NULL,
  injections JSONB NOT NULL,
  tools JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sandboxes (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id),
  schema_name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  status TEXT NOT NULL,
  ttl_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mcp_url TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id),
  agent_config JSONB NOT NULL,
  connect_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  seq INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tool TEXT NOT NULL,
  args JSONB NOT NULL,
  result JSONB,
  state_diff JSONB,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  injected BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT
);

CREATE TABLE IF NOT EXISTS ground_truth (
  sandbox_id TEXT PRIMARY KEY REFERENCES sandboxes(id),
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS run_scorecards (
  run_id TEXT PRIMARY KEY REFERENCES runs(id),
  overall NUMERIC NOT NULL,
  payload JSONB NOT NULL
);
`;

export async function migrate(): Promise<void> {
  if (useMemoryStore()) {
    console.log("[migrate] USE_MEMORY_STORE=true — skipping Postgres migrations");
    return;
  }
  const pool = getPool();
  await pool.query(PLATFORM_SQL);
  console.log("[migrate] platform tables ready");
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
