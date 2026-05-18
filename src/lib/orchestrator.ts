import { sendIMessage, createOutboundCall } from "./agentphone";
import { sendColdEmail, sendFollowUpEmail } from "./agentmail";
import {
  enrichLead,
  scrapeLeads,
  type BrowserUseObservedMessage,
  type BrowserUseObservedSession,
  type BrowserUseTaskObserver,
} from "./browseruse";
import { parseIntent } from "./intent";
import { triageMessage } from "./triage";
import { classifyJobControl } from "./jobControl";
import { getJobStatusText } from "./jobStatus";
import {
  lockEscrowFromCard,
  lockEscrowFromUsdc,
  releaseToBank,
  releaseToVirtualCard,
  refundEscrow,
} from "./sponge";
import { addMemory, addProviderFeedback, getProviderReputation, recallProviderHistory, searchMemories } from "./supermemory";
import { getNegotiationStatusSnapshot, summarizeCall } from "./negotiator";
import {
  appendConversationMessage,
  createEscrowPayment,
  createJob,
  findEmailLeadMatch,
  findActiveJobByConversation,
  getEscrowByJobId,
  getJob,
  getLead,
  getOrCreateUser,
  getRecentMessages,
  getUserByConversation,
  insertLead,
  listLeads,
  logMessage,
  markInboundEmailReceived,
  markJobAwaitingConfirmIfOpen,
  markJobFailedIfUnresolved,
  createBrowserSession,
  recordBrowserEvent,
  recordCallEnd,
  recordCallStart,
  updateEscrowPayment,
  upsertEmailThread,
  updateBrowserSession,
  updateJob,
  updateLead,
} from "./repo";
import type { Job, Lead, NegotiationContext, NegotiationOutcome } from "./types";
import { env } from "./env";
import { buildWatchUrl } from "./watch";
import { createPayoutToken, buildPayoutUrl } from "./payoutToken";

const MAX_LEADS = 8;
const MAX_PARALLEL_CALLS = 4;
const ENRICH_TOP_N = 3;
const TERMINAL_JOB_STATUSES = new Set<Job["status"]>(["complete", "failed"]);
const RESOLUTION_LOCKED_JOB_STATUSES = new Set<Job["status"]>(["awaiting_confirm", "paying", "awaiting_completion", "complete", "failed"]);
const ACTIVE_LEAD_STATUSES = new Set<Lead["status"]>(["pending", "calling", "negotiating", "emailed"]);
const FOLLOW_UP_LEAD_STATUSES = new Set<Lead["status"]>(["callback", "ambiguous"]);

function createBrowserUseObserver(jobId: number, label: string, phase: string): BrowserUseTaskObserver {
  let browserSessionId: number | null = null;

  async function updateSession(session: BrowserUseObservedSession): Promise<void> {
    if (!browserSessionId) return;
    await updateBrowserSession(browserSessionId, {
      live_url: session.liveUrl,
      status: session.status,
      step_count: session.stepCount,
      last_step_summary: session.lastStepSummary,
      screenshot_url: session.screenshotUrl,
      error: null,
    });
  }

  return {
    async onSessionStarted(session) {
      const row = await createBrowserSession({
        jobId,
        label,
        phase,
        browserUseSessionId: session.id,
        liveUrl: session.liveUrl,
        status: session.status,
        stepCount: session.stepCount,
        lastStepSummary: session.lastStepSummary,
        screenshotUrl: session.screenshotUrl,
      });
      browserSessionId = row.id;
    },
    onSessionUpdated: updateSession,
    async onMessage(message: BrowserUseObservedMessage) {
      if (!browserSessionId || message.hidden) return;
      await recordBrowserEvent({
        jobId,
        browserSessionId,
        externalMessageId: message.id,
        type: message.type,
        summary: message.summary,
        screenshotUrl: message.screenshotUrl,
        createdAt: message.createdAt,
      });
    },
    async onError(error) {
      if (!browserSessionId) return;
      await updateBrowserSession(browserSessionId, {
        status: "error",
        error: error.message,
      });
    },
  };
}

