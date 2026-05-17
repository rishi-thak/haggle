import { sendIMessage, createOutboundCall } from "./agentphone";
import { sendColdEmail } from "./agentmail";
import { scrapeLeads } from "./browseruse";
import { parseIntent } from "./intent";
import { payUsdc } from "./sponge";
import { addMemory, recallProviderHistory, searchMemories } from "./supermemory";
import { summarizeCall } from "./negotiator";
import {
  createJob,
  findActiveJobByConversation,
  getJob,
  getLead,
  getOrCreateUser,
  getUserByConversation,
  insertLead,
  listLeads,
  logMessage,
  recordCallEnd,
  recordCallStart,
  updateJob,
  updateLead,
} from "./repo";
import type { Job, Lead, NegotiationContext } from "./types";
import { env } from "./env";

const MAX_LEADS = 8;
const MAX_PARALLEL_CALLS = 4;

async function notify(job: Job, text: string): Promise<void> {
  const user = await getUserByConversation(job.conversation_id);
  await sendIMessage(job.conversation_id, text, user?.phone);
  await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: text });
}

function isConfirmation(text: string): boolean {
  return /\b(done|pay|pay them|book it|go ahead|yes|confirm|do it)\b/i.test(text);
}

function rankLead(l: {
  rating?: number;
  source_url?: string;
  phone?: string;
  email?: string;
}): number {
  let s = (l.rating ?? 3.0) * 2;
  if (l.phone) s += 1.5;
  if (l.email) s += 0.5;
  if (l.source_url) s += 0.3;
  return s;
}

export async function handleInboundIMessage(args: {
  conversationId: string;
  fromPhone: string;
  text: string;
}): Promise<void> {
  const { conversationId, fromPhone, text } = args;
  const existing = await findActiveJobByConversation(conversationId);

  if (existing && existing.status === "awaiting_confirm" && isConfirmation(text)) {
    await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
    await runPayment(existing.id);
    return;
  }

  if (existing && !["complete", "failed"].includes(existing.status)) {
    await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
    await notify(
      existing,
      `Still working on this — current status: ${existing.status}. I'll text again the moment something changes.`,
    );
    return;
  }

  const user = await getOrCreateUser(fromPhone);
  const job = await createJob({ userId: user.id, conversationId, intentRaw: text });
  await logMessage({ jobId: job.id, direction: "inbound", channel: "imessage", body: text });
  // Fire-and-forget orchestration so we return 200 to the webhook quickly.
  runFullJob(job.id, user.container_tag).catch((e) => {
    console.error("[orchestrator] runFullJob crashed", e);
  });
}

