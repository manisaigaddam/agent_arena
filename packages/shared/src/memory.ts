import type {
  GroundTruth,
  OutboxEmail,
  Run,
  RunEvent,
  Sandbox,
  Scenario,
  Scorecard,
  Customer,
  Order,
  Payment,
  Ticket,
  SandboxWorld,
} from "./types.js";

/** Legacy in-process maps (prefer `store` / fileStore for cross-process). */
class MemoryStore {
  scenarios = new Map<string, Scenario>();
  sandboxes = new Map<string, Sandbox>();
  runs = new Map<string, Run>();
  events = new Map<string, RunEvent[]>();
  worlds = new Map<string, SandboxWorld>();
  scorecards = new Map<string, Scorecard>();
}

export const memoryStore = new MemoryStore();
export type { SandboxWorld, Customer, Order, Payment, Ticket, OutboxEmail, GroundTruth };
