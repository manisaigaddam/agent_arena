import { nowIso } from "@agentarena/shared";

/**
 * Placeholder worker. Hosted runs currently execute inside the API process.
 * On Zerops this service will consume NATS jobs and drive OpenAI/Bedrock agents.
 */
console.log(
  `[runner] idle stub online at ${nowIso()} — hosted agent loop lives in @agentarena/api for MVP`,
);

setInterval(() => {
  // keep process alive for Zerops service health
}, 60_000);