async function runFullJob(jobId: number, containerTag: string): Promise<void> {
  const job0 = await getJob(jobId);
  if (!job0) return;

  await notify(job0, "Got it — let me look around for options. One sec.");

  // 1. Parse intent
  const intent = await parseIntent(job0.intent_raw);
  const budgetCents = intent.budgetCents ?? 10000;
  await updateJob(jobId, {
    service: intent.service,
    location: intent.location,
    budget_cents: budgetCents,
    timeframe: intent.timeframe,
    status: "searching",
  });

  // Persist the request to memory
  await addMemory(
    containerTag,
    `Requested ${intent.service} in ${intent.location} with budget $${(budgetCents / 100).toFixed(0)}, timeframe ${intent.timeframe}.`,
    { type: "request", jobId },
  );

  const job = (await getJob(jobId))!;
  await notify(
    job,
    `Searching for ${intent.service} in ${intent.location}, budget $${(budgetCents / 100).toFixed(0)}, ${intent.timeframe}.`,
  );

  // 2. Lead gen
  const scraped = await scrapeLeads(intent.service, intent.location, MAX_LEADS);
  if (!scraped.length) {
    await updateJob(jobId, { status: "failed" });
    await notify(
      job,
      "Couldn't find any local providers via search. (Check BROWSER_USE_API_KEY?) Try again with a different phrasing.",
    );
    return;
  }

  // 3. Pull user prefs from memory (warms supermemory; used per-call in voice webhook).
  await searchMemories(containerTag, `preferences for ${intent.service}`, 5);

  // 4. Persist + rank
  const leads: Lead[] = [];
  for (const s of scraped) {
    const lead = await insertLead({
      job_id: jobId,
      name: s.name,
      phone: s.phone ?? null,
      email: s.email ?? null,
      address: s.address ?? null,
      rating: s.rating ?? null,
      source_url: s.source_url ?? null,
      rank_score: rankLead(s),
      status: "pending",
      quoted_price_cents: null,
      notes: null,
    });
    leads.push(lead);
  }
  leads.sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));

  await updateJob(jobId, { status: "ranked" });
  await notify(
    job,
    `Found ${leads.length} options. Top picks: ${leads
      .slice(0, 3)
      .map((l) => `${l.name}${l.rating ? ` (${l.rating}★)` : ""}`)
      .join(", ")}. Calling now.`,
  );

  // 5. Parallel outbound calls (capped)
  await updateJob(jobId, { status: "calling" });
  const calling = leads.filter((l) => l.phone).slice(0, MAX_PARALLEL_CALLS);
  const emailOnly = leads.filter((l) => !l.phone && l.email);

  await Promise.all(
    calling.map(async (lead) => {
      // Webhook voice mode: Agentphone routes per-turn webhooks to
      // /api/webhooks/agentphone/voice where we drive the negotiation with Gemini.
      const greeting = `Hi, this is Haggle calling about ${intent.service}.`;
      const call = await createOutboundCall({
        toNumber: lead.phone!,
        initialGreeting: greeting,
        variables: { jobId: String(jobId), leadId: String(lead.id) },
      });
      if (call) {
        await recordCallStart({ jobId, leadId: lead.id, agentphoneCallId: call.id });
        await updateLead(lead.id, { status: "calling" });
      } else {
        await updateLead(lead.id, { status: "no_answer" });
      }
    }),
  );

  // 6. Fire fallback emails to phone-less leads immediately
  if (emailOnly.length) {
    await updateJob(jobId, { status: "email_fallback" });
    for (const lead of emailOnly) {
      const ok = await sendColdEmail({
        to: lead.email!,
        businessName: lead.name,
        service: intent.service,
        location: intent.location,
        budgetCents,
        timeframe: intent.timeframe,
        fromName: "Haggle Concierge",
      });
      await updateLead(lead.id, { status: ok ? "emailed" : "no_answer" });
    }
    await notify(job, `Emailed ${emailOnly.length} provider(s) without a listed phone.`);
  }

  // Status update — calls are now in flight. Resolution happens in handleCallCompleted.
  await notify(
    job,
    `Dialed ${calling.length} provider(s). I'll text you back as they pick up and quote.`,
  );

  // If we sent no calls AND no emails, fail out.
  if (!calling.length && !emailOnly.length) {
    await updateJob(jobId, { status: "failed" });
    await notify(job, "No leads had a phone or email to reach. Try a different city?");
  }
}

