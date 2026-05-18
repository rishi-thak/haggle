import { createOutboundCall } from "./agentphone";
import { sendUserMessage } from "./userChannel";
import { sendColdEmail, sendFollowUpEmail } from "./agentmail";
import {
  enrichLead,
  scrapeLeads,
  type BrowserUseObservedMessage,
  type BrowserUseObservedSession,
  type BrowserUseTaskObserver,
} from "./browseruse";
import { parseIntent, type Intent } from "./intent";
import { gatherResearch } from "./research";
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
import { buildSystemPrompt, getNegotiationStatusSnapshot, summarizeCall } from "./negotiator";
import { recordQuote, getPriceHistory, getBudgetInsight, buildPriceContext } from "./priceIntel";
import { getPreferredProviders, shouldSkipScraping, recordBooking, recordProviderRating } from "./providerLoyalty";
import { getServiceAddress, getSchedulingPreferences, updateUserStyle, buildUserContext } from "./userDefaults";
import { buildNegotiationHints, inferTacticsFromTranscript, recordTactic, getReferralBoost } from "./negotiationTactics";
import { askForRating, parseRatingReply, recordPostJobFeedback, recordServiceInterval } from "./postJobFeedback";
import { parseReferralFromMessage, recordReferral, getReferralSource } from "./referralMemory";
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
import {
  filterNewLeadCandidates,
  getCallableLeads,
  getPendingLeadIdsToRetireBeforeResearch,
} from "./leadSelection";

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
  await sendUserMessage(
    job.conversation_id,
    text,
    user?.phone,
    user?.preferred_from_number ?? undefined,
  );
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

function isApproval(text: string): boolean {
  return /\b(go|yes|sounds good|yep|yeah|ok|okay|sure|do it|call them|approved?|👍)\b/i.test(text);
}

