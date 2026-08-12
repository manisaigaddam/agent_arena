import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Run,
  RunEvent,
  Sandbox,
  Scenario,
  Scorecard,
  SandboxWorld,
} from "./types.js";

const DATA_DIR =
  process.env.AGENTARENA_DATA_DIR ?? join(process.cwd(), ".data");

function ensureDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

function pathFor(name: string) {
  return join(DATA_DIR, `${name}.json`);
}

function readJson<T>(name: string, fallback: T): T {
  ensureDir();
  const p = pathFor(name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown) {
  ensureDir();
  writeFileSync(pathFor(name), JSON.stringify(value), "utf8");
}

function mapGet<T>(file: string, id: string): T | undefined {
  return readJson<Record<string, T>>(file, {})[id];
}

function mapSet<T>(file: string, id: string, value: T) {
  const all = readJson<Record<string, T>>(file, {});
  all[id] = value;
  writeJson(file, all);
}

function mapDelete(file: string, id: string) {
  const all = readJson<Record<string, unknown>>(file, {});
  delete all[id];
  writeJson(file, all);
}

export const store = {
  getScenario: (id: string) => mapGet<Scenario>("scenarios", id),
  setScenario: (s: Scenario) => mapSet("scenarios", s.id, s),

  getSandbox: (id: string) => mapGet<Sandbox>("sandboxes", id),
  setSandbox: (s: Sandbox) => mapSet("sandboxes", s.id, s),
  listSandboxes: () =>
    Object.values(readJson<Record<string, Sandbox>>("sandboxes", {})),

  getWorld: (sandboxId: string) => mapGet<SandboxWorld>("worlds", sandboxId),
  setWorld: (sandboxId: string, world: SandboxWorld) =>
    mapSet("worlds", sandboxId, world),
  deleteWorld: (sandboxId: string) => mapDelete("worlds", sandboxId),

  getRun: (id: string) => mapGet<Run>("runs", id),
  setRun: (run: Run) => mapSet("runs", run.id, run),

  getEvents: (runId: string) =>
    readJson<Record<string, RunEvent[]>>("events", {})[runId] ?? [],
  setEvents: (runId: string, events: RunEvent[]) => {
    const all = readJson<Record<string, RunEvent[]>>("events", {});
    all[runId] = events;
    writeJson("events", all);
  },

  getScorecard: (runId: string) => mapGet<Scorecard>("scorecards", runId),
  setScorecard: (scorecard: Scorecard) =>
    mapSet("scorecards", scorecard.runId, scorecard),
};

export function dataDir(): string {
  ensureDir();
  return DATA_DIR;
}