export async function handleCallCompleted(args: {
  agentphoneCallId: string;
  transcript: string;
  outcome?: string;
}): Promise<void> {
  const ended = await recordCallEnd({
    agentphoneCallId: args.agentphoneCallId,
    outcome: args.outcome ?? "completed",
    transcript: args.transcript,
  });
  if (!ended) return;

  const lead = await getLead(ended.leadId);
  const job = await getJob(ended.jobId);
  if (!lead || !job) return;

  const user = await getUserByConversation(job.conversation_id);
  const containerTag = user?.container_tag ?? `user_unknown`;

  const past = await recallProviderHistory(containerTag, job.service ?? "", lead.name);
  const ctx: NegotiationContext = {
    jobId: job.id,
    leadId: lead.id,
    service: job.service ?? "service",
    location: job.location ?? "",
    budgetCents: job.budget_cents ?? 10000,
    timeframe: job.timeframe ?? "ASAP",
    userPreferences: [],
    pastProviderNotes: past.summary,
    businessName: lead.name,
  };

  const result = await summarizeCall(ctx, args.transcript);
  await updateLead(lead.id, {
    status: result.outcome === "agreed" ? "agreed" : result.outcome === "no_answer" ? "no_answer" : "declined",
    quoted_price_cents: result.quotedPriceCents,
    notes: result.summary,
  });
  await addMemory(
    containerTag,
    `Called ${lead.name} for ${job.service}: ${result.summary}`,
    { type: "call_result", leadId: lead.id, jobId: job.id, outcome: result.outcome },
  );

  // If no answer, send fallback email if we have one
  if (result.outcome === "no_answer" && lead.email) {
    const ok = await sendColdEmail({
      to: lead.email,
      businessName: lead.name,
      service: job.service ?? "",
      location: job.location ?? "",
      budgetCents: ctx.budgetCents,
      timeframe: ctx.timeframe,
      fromName: "Haggle Concierge",
    });
    if (ok) await updateLead(lead.id, { status: "emailed" });
  }

  // Check if all leads have settled
  const leads = await listLeads(job.id);
  const anyOpen = leads.some((l) => l.status === "calling" || l.status === "negotiating" || l.status === "pending");
  const winner = leads
    .filter((l) => l.status === "agreed" && l.quoted_price_cents !== null)
    .sort((a, b) => (a.quoted_price_cents ?? 0) - (b.quoted_price_cents ?? 0))[0];

  if (winner) {
    await updateJob(job.id, { status: "awaiting_confirm", winning_lead_id: winner.id });
    const winText =
      `✅ Best offer: ${winner.name} — $${((winner.quoted_price_cents ?? 0) / 100).toFixed(0)} for ${job.service}.\n` +
      `Reply "pay them" to book and send payment, or "no" to keep waiting.`;
    await sendIMessage(job.conversation_id, winText, user?.phone);
    await logMessage({
      jobId: job.id,
      direction: "outbound",
      channel: "imessage",
      body: winText,
    });
    return;
  }

  if (!anyOpen) {
    await updateJob(job.id, { status: "failed" });
    await sendIMessage(
      job.conversation_id,
      `No one agreed at $${((job.budget_cents ?? 0) / 100).toFixed(0)}. Want to raise budget or try a different city?`,
      user?.phone,
    );
  }
}

async function runPayment(jobId: number): Promise<void> {
  const job = await getJob(jobId);
  if (!job || !job.winning_lead_id) return;
  const lead = await getLead(job.winning_lead_id);
  if (!lead) return;
  const user = await getUserByConversation(job.conversation_id);

  await updateJob(jobId, { status: "paying" });
  await sendIMessage(job.conversation_id, `Paying ${lead.name} now…`, user?.phone);

  const amount = (lead.quoted_price_cents ?? 0) / 100;
  const result = await payUsdc(amount, env.SPONGE_DEMO_PAYEE_ADDRESS);
  if (result.ok) {
    await updateJob(jobId, { status: "complete" });
    const url = result.explorerUrl ? `\nTx: ${result.explorerUrl}` : "";
    await sendIMessage(
      job.conversation_id,
      `Done — sent $${amount.toFixed(2)} USDC to demo payee for ${lead.name}.${url}`,
      user?.phone,
    );
    if (user) {
      await addMemory(
        user.container_tag,
        `Paid ${lead.name} $${amount.toFixed(0)} for ${job.service}. Provider used successfully.`,
        { type: "payment", leadId: lead.id, jobId: job.id, txHash: result.txHash },
      );
    }
  } else {
    await updateJob(jobId, { status: "failed" });
    await sendIMessage(
      job.conversation_id,
      `Payment failed: ${result.error ?? "unknown error"}.`,
      user?.phone,
    );
  }
}