function isSkip(text: string): boolean {
  return /\b(skip|just go|whatever|idk|i don'?t know|nm|no preference|just call|move on)\b/i.test(text);
}

function isRetryRequest(text: string): boolean {
  if (/\b(no|nah|stop|cancel|don't|dont)\b/i.test(text)) return false;
  return /\b(retry|try again|again|rerun|run it back|go again|yes|yeah|yep|ok|okay|go)\b/i.test(
    text,
  );
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

function canFailOpenToUser(job: Job): boolean {
  return !isTerminalJobStatus(job.status) && !isResolutionLockedJobStatus(job.status);
}

async function getJobForFailure(jobId: number): Promise<Job | null> {
  try {
    return await getJob(jobId);
  } catch (error) {
    console.error("[orchestrator] failed to load job after workflow error", error);
    return null;
  }
}

async function safeNotify(job: Job, text: string): Promise<void> {
  try {
    await notify(job, text);
  } catch (error) {
    console.error("[orchestrator] failed to notify user", error);
  }
}

function startJobWorkflow(
  label: string,
  jobId: number,
  workflow: () => Promise<void>,
): void {
  runJobWorkflowWithFallback(label, jobId, workflow).catch((error) => {
    console.error(`[orchestrator] ${label} fallback failed`, error);
  });
}

async function runJobWorkflowWithFallback(
  label: string,
  jobId: number,
  workflow: () => Promise<void>,
): Promise<void> {
  try {
    await workflow();
    return;
  } catch (firstError) {
    console.error(`[orchestrator] ${label} crashed`, firstError);
  }

  const firstJob = await getJobForFailure(jobId);
  if (!firstJob || !canFailOpenToUser(firstJob)) return;

  await safeNotify(firstJob, "hit a snag on my side - retrying now");

  try {
    await workflow();
    return;
  } catch (retryError) {
    console.error(`[orchestrator] ${label} retry failed`, retryError);
  }

  const latestJob = (await getJobForFailure(jobId)) ?? firstJob;
  if (!canFailOpenToUser(latestJob)) return;

  try {
    await updateJob(jobId, { status: "failed" });
  } catch (error) {
    console.error("[orchestrator] failed to mark job failed", error);
  }
  await safeNotify(
    latestJob,
    "still stuck after a retry - reply retry and i'll run it again, or send different details",
  );
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
    await sendUserMessage(
      job.conversation_id,
      text,
      user?.phone,
      user?.preferred_from_number ?? undefined,
    );
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
      await sendUserMessage(
        job.conversation_id,
        text,
        user?.phone,
        user?.preferred_from_number ?? undefined,
      );
      await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: text });
    }
    return;
  }

  const failed = await markJobFailedIfUnresolved(job.id);
  if (!failed) return;
  const failText = "no one could match the budget — want me to try a higher number or different area?";
  await sendUserMessage(
    job.conversation_id,
    failText,
    user?.phone,
    user?.preferred_from_number ?? undefined,
  );
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
  toPhone?: string;
  text: string;
}): Promise<void> {
  const { conversationId, fromPhone, toPhone, text } = args;

  // Remember which of our numbers the user texted so replies go back on the
  // same channel (iMessage vs SMS).
  if (toPhone) {
    await getOrCreateUser(fromPhone, toPhone).catch((e) =>
      console.error("[orchestrator] getOrCreateUser preferred number failed", e),
    );
  }

  const existing = await findActiveJobByConversation(conversationId);

  // Handle post-job rating reply (job already complete, user is responding to "how was it?")
  if (existing && existing.status === "complete") {
    const rating = parseRatingReply(text);
    if (rating.rating !== null && existing.winning_lead_id) {
      const lead = await getLead(existing.winning_lead_id);
      const user = await getUserByConversation(existing.conversation_id);
      if (lead && user) {
        await recordPostJobFeedback(user.container_tag, lead.name, existing.service ?? "service", rating.rating, rating.notes);
        await recordProviderRating(user.container_tag, lead.name, existing.service ?? "service", rating.rating, rating.notes);
        const thanks = rating.rating >= 4 ? "noted — i'll prioritize them next time" : rating.rating <= 2 ? "got it — i'll avoid them going forward" : "noted, thanks";
        await sendUserMessage(existing.conversation_id, thanks, user.phone);
      }
    }
    // Don't return — fall through to triage for new requests
  }

  if (existing && existing.status === "failed" && isRetryRequest(text)) {
    await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
    const user = await getOrCreateUser(fromPhone);
    await notify(existing, "trying again now");
    startJobWorkflow(
      "retryFailedJob",
      existing.id,
      () => retryFailedJob(existing.id, user.container_tag),
    );
    return;
  }

  // Handle referral detection in messages
  if (!existing || isTerminalJobStatus(existing.status)) {
    const referral = parseReferralFromMessage(text);
    if (referral.providerName && referral.source) {
      const user = await getOrCreateUser(fromPhone);
      await recordReferral(user.container_tag, referral.providerName, "general", referral.source);
    }
  }

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
    // Payment confirmation
    if (existing.status === "awaiting_confirm" && isConfirmation(text)) {
      await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
      await runPayment(existing.id);
      return;
    }

    // User is answering clarifying questions — fold their reply into the
    // job intent, then go search.
    if (existing.status === "gathering_info") {
      await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
      const expanded = `${existing.intent_raw}\n\nuser follow-up details: ${text}`;
      await updateJob(existing.id, { intent_raw: expanded });
      const user = await getOrCreateUser(fromPhone);
      await notify(existing, "got it — searching now");
      startJobWorkflow(
        "runLeadSearchAndApproval",
        existing.id,
        () => runLeadSearchAndApproval(existing.id, user.container_tag),
      );
      return;
    }

    // User is reviewing the list of providers — approve to call, or
    // give feedback and we re-search.
    if (existing.status === "awaiting_approval") {
      await logMessage({ jobId: existing.id, direction: "inbound", channel: "imessage", body: text });
      const user = await getOrCreateUser(fromPhone);
      if (isApproval(text) || isSkip(text)) {
        await notify(existing, "calling them now");
        startJobWorkflow(
          "runCalls",
          existing.id,
          () => runCalls(existing.id, user.container_tag),
        );
      } else {
        const expanded = `${existing.intent_raw}\n\nuser feedback on options: ${text}`;
        await retirePendingLeadsBeforeResearch(existing.id);
        await updateJob(existing.id, { intent_raw: expanded });
        await notify(existing, "got it — re-searching with that in mind");
        startJobWorkflow(
          "runLeadSearchAndApproval",
          existing.id,
          () => runLeadSearchAndApproval(existing.id, user.container_tag),
        );
      }
      return;
    }

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
        // Fall through to triage for natural conversation
        break;
      }
    }
    if (intent.type !== "other") return;
  }

  // Fetch conversation history for context-aware triage
  const history = await getRecentMessages(conversationId);
  const user = await getOrCreateUser(fromPhone);
  const replyFrom = toPhone ?? user.preferred_from_number ?? undefined;

  // Triage: is this casual chat, partial intent, or a real service request?
  const triage = await triageMessage(text, { history, containerTag: user.container_tag });

  if (triage.type === "chat" || triage.type === "partial") {
    await appendConversationMessage(conversationId, "user", text);
    await sendUserMessage(conversationId, triage.reply, user.phone, replyFrom);
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
    await sendUserMessage(conversationId, watchUrl, user.phone, replyFrom);
    await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: watchUrl });
  }
  startJobWorkflow(
    "runIntentAndResearch",
    job.id,
    () => runIntentAndResearch(job.id, user.container_tag),
  );
}

