import { AgentMailClient } from "agentmail";
import { env } from "./env";

let _client: AgentMailClient | null = null;
function client(): AgentMailClient {
  if (!_client) _client = new AgentMailClient({ apiKey: env.AGENTMAIL_API_KEY });
  return _client;
}

let _inboxIdCache: string | null = env.AGENTMAIL_INBOX_ID || null;

export async function getOrCreateInbox(): Promise<string | null> {
  if (!env.AGENTMAIL_API_KEY) return null;
  if (_inboxIdCache) return _inboxIdCache;
  try {
    const inbox = await client().inboxes.create({ clientId: "haggle-concierge-v1" } as unknown as undefined);
    // The SDK types this loosely; the result has inboxId.
    const id = (inbox as unknown as { inboxId?: string; id?: string }).inboxId
      ?? (inbox as unknown as { inboxId?: string; id?: string }).id
      ?? null;
    _inboxIdCache = id;
    return id;
  } catch (e) {
    console.error("[agentmail] inbox create failed", e);
    return null;
  }
}

export interface ColdEmailParams {
  to: string;
  businessName: string;
  service: string;
  location: string;
  budgetCents: number;
  timeframe: string;
  fromName?: string;
  replyHandle?: string;
}

export async function sendColdEmail(p: ColdEmailParams): Promise<boolean> {
  const inboxId = await getOrCreateInbox();
  if (!inboxId) return false;

  const budget = (p.budgetCents / 100).toFixed(0);
  const subject = `Quick quote request: ${p.service} in ${p.location}`;
  const text =
    `Hi ${p.businessName} team,\n\n` +
    `I'm looking to get ${p.service} ${p.timeframe ? `(${p.timeframe})` : ""} in ${p.location}, budget around $${budget}.\n\n` +
    `Could you reply with availability and a quote? If you can hit the budget I'll book today.\n\n` +
    `Thanks,\n${p.fromName ?? "Haggle Concierge"}`;
  const html = `<p>Hi ${p.businessName} team,</p>` +
    `<p>I'm looking to get <strong>${p.service}</strong>${p.timeframe ? ` (${p.timeframe})` : ""} in ${p.location}, budget around <strong>$${budget}</strong>.</p>` +
    `<p>Could you reply with availability and a quote? If you can hit the budget I'll book today.</p>` +
    `<p>Thanks,<br/>${p.fromName ?? "Haggle Concierge"}</p>`;

  try {
    await client().inboxes.messages.send(inboxId, {
      to: [p.to],
      subject,
      text,
      html,
    } as unknown as Record<string, never>);
    return true;
  } catch (e) {
    console.error("[agentmail] send failed", e);
    return false;
  }
}
