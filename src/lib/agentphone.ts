import crypto from "node:crypto";
import { env } from "./env";

const BASE = "https://api.agentphone.ai/v1";

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${env.AGENTPHONE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function sendIMessage(
  _conversationId: string,
  text: string,
  toNumber?: string,
): Promise<void> {
  if (!env.AGENTPHONE_API_KEY) {
    console.warn("[agentphone] no api key, skipping send", { toNumber, text });
    return;
  }
  if (!env.AGENTPHONE_AGENT_ID) {
    console.warn("[agentphone] no agent id, skipping send");
    return;
  }
  if (!toNumber) {
    console.warn("[agentphone] no toNumber resolved; cannot send");
    return;
  }
  const res = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      agent_id: env.AGENTPHONE_AGENT_ID,
      to_number: toNumber,
      body: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[agentphone] sendIMessage failed", res.status, body);
  }
}

export interface CreateCallParams {
  toNumber: string;
  initialGreeting: string;
  /**
   * For hosted mode, set this. For webhook mode (our default), leave undefined —
   * Agentphone routes turns to the agent's configured voice webhook URL.
   */
  systemPrompt?: string;
  variables?: Record<string, string>;
}

export interface CreateCallResult {
  id: string;
  status: string;
  startedAt?: string;
}

export async function createOutboundCall(p: CreateCallParams): Promise<CreateCallResult | null> {
  if (!env.AGENTPHONE_API_KEY || !env.AGENTPHONE_AGENT_ID) {
    console.warn("[agentphone] missing api key or agent id, skipping call");
    return null;
  }
  const body: Record<string, unknown> = {
    agentId: env.AGENTPHONE_AGENT_ID,
    toNumber: p.toNumber,
    initialGreeting: p.initialGreeting,
  };
  if (p.systemPrompt) body.systemPrompt = p.systemPrompt;
  if (p.variables) body.variables = p.variables;
  const res = await fetch(`${BASE}/calls`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[agentphone] createOutboundCall failed", res.status, await res.text());
    return null;
  }
  return (await res.json()) as CreateCallResult;
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
): boolean {
  if (!env.AGENTPHONE_WEBHOOK_SECRET) return true; // skip if not configured
  if (!signatureHeader || !timestampHeader) return false;
  const expected = crypto
    .createHmac("sha256", env.AGENTPHONE_WEBHOOK_SECRET)
    .update(`${timestampHeader}.${rawBody}`)
    .digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

// ---- Webhook payload shapes ----
export interface InboundIMessage {
  event: "agent.message";
  channel: "imessage" | "sms";
  agentId: string;
  data: {
    conversationId: string;
    numberId?: string;
    message: string;
    mediaUrl?: string | null;
    from: string;
    to: string;
    direction: "inbound" | "outbound";
    receivedAt: string;
  };
  conversationState?: Record<string, unknown>;
}

export interface VoiceWebhookTurn {
  event?: string;
  callId: string;
  agentId?: string;
  transcript?: string;
  speech?: string;
  metadata?: Record<string, string>;
  data?: { transcript?: string; speech?: string };
}

export interface CallCompletedEvent {
  event: "agent.call.completed" | "agent.call.failed" | "agent.call.no_answer";
  callId: string;
  outcome?: string;
  transcript?: string;
  metadata?: Record<string, string>;
  data?: { transcript?: string; outcome?: string };
}