async function notify(job: Job, text: string): Promise<void> {
  const user = await getUserByConversation(job.conversation_id);
  await sendIMessage(job.conversation_id, text, user?.phone);
  await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: text });
}

function isConfirmation(text: string): boolean {
  return /\b(done|pay|pay them|book it|go ahead|yes|yeah|yep|yup|yea|confirm|do it|send it|let's go|for sure|go for it)\b/i.test(text);
}

function isSelectionReply(text: string): boolean {
  const trimmed = text.trim();
  if (/^[1-3]$/.test(trimmed)) return true;
  if (isConfirmation(trimmed)) return true;
  if (/\b(first|second|third)\b/i.test(trimmed)) return true;
  return false;
}

function resolveSelectionIndex(text: string, agreedLeads: Lead[]): number | null {
  const trimmed = text.trim();
  if (/^[1-3]$/.test(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1;
    return idx < agreedLeads.length ? idx : null;
  }
  if (/\bfirst\b/i.test(trimmed)) return 0;
  if (/\bsecond\b/i.test(trimmed)) return agreedLeads.length > 1 ? 1 : null;
  if (/\bthird\b/i.test(trimmed)) return agreedLeads.length > 2 ? 2 : null;
  const lower = trimmed.toLowerCase();
  for (let i = 0; i < agreedLeads.length; i++) {
    const leadNameLower = agreedLeads[i].name.toLowerCase();
    if (leadNameLower.includes(lower) || lower.includes(leadNameLower.split(" ")[0])) {
      return i;
    }
  }
  if (isConfirmation(trimmed)) return 0;
  return null;
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

function getAgreedLeadsSorted(leads: Lead[]): Lead[] {
  return leads
    .filter((l) => l.status === "agreed" && l.quoted_price_cents !== null)
    .sort((a, b) => (a.quoted_price_cents ?? 0) - (b.quoted_price_cents ?? 0));
}

function buildComparisonMessage(agreedLeads: Lead[]): string {
  if (agreedLeads.length === 1) {
    const lead = agreedLeads[0];
    const price = ((lead.quoted_price_cents ?? 0) / 100).toFixed(0);
    const rating = lead.rating ? ` (${lead.rating}★)` : "";
    const payHint = lead.payment_method === "card" ? ", accepts card" : lead.payment_method === "ach" ? ", wants bank transfer" : "";
    return `${lead.name.toLowerCase()}${rating}, $${price}${payHint} — want me to book?`;
  }
  const lines = [`got ${agreedLeads.length} quotes back:`];
  for (let i = 0; i < agreedLeads.length; i++) {
    const lead = agreedLeads[i];
    const price = ((lead.quoted_price_cents ?? 0) / 100).toFixed(0);
    const rating = lead.rating ? ` (${lead.rating}★)` : "";
    const payHint = lead.payment_method === "card" ? ", accepts card" : lead.payment_method === "ach" ? ", bank transfer" : "";
    lines.push(`${i + 1}. ${lead.name.toLowerCase()}${rating} — $${price}${payHint}`);
  }
  lines.push("reply with a number to book");
  return lines.join("\n");
}

async function resolveJobAfterLeadUpdate(jobId: number): Promise<void> {
  const job = await getJob(jobId);
  if (!job || isResolutionLockedJobStatus(job.status)) return;

  const user = await getUserByConversation(job.conversation_id);
  const leads = await listLeads(job.id);
  const agreedLeads = getAgreedLeadsSorted(leads);

  const hasActiveLeads = leads.some((l) => ACTIVE_LEAD_STATUSES.has(l.status));
  const hasFollowUpLeads = leads.some((l) => FOLLOW_UP_LEAD_STATUSES.has(l.status));
  const allOthersTerminal = !hasActiveLeads && !hasFollowUpLeads;

  // Present options when: 2+ agreed, OR 1 agreed and all others are done
  if (agreedLeads.length >= 2 || (agreedLeads.length === 1 && allOthersTerminal)) {
    const cheapest = agreedLeads[0];
    const claimed = await markJobAwaitingConfirmIfOpen(job.id, cheapest.id);
    if (!claimed) return;
    const text = buildComparisonMessage(agreedLeads);
    await sendIMessage(job.conversation_id, text, user?.phone);
    await logMessage({
      jobId: job.id,
      direction: "outbound",
      channel: "imessage",
      body: text,
    });
    return;
  }

  // If there are agreed leads but calls still in flight, wait
  if (agreedLeads.length >= 1 && hasActiveLeads) return;

  if (hasActiveLeads) return;

  if (hasFollowUpLeads) {
    if (job.status !== "awaiting_callback") {
      await updateJob(job.id, { status: "awaiting_callback" });
      const text = "got a reply but they need to confirm still — i'll text you when it's solid";
      await sendIMessage(job.conversation_id, text, user?.phone);
      await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: text });
    }
    return;
  }

  const failed = await markJobFailedIfUnresolved(job.id);
  if (!failed) return;
  const failText = "no one could match the budget — want me to try a higher number or different area?";
  await sendIMessage(job.conversation_id, failText, user?.phone);
  await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: failText });
}

