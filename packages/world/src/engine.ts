import {
  createId,
  nowIso,
  schemaNameFor,
  store,
  type AgentConfig,
  type ConnectMode,
  type Run,
  type Sandbox,
  type Scenario,
} from "@agentarena/shared";
import { refundInvestigationScenario } from "./scenarios.js";
import { seedCustomerSupportWorld } from "./seed.js";

export interface CreateSandboxInput {
  difficulty?: "easy" | "medium" | "hard";
  maliciousData?: boolean;
  apiFailures?: boolean;
  customerCount?: number;
  seed?: number;
  gatewayBaseUrl?: string;
}

export function createSandbox(input: CreateSandboxInput = {}): {
  scenario: Scenario;
  sandbox: Sandbox;
} {
  const scenario = refundInvestigationScenario({
    difficulty: input.difficulty,
    maliciousData: input.maliciousData,
    apiFailures: input.apiFailures,
    customerCount: input.customerCount,
    seed: input.seed,
  });
  scenario.id = createId("scenario");

  const sandboxId = createId("sbx");
  const schemaName = schemaNameFor(sandboxId);
  const world = seedCustomerSupportWorld(scenario);

  const sandbox: Sandbox = {
    id: sandboxId,
    scenarioId: scenario.id,
    schemaName,
    seed: scenario.worldSpec.seed,
    status: "ready",
    ttlAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    createdAt: nowIso(),
    mcpUrl: `${(input.gatewayBaseUrl ?? process.env.GATEWAY_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "")}/mcp/${sandboxId}/sse`,
  };

  store.setScenario(scenario);
  store.setSandbox(sandbox);
  store.setWorld(sandbox.id, world);

  return { scenario, sandbox };
}

export function createRun(
  sandboxId: string,
  agentConfig: AgentConfig,
  connectMode: ConnectMode = "hosted",
): Run {
  const sandbox = store.getSandbox(sandboxId);
  if (!sandbox) throw new Error("sandbox_not_found");

  const run: Run = {
    id: createId("run"),
    sandboxId,
    agentConfig,
    connectMode,
    status: "pending",
  };
  store.setRun(run);
  store.setEvents(run.id, []);
  return run;
}

export function resetSandbox(sandboxId: string): void {
  const sandbox = store.getSandbox(sandboxId);
  if (!sandbox) throw new Error("sandbox_not_found");
  store.deleteWorld(sandboxId);
  sandbox.status = "reset";
  store.setSandbox(sandbox);
}

export function getSandboxBundle(sandboxId: string) {
  const sandbox = store.getSandbox(sandboxId);
  if (!sandbox) return null;
  const scenario = store.getScenario(sandbox.scenarioId);
  const world = store.getWorld(sandboxId);
  return { sandbox, scenario, world };
}
