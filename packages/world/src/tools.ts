import {
  createId,
  nowIso,
  store,
  type RunEvent,
  type Scenario,
  type SandboxWorld,
} from "@agentarena/shared";

export interface ToolCallResult {
  ok: boolean;
  result: unknown;
  stateDiff?: Record<string, unknown>;
  injected: boolean;
  error?: string;
  latencyMs: number;
}

function maybeFail(scenario: Scenario): boolean {
  if (!scenario.injections.apiFailures) return false;
  const rate = scenario.injections.failureRate ?? 0.08;
  return Math.random() < rate;
}

export function executeTool(
  world: SandboxWorld,
  scenario: Scenario,
  tool: string,
  args: Record<string, unknown>,
): ToolCallResult {
  const started = Date.now();

  // Failures only on read-ish tools so demos stay recoverable
  if (
    ["search_customer", "get_orders", "get_payment", "list_open_tickets"].includes(
      tool,
    ) &&
    maybeFail(scenario)
  ) {
    return {
      ok: false,
      result: null,
      injected: false,
      error: "Simulated upstream 503 from sandbox API",
      latencyMs: Date.now() - started,
    };
  }

  try {
    switch (tool) {
      case "search_customer": {
        const query = String(args.query ?? "").toLowerCase();
        const hits = world.customers
          .filter(
            (c) =>
              c.name.toLowerCase().includes(query) ||
              c.email.toLowerCase().includes(query),
          )
          .slice(0, 20);
        return {
          ok: true,
          result: hits,
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      case "get_orders": {
        const customerId = String(args.customer_id ?? "");
        return {
          ok: true,
          result: world.orders.filter((o) => o.customerId === customerId),
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      case "get_payment": {
        const payment = world.payments.find((p) => p.id === args.payment_id);
        if (!payment) {
          return {
            ok: false,
            result: null,
            error: "payment_not_found",
            injected: false,
            latencyMs: Date.now() - started,
          };
        }
        return {
          ok: true,
          result: payment,
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      case "list_open_tickets": {
        const customerId = args.customer_id
          ? String(args.customer_id)
          : undefined;
        const tickets = world.tickets.filter(
          (t) =>
            t.status === "open" &&
            (!customerId || t.customerId === customerId),
        );
        return {
          ok: true,
          result: tickets,
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      case "get_ticket": {
        const ticket = world.tickets.find((t) => t.id === args.ticket_id);
        if (!ticket) {
          return {
            ok: false,
            result: null,
            error: "ticket_not_found",
            injected: false,
            latencyMs: Date.now() - started,
          };
        }
        const injected =
          ticket.id === world.groundTruth.injectionTicketId ||
          Boolean(
            world.groundTruth.injectionPayload &&
              ticket.body.includes(world.groundTruth.injectionPayload),
          );
        return {
          ok: true,
          result: ticket,
          injected,
          latencyMs: Date.now() - started,
        };
      }
      case "refund_payment": {
        const payment = world.payments.find((p) => p.id === args.payment_id);
        if (!payment) {
          return {
            ok: false,
            result: null,
            error: "payment_not_found",
            injected: false,
            latencyMs: Date.now() - started,
          };
        }
        const before = payment.status;
        payment.status = "refunded";
        return {
          ok: true,
          result: payment,
          stateDiff: {
            paymentId: payment.id,
            status: { from: before, to: "refunded" },
          },
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      case "update_ticket": {
        const ticket = world.tickets.find((t) => t.id === args.ticket_id);
        if (!ticket) {
          return {
            ok: false,
            result: null,
            error: "ticket_not_found",
            injected: false,
            latencyMs: Date.now() - started,
          };
        }
        const before = ticket.status;
        ticket.status = args.status as typeof ticket.status;
        return {
          ok: true,
          result: ticket,
          stateDiff: {
            ticketId: ticket.id,
            status: { from: before, to: ticket.status },
          },
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      case "send_email": {
        const email = {
          id: createId("mail"),
          to: String(args.to ?? ""),
          subject: String(args.subject ?? ""),
          body: String(args.body ?? ""),
          createdAt: nowIso(),
        };
        world.emails.push(email);
        return {
          ok: true,
          result: email,
          stateDiff: { emailId: email.id },
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      case "read_file": {
        const path = String(args.path ?? "");
        const content = world.files[path];
        if (content === undefined) {
          return {
            ok: false,
            result: null,
            error: "file_not_found",
            injected: false,
            latencyMs: Date.now() - started,
          };
        }
        const injected = Boolean(
          world.groundTruth.injectionPayload &&
            content.includes(world.groundTruth.injectionPayload),
        );
        return {
          ok: true,
          result: { path, content },
          injected,
          latencyMs: Date.now() - started,
        };
      }
      case "list_files": {
        const prefix = String(args.prefix ?? "");
        const paths = Object.keys(world.files).filter((p) =>
          p.startsWith(prefix),
        );
        return {
          ok: true,
          result: paths,
          injected: false,
          latencyMs: Date.now() - started,
        };
      }
      default:
        return {
          ok: false,
          result: null,
          error: `unknown_tool:${tool}`,
          injected: false,
          latencyMs: Date.now() - started,
        };
    }
  } catch (err) {
    return {
      ok: false,
      result: null,
      error: err instanceof Error ? err.message : "tool_error",
      injected: false,
      latencyMs: Date.now() - started,
    };
  }
}

export function appendEvent(
  runId: string,
  tool: string,
  args: Record<string, unknown>,
  call: ToolCallResult,
): RunEvent {
  const existing = store.getEvents(runId);
  const event: RunEvent = {
    id: createId("evt"),
    runId,
    seq: existing.length + 1,
    ts: nowIso(),
    tool,
    args,
    result: call.result,
    stateDiff: call.stateDiff,
    latencyMs: call.latencyMs,
    injected: call.injected,
    error: call.error,
  };
  existing.push(event);
  store.setEvents(runId, existing);
  return event;
}

/** Persist world mutations after tool calls. */
export function persistWorld(sandboxId: string, world: SandboxWorld) {
  store.setWorld(sandboxId, world);
}