async function applyParsedIntent(jobId: number, intent: Intent): Promise<void> {
  await updateJob(jobId, {
    service: intent.service,
    location: intent.location,
    budget_cents: intent.budgetCents ?? 10000,
    timeframe: intent.timeframe,
  });
}

async function scrapeAndPersistLeads(args: {
  jobId: number;
  service: string;
  location: string;
  count: number;
  specificProvider: string | null;
}): Promise<Lead[]> {
  const query = args.specificProvider
    ? `${args.specificProvider} — ${args.service} in ${args.location}`
    : args.service;
  const scraped = await scrapeLeads(
    query,
    args.location,
    args.count,
    createBrowserUseObserver(args.jobId, "Lead search", "lead_search"),
  );
  const existingLeads = await listLeads(args.jobId);
  const candidates = filterNewLeadCandidates(scraped, existingLeads);
  for (const s of candidates) {
    await insertLead({
      job_id: args.jobId,
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
  }

  const leads = await listLeads(args.jobId);
  leads.sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
  return leads;
}

async function retirePendingLeadsBeforeResearch(jobId: number): Promise<number> {
  const leads = await listLeads(jobId);
  const leadIds = getPendingLeadIdsToRetireBeforeResearch(leads);
  await Promise.all(leadIds.map((id) => updateLead(id, { status: "declined" })));
  return leadIds.length;
}

async function retryFailedJob(jobId: number, containerTag: string): Promise<void> {
  const leads = getCallableLeads(await listLeads(jobId));
  if (leads.some((lead) => lead.phone || lead.email)) {
    await runCalls(jobId, containerTag);
    return;
  }

  await runLeadSearchAndApproval(jobId, containerTag);
}

async function enrichTopLeads(args: {
  jobId: number;
  leads: Lead[];
  service: string;
  location: string;
}): Promise<void> {
  const toEnrich = args.leads.slice(0, ENRICH_TOP_N);
  const enrichments = await Promise.allSettled(
    toEnrich.map((lead) =>
      enrichLead({
        name: lead.name,
        service: args.service,
        location: args.location,
        sourceUrl: lead.source_url ?? undefined,
        observer: createBrowserUseObserver(args.jobId, `Research ${lead.name}`, "enrichment"),
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
}

// PHASE 1: parse intent, then either go straight to a specific provider
// or do research and ask the user clarifying questions.
async function runIntentAndResearch(jobId: number, containerTag: string): Promise<void> {
  const job0 = await getJob(jobId);
  if (!job0) return;

  await notify(job0, "on it — thinking through what i need to ask first");

  const intent = await parseIntent(job0.intent_raw, containerTag);
  const budgetCents = intent.budgetCents ?? 10000;
  await applyParsedIntent(jobId, intent);
  await addMemory(
    containerTag,
    `Requested ${intent.service} in ${intent.location} with budget $${(budgetCents / 100).toFixed(0)}, timeframe ${intent.timeframe}.`,
    { type: "request", jobId },
  );

  // FAST PATH: user named a specific provider — skip research + approval,
  // just look it up and call.
  if (intent.specificProvider) {
    await updateJob(jobId, { status: "searching" });
    const job = (await getJob(jobId))!;
    await notify(job, `looking up ${intent.specificProvider} now`);
    await runLeadSearch(jobId, { specificProvider: intent.specificProvider });
    const leads = await listLeads(jobId);
    if (!leads.length) {
      await updateJob(jobId, { status: "failed" });
      await notify(job, `couldn't find ${intent.specificProvider} — got a phone number or website?`);
      return;
    }
    await runCalls(jobId, containerTag);
    return;
  }

  // GENERAL PATH: research the space, ask the user clarifying questions
  // a real provider would ask before quoting.
  await updateJob(jobId, { status: "researching" });
  const research = await gatherResearch({
    service: intent.service,
    location: intent.location,
  });
  if (research.marketContext) {
    await addMemory(
      containerTag,
      `Market context for ${intent.service}: ${research.marketContext}`,
      { type: "market_context", jobId },
    );
  }
  await updateJob(jobId, { status: "gathering_info" });
  const job = (await getJob(jobId))!;
  await notify(job, research.questionsMessage);
  // Now we wait for the user to reply. handleInboundIMessage routes their
  // next message into runLeadSearchAndApproval.
}

// PHASE 2: search for leads using the (now richer) intent, then present
// the list to the user for approval before any calls go out.
async function runLeadSearchAndApproval(jobId: number, containerTag: string): Promise<void> {
  const job0 = await getJob(jobId);
  if (!job0) return;

  // Re-parse — intent_raw now includes the user's clarifying answers.
  const intent = await parseIntent(job0.intent_raw, containerTag);
  await applyParsedIntent(jobId, intent);
  await updateJob(jobId, { status: "searching" });
  await searchMemories(containerTag, `preferences for ${intent.service}`, 5);

  await runLeadSearch(jobId);
  const job = (await getJob(jobId))!;
  const leads = getCallableLeads(await listLeads(jobId));
  if (!leads.length) {
    await updateJob(jobId, { status: "failed" });
    await notify(job, "couldn't find anyone for that — try rephrasing or a different area?");
    return;
  }

  await updateJob(jobId, { status: "awaiting_approval" });
  const top = leads.slice(0, 5);
  const lines = top
    .map((l, i) => {
      const rating = l.rating ? ` ${l.rating}★` : "";
      const phone = l.phone ? "" : " (no phone listed)";
      return `${i + 1}. ${l.name}${rating}${phone}`;
    })
    .join("\n");
  await notify(job, `here's who i'd call:\n${lines}\n\nsay go and i'll dial — or tell me what to change`);
}

async function runLeadSearch(
  jobId: number,
  opts: { specificProvider?: string } = {},
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const count = opts.specificProvider ? 1 : MAX_LEADS;
  await scrapeAndPersistLeads({
    jobId,
    service: job.service ?? "",
    location: job.location ?? "",
    count,
    specificProvider: opts.specificProvider ?? null,
  });
}

// PHASE 3: enrich the top leads, then place outbound calls in parallel and
// fall back to email for phone-less ones.
async function runCalls(jobId: number, containerTag: string): Promise<void> {
  const job0 = await getJob(jobId);
  if (!job0) return;

  const leads = getCallableLeads(await listLeads(jobId));
  if (!leads.length) {
    await updateJob(jobId, { status: "failed" });
    await notify(job0, "no leads to call — want me to try again?");
    return;
  }

  const intentService = job0.service ?? "";
  const intentLocation = job0.location ?? "";
  const intentTimeframe = job0.timeframe ?? "ASAP";
  const budgetCents = job0.budget_cents ?? 10000;

  try {
    await enrichTopLeads({
      jobId,
      leads,
      service: intentService,
      location: intentLocation,
    });
  } catch (error) {
    console.error("[orchestrator] enrichTopLeads failed, continuing to call", error);
    await logMessage({
      jobId,
      direction: "outbound",
      channel: "system",
      body: "Lead enrichment failed; continuing with existing contact info.",
    }).catch(() => {});
  }

  await updateJob(jobId, { status: "calling" });
  const job = (await getJob(jobId))!;

  const calling = leads.filter((l) => l.phone).slice(0, MAX_PARALLEL_CALLS);
  const emailOnly = leads.filter((l) => !l.phone && l.email);

  if (!calling.length && !emailOnly.length) {
    await updateJob(jobId, { status: "failed" });
    await notify(job, "none of them had a phone or email — try a different area?");
    return;
  }

  const callResults = await Promise.all(
    calling.map(async (lead) => {
      try {
        await logMessage({
          jobId,
          direction: "outbound",
          channel: "system",
          body: `Issuing call to ${lead.name}${lead.phone ? ` at ${lead.phone}` : ""}.`,
        });
        const past = await recallProviderHistory(containerTag, intentService, lead.name);
        const ctx: NegotiationContext = {
          jobId,
          leadId: lead.id,
          service: intentService || "service",
          location: intentLocation,
          budgetCents,
          timeframe: intentTimeframe,
          userPreferences: [],
          pastProviderNotes: past.summary,
          enrichmentNotes: lead.notes ?? undefined,
          businessName: lead.name,
        };
        const call = await createOutboundCall({
          toNumber: lead.phone!,
          initialGreeting: "",
          systemPrompt: buildSystemPrompt(ctx),
          variables: { jobId: String(jobId), leadId: String(lead.id) },
        });
        if (call) {
          await recordCallStart({ jobId, leadId: lead.id, agentphoneCallId: call.id });
          await updateLead(lead.id, { status: "calling" });
          return true;
        }

        await updateLead(lead.id, { status: "no_answer" });
        return false;
      } catch (error) {
        console.error(`[orchestrator] failed to start call for lead ${lead.id}`, error);
        await updateLead(lead.id, { status: "no_answer" }).catch(() => {});
        await logMessage({
          jobId,
          direction: "outbound",
          channel: "system",
          body: `Call setup failed for ${lead.name}; continuing with other providers.`,
        }).catch(() => {});
        return false;
      }
    }),
  );
  const dialedCount = callResults.filter(Boolean).length;

  // Fire fallback emails to phone-less leads
  let emailedCount = 0;
  if (emailOnly.length) {
    await updateJob(jobId, { status: "email_fallback" });
    for (const lead of emailOnly) {
      try {
        const ok = await sendFallbackEmailForLead({
          job,
          lead,
          budgetCents,
          timeframe: intentTimeframe,
        });
        await updateLead(lead.id, { status: ok ? "emailed" : "no_answer" });
        if (ok) emailedCount++;
      } catch (error) {
        console.error(`[orchestrator] failed to email lead ${lead.id}`, error);
        await updateLead(lead.id, { status: "no_answer" }).catch(() => {});
      }
    }
    if (emailedCount > 0) {
      await notify(job, `also emailed ${emailedCount} that didn't have a phone listed`);
    }
  }

  if (dialedCount > 0) {
    await notify(job, `dialed ${dialedCount} — i'll text you when they quote`);
  } else if (emailedCount === 0) {
    await updateJob(jobId, { status: "failed" });
    await notify(job, "couldn't get any calls or emails out — reply retry and i'll search again");
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

  // Pull negotiation tactics + referral boost from memory
  const [negHints, referralBoost] = await Promise.all([
    buildNegotiationHints(containerTag, lead.name, job.service ?? "service", job.budget_cents ?? 10000),
    getReferralBoost(containerTag, lead.name),
  ]);

  const enrichmentParts = [lead.notes, negHints, referralBoost].filter(Boolean);
  const ctx: NegotiationContext = {
    jobId: job.id,
    leadId: lead.id,
    service: job.service ?? "service",
    location: job.location ?? "",
    budgetCents: job.budget_cents ?? 10000,
    timeframe: job.timeframe ?? "ASAP",
    userPreferences: [],
    pastProviderNotes: past.summary,
    enrichmentNotes: enrichmentParts.join(" | ") || undefined,
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

  // Record price quote for future intel
  if (result.quotedPriceCents) {
    await recordQuote(containerTag, job.service ?? "service", lead.name, result.quotedPriceCents);
  }

  // Infer and record negotiation tactics from the transcript
  const inferredTactics = inferTacticsFromTranscript(
    args.transcript,
    result.outcome,
    result.quotedPriceCents,
    job.budget_cents ?? 10000,
  );
  for (const t of inferredTactics.tactics) {
    await recordTactic(containerTag, lead.name, job.service ?? "service", t.description, t.worked);
  }

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
  await sendUserMessage(
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
      await sendUserMessage(job.conversation_id, `card charge failed — ${result.error ?? "try again?"}`, user?.phone);
      return;
    }
    // Card flow sends user to onramp URL
    if (result.onrampUrl) {
      await sendUserMessage(job.conversation_id, `tap here to pay with card:\n${result.onrampUrl}`, user?.phone);
    }
  } else {
    const result = await lockEscrowFromUsdc(amount);
    if (!result.ok) {
      await sendUserMessage(job.conversation_id, `usdc transfer failed — ${result.error ?? "check balance?"}`, user?.phone);
      await updateJob(jobId, { status: "failed" });
      return;
    }
  }

  // Funds locked — notify user
  await sendUserMessage(
    job.conversation_id,
    `$${amount.toFixed(0)} locked in escrow. ${lead.name.toLowerCase()} is confirmed.\ni'll release payment once you tell me the job's done.`,
    user?.phone,
  );
  await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: `Escrow locked: $${amount.toFixed(0)}` });

  // Send payout link to provider
  const payoutUrl = buildPayoutUrl(escrow.payout_token, env.PUBLIC_BASE_URL);
  if (lead.payment_method === "ach" && lead.phone) {
    await sendUserMessage(
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
      await sendUserMessage(
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

    // Build price context for the user
    const priceCtx = user ? await buildPriceContext(user.container_tag, job.service ?? "service", escrow.amount_cents) : null;
    const priceNote = priceCtx ? `\n${priceCtx}` : "";

    await sendUserMessage(
      job.conversation_id,
      `done — $${amount.toFixed(0)} released to ${lead.name.toLowerCase()} via ${methodLabel}.${txInfo ? `\n${txInfo}` : ""}${priceNote}`,
      user?.phone,
      user?.preferred_from_number ?? undefined,
    );

    if (user) {
      const today = new Date().toISOString().split("T")[0];

      // Record booking for loyalty system
      await recordBooking(
        user.container_tag,
        job.service ?? "service",
        lead.name,
        escrow.amount_cents,
        lead.phone,
        lead.email,
      );

      // Record service interval for proactive reminders
      await recordServiceInterval(user.container_tag, job.service ?? "service");

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

      // Ask for feedback after a short delay (sent as next message)
      const ratingMsg = askForRating(job.service ?? "service", lead.name);
      await sendUserMessage(job.conversation_id, ratingMsg, user.phone);
      await logMessage({ jobId: job.id, direction: "outbound", channel: "imessage", body: ratingMsg });
    }
  } else {
    await sendUserMessage(
      job.conversation_id,
      `payment release failed — ${txInfo || "not sure why"}. want me to retry?`,
      user?.phone,
      user?.preferred_from_number ?? undefined,
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
    await sendUserMessage(job.conversation_id, `refunding $${amount.toFixed(0)} — job cancelled`, user?.phone);
    return;
  }

  const result = await refundEscrow(amount, userAddress);
  if (result.ok) {
    await updateEscrowPayment(escrow.id, { status: "refunded", release_tx_hash: result.txHash ?? null });
    await updateJob(jobId, { status: "failed" });
    await sendUserMessage(job.conversation_id, `refunded $${amount.toFixed(0)} back to your wallet`, user?.phone);
  } else {
    await sendUserMessage(job.conversation_id, `refund failed — ${result.error ?? "will retry"}`, user?.phone);
  }
}
