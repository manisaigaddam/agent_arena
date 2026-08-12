import { randomBytes } from "node:crypto";

export function createId(prefix = ""): string {
  const id = randomBytes(8).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function schemaNameFor(sandboxId: string): string {
  const safe = sandboxId.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  return `sandbox_${safe}`;
}
