import { sendIMessage, createOutboundCall } from "./agentphone";
import { sendColdEmail } from "./agentmail";
import { enrichLead, scrapeLeads } from "./browseruse";
import { parseIntent } from "./intent";
import { payUsdc } from "./sponge";
import { addMemory, recallProviderHistory, searchMemories } from "./supermemory";
import { getNegotiationStatusSnapshot, summarizeCall } from "./negotiator";
import {
  createJob,
  findEmailLeadMatch,
  findActiveJobByConversation,
  getJob,
  getLead,
  getOrCreateUser,
  getUserByConversation,
  insertLead,
  listLeads,
  logMessage,
  markInboundEmailReceived,
  markJobAwaitingConfirmIfOpen,
  markJobFailedIfUnresolved,
  recordCallEnd,
  recordCallStart,
  upsertEmailThread,
  updateJob,
  updateLead,
} from "./repo";
import type { Job, Lead, NegotiationContext, NegotiationOutcome } from "./types";
import { env } from "./env";

const MAX_LEADS = 8;
const MAX_PARALLEL_CALLS = 4;
const ENRICH_TOP_N = 3;
const TERMINAL_JOB_STATUSES = new Set<Job["status"]>(["complete", "failed"]);
const RESOLUTION_LOCKED_JOB_STATUSES = new Set<Job["status"]>(["awaiting_confirm", "paying", "complete", "failed"]);
const ACTIVE_LEAD_STATUSES = new Set<Lead["status"]>(["pending", "calling", "negotiating", "emailed"]);
const FOLLOW_UP_LEAD_STATUSES = new Set<Lead["status"]>(["callback", "ambiguous"]);

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

function isTerminalJobStatus(status: Job["status"]): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

function isResolutionLockedJobStatus(status: Job["status"]): boolean {
  return RESOLUTION_LOCKED_JOB_STATUSES.has(status);
}

async function sendFallbackEmailForLead(args: {
  job: Job;
  lead: Lead;
  budgetCents: number;
  timeframe: string;
}): Promise<boolean> {
  if (!args.lead.email) return false;
  const sent = await sendColdEmail({
    to: args.lead.email,
    businessName: args.lead.name,
    service: args.job.service ?? "",
    location: args.job.location ?? "",
    budgetCents: args.budgetCents,
    timeframe: args.timeframe,
    fromName: "Haggle Concierge",
  });
  if (!sent.ok) return false;
  await upsertEmailThread({
    jobId: args.job.id,
    leadId: args.lead.id,
    inboxId: sent.inboxId,
    threadId: sent.threadId ?? null,
    outboundMessageId: sent.messageId ?? null,
    providerEmail: args.lead.email,
    providerName: args.lead.name,
    subject: sent.subject ?? null,
  });
  return true;
}

function parseQuotedPriceCents(text: string): number | null {
  const matches = Array.from(text.matchAll(/\$\s*(\d{2,5})(?:\.\d{2})?/g));
  const latest = matches.at(-1)?.[1];
  return latest ? Number(latest) * 100 : null;
}

