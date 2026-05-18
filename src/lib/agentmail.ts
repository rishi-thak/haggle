import { env } from "./env";

const BASE = "https://api.agentmail.to/v0";

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${env.AGENTMAIL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

let _inboxIdCache: string | null = env.AGENTMAIL_INBOX_ID || null;

export async function getOrCreateInbox(): Promise<string | null> {
  if (!env.AGENTMAIL_API_KEY) return null;
  if (_inboxIdCache) return _inboxIdCache;
  try {
    const res = await fetch(`${BASE}/inboxes`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      console.error("[agentmail] inbox create failed", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { inboxId?: string; id?: string };
    const id = data.inboxId ?? data.id ?? null;
    _inboxIdCache = id;
    return id;
  } catch (e) {
    console.error("[agentmail] inbox create failed", e);
    return null;
  }
}

async function sendMessage(
  inboxId: string,
  params: { to: string[]; subject: string; text: string; html?: string },
): Promise<{ messageId?: string; threadId?: string }> {
  const res = await fetch(`${BASE}/inboxes/${inboxId}/messages/send`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`agentmail send failed: ${res.status} ${body}`);
  }
  return (await res.json()) as { messageId?: string; threadId?: string; message_id?: string; thread_id?: string };
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

export interface SentEmailResult {
  ok: boolean;
  inboxId: string | null;
  messageId?: string;
  threadId?: string;
  subject?: string;
  error?: string;
}

export interface FollowUpEmailParams {
  to: string;
  businessName: string;
  service: string;
  location: string;
  timeframe: string;
  outcome: "agreed" | "declined" | "no_answer" | "callback" | "ambiguous";
  quotedPriceCents: number | null;
  callSummary: string;
  fromName?: string;
}

export async function sendFollowUpEmail(p: FollowUpEmailParams): Promise<SentEmailResult> {
  const inboxId = await getOrCreateInbox();
  if (!inboxId) {
    return { ok: false, inboxId: null, error: "missing inbox id" };
  }

  const price = p.quotedPriceCents ? `$${(p.quotedPriceCents / 100).toFixed(0)}` : null;
  const from = p.fromName ?? "Haggle Concierge";

  let subject: string;
  let text: string;

  if (p.outcome === "agreed") {
    subject = `Booking confirmation: ${p.service} with ${p.businessName}`;
    text =
      `Hi ${p.businessName} team,\n\n` +
      `Thanks for the call! Just recapping what we discussed:\n\n` +
      `• Service: ${p.service}\n` +
      `• Location: ${p.location}\n` +
      `• Timeframe: ${p.timeframe}\n` +
      (price ? `• Agreed price: ${price}\n` : "") +
      `\nWe'd like to confirm the booking. Please reply to let us know next steps (address, time, anything we should bring/prepare).\n\n` +
      `Thanks,\n${from}`;
  } else if (p.outcome === "callback" || p.outcome === "ambiguous") {
    subject = `Following up: ${p.service} in ${p.location}`;
    text =
      `Hi ${p.businessName} team,\n\n` +
      `Thanks for taking the time to chat. Here's a quick recap:\n\n` +
      `• Service needed: ${p.service}\n` +
      `• Location: ${p.location}\n` +
      `• Timeframe: ${p.timeframe}\n` +
      (price ? `• Price discussed: ${price}\n` : "") +
      `\nIt sounded like you needed a bit more time or info to confirm. No rush — just reply here when you're ready to lock it in, or let us know if you have questions.\n\n` +
      `Thanks,\n${from}`;
  } else if (p.outcome === "declined") {
    subject = `Thanks for your time — ${p.service}`;
    text =
      `Hi ${p.businessName} team,\n\n` +
      `Thanks for taking our call about ${p.service} in ${p.location}. ` +
      `We understand it didn't work out this time` +
      (price ? ` at ${price}` : "") +
      `.\n\n` +
      `If anything changes or you'd like to reconsider, just reply to this email and we'll pick it back up.\n\n` +
      `All the best,\n${from}`;
  } else {
    // no_answer
    subject = `We tried calling — ${p.service} in ${p.location}`;
    text =
      `Hi ${p.businessName} team,\n\n` +
      `We tried reaching you by phone about ${p.service} in ${p.location} (${p.timeframe}) but couldn't connect.\n\n` +
      `Would you be available and able to provide a quote? Our budget is flexible for the right fit.\n\n` +
      `Just reply here and we'll sort out the details.\n\n` +
      `Thanks,\n${from}`;
  }

  const html = text
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br/>" : `<p>${line}</p>`))
    .join("");

  try {
    const response = await sendMessage(inboxId, { to: [p.to], subject, text, html });
    return {
      ok: true,
      inboxId,
      messageId: response.messageId ?? (response as Record<string, string>).message_id,
      threadId: response.threadId ?? (response as Record<string, string>).thread_id,
      subject,
    };
  } catch (e) {
    console.error("[agentmail] follow-up send failed", e);
    return {
      ok: false,
      inboxId,
      subject,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function sendColdEmail(p: ColdEmailParams): Promise<SentEmailResult> {
  const inboxId = await getOrCreateInbox();
  if (!inboxId) {
    return { ok: false, inboxId: null, error: "missing inbox id" };
  }

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
    const response = await sendMessage(inboxId, { to: [p.to], subject, text, html });
    return {
      ok: true,
      inboxId,
      messageId: response.messageId ?? (response as Record<string, string>).message_id,
      threadId: response.threadId ?? (response as Record<string, string>).thread_id,
      subject,
    };
  } catch (e) {
    console.error("[agentmail] send failed", e);
    return {
      ok: false,
      inboxId,
      subject,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