/**
 * Adjust lead rankings based on the user's past interactions stored in Supermemory.
 */
async function applyMemoryToLeads(
  containerTag: string,
  leads: Lead[],
  _service: string,
): Promise<Lead[]> {
  const results = await Promise.allSettled(
    leads.map((lead) => getProviderReputation(containerTag, lead.name)),
  );

  const filtered: Lead[] = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const result = results[i];
    if (result.status !== "fulfilled") {
      filtered.push(lead);
      continue;
    }
    const { memories, sentiment } = result.value;

    const allText = memories.map((m) => m.content.toLowerCase()).join(" ");
    const isBlocklisted =
      allText.includes("don't use") ||
      allText.includes("do not use") ||
      allText.includes("never again") ||
      allText.includes("avoid " + lead.name.toLowerCase());

    if (isBlocklisted) {
      console.log(`[memory] Filtering out ${lead.name} — user blocklisted`);
      continue;
    }

    if (sentiment === "positive") {
      lead.rank_score = (lead.rank_score ?? 0) + 3;
    } else if (sentiment === "negative") {
      lead.rank_score = (lead.rank_score ?? 0) - 2;
    }

    filtered.push(lead);
  }

  filtered.sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
  return filtered;
}

export async function handleInboundIMessage(args: {
  conversationId: string;
  fromPhone: string;
  text: string;
}): Promise<void> {
  const { conversationId, fromPhone, text } = args;
  const existing = await findActiveJobByConversation(conversationId);

  // Handle payment funding source selection (card / usdc)
  if (existing && existing.status === "paying") {
    await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
    const lower = text.trim().toLowerCase();
    if (lower.includes("card") || lower.includes("credit")) {
      await fundEscrow(existing.id, "card");
    } else if (lower.includes("usdc") || lower.includes("crypto") || lower.includes("wallet")) {
      await fundEscrow(existing.id, "usdc");
    } else {
      await notify(existing, "just reply 'card' or 'usdc' — which one?");
    }
    return;
  }

  // Handle job completion confirmation or no-show report
  if (existing && existing.status === "awaiting_completion") {
    await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
    const lower = text.trim().toLowerCase();
    const isDone = /\b(done|finished|completed|great|good|perfect|all set)\b/.test(lower);
    const isNoShow = /\b(no.?show|didn't show|never showed|didn't come|ghosted)\b/.test(lower);
    const isStatus = /\b(status|update|what's happening)\b/.test(lower);
    if (isDone) {
      await releasePayment(existing.id);
    } else if (isNoShow) {
      await refundPayment(existing.id);
    } else if (isStatus) {
      const lead = existing.winning_lead_id ? await getLead(existing.winning_lead_id) : null;
      const name = lead?.name.toLowerCase() ?? "provider";
      await notify(existing, `${name} is booked — payment's in escrow. text me 'done' when the job's finished and i'll release it`);
    } else {
      await notify(existing, "is the job done? just say 'done' to release payment, or 'no-show' if they ghosted");
    }
    return;
  }

  // Multi-quote selection when awaiting confirmation
  if (existing && existing.status === "awaiting_confirm" && isSelectionReply(text)) {
    await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
    const leads = await listLeads(existing.id);
    const agreedLeads = getAgreedLeadsSorted(leads);
    if (agreedLeads.length > 1) {
      const selectedIdx = resolveSelectionIndex(text, agreedLeads);
      if (selectedIdx !== null && selectedIdx < agreedLeads.length) {
        const selected = agreedLeads[selectedIdx];
        if (existing.winning_lead_id !== selected.id) {
          await updateJob(existing.id, { winning_lead_id: selected.id });
        }
        await runPayment(existing.id, selected.id);
      } else {
        await notify(existing, "didn't catch that — reply with a number (1, 2, etc) to pick one");
      }
    } else {
      await runPayment(existing.id);
    }
    return;
  }

  // Smart job control for active jobs
  if (existing && !isTerminalJobStatus(existing.status)) {
    await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });

    const intent = await classifyJobControl(text);

    switch (intent.type) {
      case "confirm": {
        if (existing.status === "awaiting_confirm") {
          await runPayment(existing.id);
        } else {
          await notify(existing, "nothing to confirm yet — still working on finding options");
        }
        break;
      }
      case "status": {
        const statusText = await getJobStatusText(existing);
        await notify(existing, statusText);
        break;
      }
      case "cancel": {
        await updateJob(existing.id, { status: "failed" });
        await notify(existing, "killed it — lmk if you want to try something else");
        break;
      }
      case "modify": {
        const patches: Partial<Pick<Job, "budget_cents" | "location" | "timeframe">> = {};
        const changeParts: string[] = [];
        if (intent.budgetCents) {
          patches.budget_cents = intent.budgetCents;
          changeParts.push(`bumped budget to $${(intent.budgetCents / 100).toFixed(0)}`);
        }
        if (intent.location) {
          patches.location = intent.location;
          changeParts.push(`switched area to ${intent.location}`);
        }
        if (intent.timeframe) {
          patches.timeframe = intent.timeframe;
          changeParts.push(`timeframe now ${intent.timeframe}`);
        }
        if (Object.keys(patches).length) {
          await updateJob(existing.id, patches);
          await notify(existing, `${changeParts.join(", ")} — i'll retry with the new params`);
        } else {
          await notify(existing, "not sure what to change — can you be more specific?");
        }
        break;
      }
      case "skip": {
        const leads = await listLeads(existing.id);
        const activeLeads = leads.filter((l) => ACTIVE_LEAD_STATUSES.has(l.status));
        if (activeLeads.length) {
          await Promise.all(activeLeads.map((l) => updateLead(l.id, { status: "declined" })));
          await notify(existing, `skipped ${activeLeads.length} — looking for others`);
          await resolveJobAfterLeadUpdate(existing.id);
        } else {
          await notify(existing, "no active leads to skip — everyone already responded or was tried");
        }
        break;
      }
      case "other": {
        await notify(existing, intent.reply);
        break;
      }
    }
    return;
  }

  // Fetch conversation history for context-aware triage
  const history = await getRecentMessages(conversationId);
  const user = await getOrCreateUser(fromPhone);

  // Triage: is this casual chat, partial intent, or a real service request?
  const triage = await triageMessage(text, { history, containerTag: user.container_tag });

  if (triage.type === "chat" || triage.type === "partial") {
    await appendConversationMessage(conversationId, "user", text);
    await sendIMessage(conversationId, triage.reply, user.phone);
    await appendConversationMessage(conversationId, "assistant", triage.reply);
    return;
  }

  // It's a service request — store message and kick off the full pipeline.
  await appendConversationMessage(conversationId, "user", text);
  const fullIntentParts = history
    .filter((m) => m.role === "user")
    .map((m) => m.text);
  fullIntentParts.push(text);
  const intentRaw = fullIntentParts.join(" | ");
  const job = await createJob({ userId: user.id, conversationId, intentRaw });
  await logMessage({ jobId: job.id, direction: "inbound", channel: "imessage", body: text });
  if (job.watch_token) {
    const watchUrl = buildWatchUrl(job.watch_token, env.PUBLIC_BASE_URL);
    await sendIMessage(conversationId, watchUrl, user.phone);
    await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: watchUrl });
  }
  runFullJob(job.id, user.container_tag).catch((e) => {
    console.error("[orchestrator] runFullJob crashed", e);
  });
}