function inferEmailOutcome(text: string, budgetCents: number): {
  outcome: NegotiationOutcome;
  quotedPriceCents: number | null;
  summary: string;
} {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const quotedPriceCents = parseQuotedPriceCents(normalized);
  const agreed =
    quotedPriceCents !== null &&
    quotedPriceCents <= budgetCents &&
    /\b(available|can do|we can|we have availability|works for us|yes)\b/i.test(normalized);
  const callback = /\b(call|reach)\b.*\b(back|later)\b|\bcallback\b|\bgive us a call\b/i.test(normalized);
  const declined =
    /\b(can't|cannot|won't|not available|too busy|booked|decline|pass)\b/i.test(normalized) ||
    (quotedPriceCents !== null && quotedPriceCents > budgetCents);
  const ambiguous =
    /\b(maybe|depends|not sure|can discuss|what's the address|what date|need details)\b/i.test(normalized) ||
    (quotedPriceCents !== null && !agreed && !declined);

  if (agreed) {
    return {
      outcome: "agreed",
      quotedPriceCents,
      summary: `Email reply quoted $${((quotedPriceCents ?? 0) / 100).toFixed(0)} and said they can do it.`,
    };
  }
  if (callback) {
    return {
      outcome: "callback",
      quotedPriceCents,
      summary: "Provider replied by email and asked for a callback or further follow-up.",
    };
  }
  if (declined) {
    const priceNote = quotedPriceCents ? ` at $${(quotedPriceCents / 100).toFixed(0)}` : "";
    return {
      outcome: "declined",
      quotedPriceCents,
      summary: `Provider declined or stayed above budget${priceNote}.`,
    };
  }
  if (ambiguous || lower.length > 0) {
    return {
      outcome: "ambiguous",
      quotedPriceCents,
      summary: "Provider replied by email, but the quote or availability was not firm enough to book yet.",
    };
  }
  return {
    outcome: "no_answer",
    quotedPriceCents: null,
    summary: "Email reply did not contain usable quote details.",
  };
}

async function resolveJobAfterLeadUpdate(jobId: number): Promise<void> {
  const job = await getJob(jobId);
  if (!job || isResolutionLockedJobStatus(job.status)) return;

  const user = await getUserByConversation(job.conversation_id);
  const leads = await listLeads(job.id);
  const winner = leads
    .filter((l) => l.status === "agreed" && l.quoted_price_cents !== null)
    .sort((a, b) => (a.quoted_price_cents ?? 0) - (b.quoted_price_cents ?? 0))[0];

  if (winner) {
    const claimed = await markJobAwaitingConfirmIfOpen(job.id, winner.id);
    if (!claimed) return;
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

  const hasActiveLeads = leads.some((l) => ACTIVE_LEAD_STATUSES.has(l.status));
  const hasFollowUpLeads = leads.some((l) => FOLLOW_UP_LEAD_STATUSES.has(l.status));
  if (hasActiveLeads) return;

  if (hasFollowUpLeads) {
    if (job.status !== "awaiting_callback") {
      await updateJob(job.id, { status: "awaiting_callback" });
      const text =
        "A provider replied, but they still need follow-up before a firm booking. I'll keep tracking responses and text you when there's a concrete offer.";
      await sendIMessage(job.conversation_id, text, user?.phone);
      await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: text });
    }
    return;
  }

  const failed = await markJobFailedIfUnresolved(job.id);
  if (!failed) return;
  const failText =
    `No one agreed at $${((job.budget_cents ?? 0) / 100).toFixed(0)}. Want to raise budget or try a different city?`;
  await sendIMessage(job.conversation_id, failText, user?.phone);
  await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: failText });
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

  if (existing && !isTerminalJobStatus(existing.status)) {
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
      .join(", ")}. Pulling context from the web…`,
  );

  // 5. Enrich top N: per-lead browser-use task hits the provider's website
  // (email + pricing) and a Reddit sentiment search.
  const toEnrich = leads.slice(0, ENRICH_TOP_N);
  const enrichments = await Promise.allSettled(
    toEnrich.map((lead) =>
      enrichLead({
        name: lead.name,
        service: intent.service,
        location: intent.location,
        sourceUrl: lead.source_url ?? undefined,
      }),
    ),
  );

  for (let i = 0; i < toEnrich.length; i++) {
    const lead = toEnrich[i];
    const r = enrichments[i];
    if (r.status !== "fulfilled") continue;
    const enr = r.value;
    const notesParts: string[] = [];
    if (enr.websiteSummary) notesParts.push(`Website: ${enr.websiteSummary}`);
    if (enr.redditSentiment && enr.redditSentiment !== "unknown")
      notesParts.push(`Reddit sentiment: ${enr.redditSentiment}.`);
    if (enr.redditNotes) notesParts.push(`Reddit notes: ${enr.redditNotes}`);
    const patch: Partial<Lead> = {};
    if (enr.email && !lead.email) patch.email = enr.email;
    if (notesParts.length) patch.notes = notesParts.join(" ");
    if (Object.keys(patch).length) {
      await updateLead(lead.id, patch);
      Object.assign(lead, patch);
    }
  }

  const enrichedCount = enrichments.filter((r) => r.status === "fulfilled").length;
  if (enrichedCount) {
    await notify(job, `Got context on top ${enrichedCount}. Calling now.`);
  } else {
    await notify(job, `Context pull was thin. Calling top picks now.`);
  }

  // 6. Parallel outbound calls (capped)
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
      const ok = await sendFallbackEmailForLead({
        job,
        lead,
        budgetCents,
        timeframe: intent.timeframe,
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
  if (isResolutionLockedJobStatus(job.status)) return;

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
    enrichmentNotes: lead.notes ?? undefined,
    businessName: lead.name,
  };

  const result = await summarizeCall(ctx, args.transcript);
  const snapshot = getNegotiationStatusSnapshot(result.outcome);
  // Preserve the pre-call enrichment notes; append the call summary so we don't
  // lose Reddit/website context as part of recording the outcome.
  const combinedNotes = [lead.notes, result.summary].filter(Boolean).join(" · ");
  await updateLead(lead.id, {
    status: snapshot.leadStatus,
    quoted_price_cents: result.quotedPriceCents,
    notes: combinedNotes,
  });
  await addMemory(
    containerTag,
    `Called ${lead.name} for ${job.service}: ${result.summary}`,
    { type: "call_result", leadId: lead.id, jobId: job.id, outcome: result.outcome },
  );

  const currentJob = await getJob(job.id);
  if (!currentJob || isResolutionLockedJobStatus(currentJob.status)) return;

  // If no answer, send fallback email if we have one
  if (result.outcome === "no_answer" && lead.email) {
    const ok = await sendFallbackEmailForLead({
      job: currentJob,
      lead,
      budgetCents: ctx.budgetCents,
      timeframe: ctx.timeframe,
    });
    if (ok) await updateLead(lead.id, { status: "emailed" });
  }

  await resolveJobAfterLeadUpdate(currentJob.id);
}

export async function handleInboundEmailReply(args: {
  inboxId?: string | null;
  threadId?: string | null;
  messageId: string;
  inReplyTo?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
  text: string;
}): Promise<void> {
  const match = await findEmailLeadMatch({
    inboxId: args.inboxId,
    threadId: args.threadId,
    inReplyTo: args.inReplyTo,
    providerEmail: args.fromEmail,
  });
  if (!match || !match.emailThread) return;

  const recorded = await markInboundEmailReceived({
    emailThreadId: match.emailThread.id,
    messageId: args.messageId,
    threadId: args.threadId,
  });
  if (!recorded) return;
  if (isResolutionLockedJobStatus(match.job.status)) return;

  const trimmedText = args.text.trim();
  if (!trimmedText) return;

  const result = inferEmailOutcome(trimmedText, match.job.budget_cents ?? 10000);
  const snapshot = getNegotiationStatusSnapshot(result.outcome);
  await updateLead(match.lead.id, {
    status: snapshot.leadStatus,
    quoted_price_cents: result.quotedPriceCents,
    notes: result.summary,
  });
  await logMessage({
    jobId: match.job.id,
    direction: "inbound",
    channel: "email",
    body: trimmedText,
  });

  const user = await getUserByConversation(match.job.conversation_id);
  if (user) {
    await addMemory(
      user.container_tag,
      `Email reply from ${match.lead.name} for ${match.job.service}: ${result.summary}`,
      { type: "email_result", leadId: match.lead.id, jobId: match.job.id, outcome: result.outcome },
    );
  }

  await resolveJobAfterLeadUpdate(match.job.id);
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
