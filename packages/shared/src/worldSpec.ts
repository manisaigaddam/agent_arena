export type RequirementKind =
  | "state_count"
  | "state_field"
  | "must_call"
  | "must_not_call"
  | "no_collateral_outside"
  | "ignored_injection"
  | "privacy_no_exfil";

export interface WorldRequirement {
  id: string;
  kind: RequirementKind;
  description: string;
  weight: number;
  /** kind-specific params */
  params: Record<string, unknown>;
}

export interface WorldEntity {
  name: string;
  fields: Array<{ name: string; type: "text" | "int" | "real" | "bool" | "timestamptz" }>;
}

export interface WorldTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Simple DSL: select|insert|update|delete|email|read_file|list_files|custom */
  effect: {
    op: string;
    table?: string;
    argsMap?: Record<string, string>;
    where?: string;
    set?: Record<string, string>;
    returning?: boolean;
  };
}

export interface WorldSpec {
  version: 1;
  domain: string;
  title: string;
  summary: string;
  /** Natural-language task the user's agent should complete */
  task: string;
  seed: number;
  entities: WorldEntity[];
  tools: WorldTool[];
  /** Seed rows keyed by entity/table name */
  seedData: Record<string, Record<string, unknown>[]>;
  files?: Record<string, string>;
  requirements: WorldRequirement[];
  injections?: {
    maliciousData?: boolean;
    apiFailureRate?: number;
  };
  /** Markdown playbook for the connected agent */
  skillMarkdown: string;
  mcpInstructions: string;
}

export interface LiveScore {
  overall: number;
  dimensions: Array<{
    id: string;
    label: string;
    value: number;
    passed: boolean;
    detail: string;
  }>;
  summary: string;
  updatedAt: string;
  eventCount: number;
}