async function runFullJob(jobId: number, containerTag: string): Promise<void> {
  const job0 = await getJob(jobId);
  if (!job0) return;

  await notify(job0, "on it — looking around for options rn");

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
    `${intent.service} in ${intent.location}, ${intent.timeframe} — searching now`,
  );

  // 2. Lead gen
  const scraped = await scrapeLeads(
    intent.service,
    intent.location,
    MAX_LEADS,
    createBrowserUseObserver(jobId, "Lead search", "lead_search"),
  );
  if (!scraped.length) {
    await updateJob(jobId, { status: "failed" });
    await notify(job, "couldn't find anyone for that — try rephrasing or a different area?");
    return;
  }

  // 3. Pull user prefs from memory
  await searchMemories(containerTag, `preferences for ${intent.service}`, 5);

  // 4. Persist + rank
  let leads: Lead[] = [];
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
      payment_method: null,
      notes: null,
    });
    leads.push(lead);
  }
  leads.sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));

  // 4b. Apply memory-based ranking: boost/penalize/filter providers
  leads = await applyMemoryToLeads(containerTag, leads, intent.service);

  await updateJob(jobId, { status: "ranked" });
  await notify(
    job,
    `found ${leads.length} options — top picks: ${leads
      .slice(0, 3)
      .map((l) => `${l.name}${l.rating ? ` (${l.rating}★)` : ""}`)
      .join(", ")}`,
  );

  // 5. Enrich top N
  const toEnrich = leads.slice(0, ENRICH_TOP_N);
  const enrichments = await Promise.allSettled(
    toEnrich.map((lead) =>
      enrichLead({
        name: lead.name,
        service: intent.service,
        location: intent.location,
        sourceUrl: lead.source_url ?? undefined,
        observer: createBrowserUseObserver(jobId, `Research ${lead.name}`, "enrichment"),
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

  await notify(job, "calling them now");

  // 6. Parallel outbound calls (capped)
  await updateJob(jobId, { status: "calling" });
  const calling = leads.filter((l) => l.phone).slice(0, MAX_PARALLEL_CALLS);
  const emailOnly = leads.filter((l) => !l.phone && l.email);

  await Promise.all(
    calling.map(async (lead) => {
      const greeting = `Hi, this is Haggle calling about ${intent.service}.`;
      await logMessage({
        jobId,
        direction: "outbound",
        channel: "system",
        body: `Issuing call to ${lead.name}${lead.phone ? ` at ${lead.phone}` : ""}.`,
      });
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

  // Fire fallback emails to phone-less leads
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
    await notify(job, `also emailed ${emailOnly.length} that didn't have a phone listed`);
  }

  await notify(job, `dialed ${calling.length} — i'll text you when they quote`);

  if (!calling.length && !emailOnly.length) {
    await updateJob(jobId, { status: "failed" });
    await notify(job, "none of them had a phone or email — try a different area?");
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
  const combinedNotes = [lead.notes, result.summary].filter(Boolean).join(" · ");
  await updateLead(lead.id, {
    status: snapshot.leadStatus,
    quoted_price_cents: result.quotedPriceCents,
    payment_method: result.paymentMethod,
    notes: combinedNotes,
  });
  await addMemory(
    containerTag,
    `Called ${lead.name} for ${job.service}: ${result.summary}`,
    { type: "call_result", leadId: lead.id, jobId: job.id, outcome: result.outcome },
  );

  // Store structured provider feedback
  if (result.outcome === "agreed") {
    await addProviderFeedback(
      containerTag,
      lead.name,
      job.service ?? "service",
      `Agreed to do ${job.service} for $${((result.quotedPriceCents ?? 0) / 100).toFixed(0)}.`,
      "positive",
    );
  } else if (result.outcome === "declined") {
    await addProviderFeedback(
      containerTag,
      lead.name,
      job.service ?? "service",
      `Declined or couldn't match budget for ${job.service}.`,
      "negative",
    );
  }

  // Send follow-up email recapping the call
  if (lead.email) {
    const followUp = await sendFollowUpEmail({
      to: lead.email,
      businessName: lead.name,
      service: job.service ?? "service",
      location: job.location ?? "",
      timeframe: job.timeframe ?? "ASAP",
      outcome: result.outcome,
      quotedPriceCents: result.quotedPriceCents,
      callSummary: result.summary,
      fromName: "Haggle Concierge",
    });
    if (followUp.ok) {
      await upsertEmailThread({
        jobId: job.id,
        leadId: lead.id,
        inboxId: followUp.inboxId,
        threadId: followUp.threadId ?? null,
        outboundMessageId: followUp.messageId ?? null,
        providerEmail: lead.email,
        providerName: lead.name,
        subject: followUp.subject ?? null,
      });
    }
  }

  const currentJob = await getJob(job.id);
  if (!currentJob || isResolutionLockedJobStatus(currentJob.status)) return;

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

async function runPayment(jobId: number, leadIdOverride?: number): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const targetLeadId = leadIdOverride ?? job.winning_lead_id;
  if (!targetLeadId) return;
  const lead = await getLead(targetLeadId);
  if (!lead) return;
  const user = await getUserByConversation(job.conversation_id);

  if (job.winning_lead_id !== targetLeadId) {
    await updateJob(jobId, { winning_lead_id: targetLeadId });
  }

  await updateJob(jobId, { status: "paying" });
  const amount = (lead.quoted_price_cents ?? 0) / 100;

  // Ask user how they want to fund the escrow
  await sendIMessage(
    job.conversation_id,
    `locking in ${lead.name.toLowerCase()} @ $${amount.toFixed(0)}. how do you wanna pay?\n• card (charge your card)\n• usdc (from your wallet)`,
    user?.phone,
  );
  await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: `Payment method prompt for $${amount.toFixed(0)}` });

  // For now, default to USDC (the user's next message with "card" or "usdc" will be handled by fundEscrow)
  // Store escrow intent so fundEscrow can pick it up
  const payoutToken = createPayoutToken();
  await createEscrowPayment({
    jobId: job.id,
    leadId: lead.id,
    amountCents: lead.quoted_price_cents ?? 0,
    fundingSource: "usdc",
    fundingTxHash: null,
    providerPayoutMethod: lead.payment_method,
    payoutToken,
  });
}

export async function fundEscrow(jobId: number, fundingSource: "card" | "usdc"): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const escrow = await getEscrowByJobId(jobId);
  if (!escrow) return;
  const lead = await getLead(escrow.lead_id);
  if (!lead) return;
  const user = await getUserByConversation(job.conversation_id);
  const amount = escrow.amount_cents / 100;

  if (fundingSource === "card") {
    const redirectUrl = `${env.PUBLIC_BASE_URL}/pay/${escrow.payout_token}`;
    const result = await lockEscrowFromCard(amount, redirectUrl);
    if (!result.ok) {
      await sendIMessage(job.conversation_id, `card charge failed — ${result.error ?? "try again?"}`, user?.phone);
      return;
    }
    // Card flow sends user to onramp URL
    if (result.onrampUrl) {
      await sendIMessage(job.conversation_id, `tap here to pay with card:\n${result.onrampUrl}`, user?.phone);
    }
  } else {
    const result = await lockEscrowFromUsdc(amount);
    if (!result.ok) {
      await sendIMessage(job.conversation_id, `usdc transfer failed — ${result.error ?? "check balance?"}`, user?.phone);
      await updateJob(jobId, { status: "failed" });
      return;
    }
  }

  // Funds locked — notify user
  await sendIMessage(
    job.conversation_id,
    `$${amount.toFixed(0)} locked in escrow. ${lead.name.toLowerCase()} is confirmed.\ni'll release payment once you tell me the job's done.`,
    user?.phone,
  );
  await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: `Escrow locked: $${amount.toFixed(0)}` });

  // Send payout link to provider
  const payoutUrl = buildPayoutUrl(escrow.payout_token, env.PUBLIC_BASE_URL);
  if (lead.payment_method === "ach" && lead.phone) {
    await sendIMessage(
      `provider_${lead.id}`,
      `hey ${lead.name.split(" ")[0].toLowerCase()} — you're booked. $${amount.toFixed(0)} will be released after the job's done.\nset up your payout here: ${payoutUrl}`,
      lead.phone,
    );
  }

  await updateJob(jobId, { status: "awaiting_completion" });
}

export async function releasePayment(jobId: number): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const escrow = await getEscrowByJobId(jobId);
  if (!escrow || escrow.status !== "held") return;
  const lead = await getLead(escrow.lead_id);
  if (!lead) return;
  const user = await getUserByConversation(job.conversation_id);
  const amount = escrow.amount_cents / 100;

  const method = escrow.provider_payout_method ?? lead.payment_method;

  let success = false;
  let txInfo = "";

  if (method === "card") {
    const result = await releaseToVirtualCard(amount, lead.name);
    success = result.ok;
    if (!result.ok) txInfo = result.error ?? "card payment failed";
  } else if (method === "ach") {
    const accountId = escrow.provider_payout_account_id;
    if (!accountId) {
      await sendIMessage(
        job.conversation_id,
        `${lead.name.toLowerCase()} hasn't set up their bank account yet — i'll remind them and release once they do`,
        user?.phone,
      );
      return;
    }
    const result = await releaseToBank(amount, accountId);
    success = result.ok;
    txInfo = result.txHash ?? "";
  } else {
    // Fallback: pay USDC directly to demo address
    const { payUsdc } = await import("./sponge");
    const result = await payUsdc(amount, env.SPONGE_DEMO_PAYEE_ADDRESS);
    success = result.ok;
    txInfo = result.explorerUrl ?? "";
  }

  if (success) {
    await updateEscrowPayment(escrow.id, { status: "released", release_tx_hash: txInfo || null });
    await updateJob(jobId, { status: "complete" });
    const methodLabel = method === "card" ? "virtual card" : method === "ach" ? "bank transfer" : "usdc";
    await sendIMessage(
      job.conversation_id,
      `done — $${amount.toFixed(0)} released to ${lead.name.toLowerCase()} via ${methodLabel}.${txInfo ? `\n${txInfo}` : ""}`,
      user?.phone,
    );

    if (user) {
      const today = new Date().toISOString().split("T")[0];
      await addMemory(
        user.container_tag,
        `Booked ${job.service} from ${lead.name} on ${today} for $${amount.toFixed(0)}. Paid via ${methodLabel}.`,
        { type: "booking_complete", leadId: lead.id, jobId: job.id, date: today },
      );
      await addProviderFeedback(
        user.container_tag,
        lead.name,
        job.service ?? "service",
        `Booked and paid $${amount.toFixed(0)} on ${today} via ${methodLabel}.`,
        "positive",
      );
    }
  } else {
    await sendIMessage(
      job.conversation_id,
      `payment release failed — ${txInfo || "not sure why"}. want me to retry?`,
      user?.phone,
    );
  }
}

export async function refundPayment(jobId: number): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const escrow = await getEscrowByJobId(jobId);
  if (!escrow || escrow.status !== "held") return;
  const user = await getUserByConversation(job.conversation_id);
  const amount = escrow.amount_cents / 100;

  const userAddress = user?.sponge_wallet_address;
  if (!userAddress) {
    await updateEscrowPayment(escrow.id, { status: "refunded" });
    await updateJob(jobId, { status: "failed" });
    await sendIMessage(job.conversation_id, `refunding $${amount.toFixed(0)} — job cancelled`, user?.phone);
    return;
  }

  const result = await refundEscrow(amount, userAddress);
  if (result.ok) {
    await updateEscrowPayment(escrow.id, { status: "refunded", release_tx_hash: result.txHash ?? null });
    await updateJob(jobId, { status: "failed" });
    await sendIMessage(job.conversation_id, `refunded $${amount.toFixed(0)} back to your wallet`, user?.phone);
  } else {
    await sendIMessage(job.conversation_id, `refund failed — ${result.error ?? "will retry"}`, user?.phone);
  }
}
