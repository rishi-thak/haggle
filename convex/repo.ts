import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

type UserDoc = {
  legacyId: number;
  phone: string;
  container_tag: string;
  sponge_wallet_address: string | null;
  preferred_from_number?: string | null;
  created_at: number;
};

type JobDoc = {
  legacyId: number;
  user_id: number;
  conversation_id: string;
  watch_token?: string | null;
  intent_raw: string;
  service: string | null;
  location: string | null;
  budget_cents: number | null;
  timeframe: string | null;
  status: string;
  winning_lead_id: number | null;
  created_at: number;
  updated_at: number;
};

type LeadDoc = {
  legacyId: number;
  job_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  rating: number | null;
  source_url: string | null;
  rank_score: number | null;
  status: string;
  quoted_price_cents: number | null;
  payment_method: string | null;
  notes: string | null;
  created_at: number;
};

type EscrowPaymentDoc = {
  legacyId: number;
  job_id: number;
  lead_id: number;
  amount_cents: number;
  funding_source: string;
  funding_tx_hash: string | null;
  provider_payout_method: string | null;
  provider_payout_account_id: string | null;
  release_tx_hash: string | null;
  status: string;
  payout_token: string;
  created_at: number;
  updated_at: number;
};

type CallDoc = {
  legacyId: number;
  lead_id: number;
  job_id: number;
  agentphone_call_id: string | null;
  transcript_json: string | null;
  outcome: string | null;
  quoted_price_cents: number | null;
  created_at: number;
  ended_at: number | null;
};

type MessageDoc = {
  legacyId: number;
  job_id: number;
  direction: string;
  channel: string;
  body: string;
  created_at: number;
};

type BrowserSessionDoc = {
  legacyId: number;
  job_id: number;
  label: string;
  phase: string;
  browser_use_session_id: string | null;
  live_url: string | null;
  status: string;
  step_count: number;
  last_step_summary: string | null;
  screenshot_url: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};

type BrowserEventDoc = {
  legacyId: number;
  job_id: number;
  browser_session_id: number;
  external_message_id: string | null;
  type: string;
  summary: string;
  screenshot_url: string | null;
  created_at: number;
};

type EmailThreadDoc = {
  legacyId: number;
  job_id: number;
  lead_id: number;
  inbox_id: string | null;
  thread_id: string | null;
  outbound_message_id: string | null;
  last_inbound_message_id: string | null;
  provider_email: string | null;
  provider_name: string | null;
  subject: string | null;
  created_at: number;
  updated_at: number;
  last_outbound_at: number;
  last_inbound_at: number | null;
};

function now(): number {
  return Date.now();
}

async function nextLegacyId(ctx: MutationCtx, name: string): Promise<number> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!existing) {
    await ctx.db.insert("counters", { name, value: 1 });
    return 1;
  }
  const value = existing.value + 1;
  await ctx.db.patch(existing._id, { value });
  return value;
}

function userRow(doc: UserDoc) {
  return {
    id: doc.legacyId,
    phone: doc.phone,
    container_tag: doc.container_tag,
    sponge_wallet_address: doc.sponge_wallet_address,
    preferred_from_number: doc.preferred_from_number ?? null,
    created_at: doc.created_at,
  };
}

function jobRow(doc: JobDoc) {
  return {
    id: doc.legacyId,
    user_id: doc.user_id,
    conversation_id: doc.conversation_id,
    watch_token: doc.watch_token ?? null,
    intent_raw: doc.intent_raw,
    service: doc.service,
    location: doc.location,
    budget_cents: doc.budget_cents,
    timeframe: doc.timeframe,
    status: doc.status,
    winning_lead_id: doc.winning_lead_id,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

function leadRow(doc: LeadDoc) {
  return {
    id: doc.legacyId,
    job_id: doc.job_id,
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
    address: doc.address,
    rating: doc.rating,
    source_url: doc.source_url,
    rank_score: doc.rank_score,
    status: doc.status,
    quoted_price_cents: doc.quoted_price_cents,
    payment_method: doc.payment_method,
    notes: doc.notes,
    created_at: doc.created_at,
  };
}

function escrowPaymentRow(doc: EscrowPaymentDoc) {
  return {
    id: doc.legacyId,
    job_id: doc.job_id,
    lead_id: doc.lead_id,
    amount_cents: doc.amount_cents,
    funding_source: doc.funding_source,
    funding_tx_hash: doc.funding_tx_hash,
    provider_payout_method: doc.provider_payout_method,
    provider_payout_account_id: doc.provider_payout_account_id,
    release_tx_hash: doc.release_tx_hash,
    status: doc.status,
    payout_token: doc.payout_token,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

function callRow(doc: CallDoc) {
  return {
    id: doc.legacyId,
    lead_id: doc.lead_id,
    job_id: doc.job_id,
    agentphone_call_id: doc.agentphone_call_id,
    transcript_json: doc.transcript_json,
    outcome: doc.outcome,
    quoted_price_cents: doc.quoted_price_cents,
    created_at: doc.created_at,
    ended_at: doc.ended_at,
  };
}

function messageRow(doc: MessageDoc) {
  return {
    id: doc.legacyId,
    job_id: doc.job_id,
    direction: doc.direction,
    channel: doc.channel,
    body: doc.body,
    created_at: doc.created_at,
  };
}

function browserSessionRow(doc: BrowserSessionDoc) {
  return {
    id: doc.legacyId,
    job_id: doc.job_id,
    label: doc.label,
    phase: doc.phase,
    browser_use_session_id: doc.browser_use_session_id,
    live_url: doc.live_url,
    status: doc.status,
    step_count: doc.step_count,
    last_step_summary: doc.last_step_summary,
    screenshot_url: doc.screenshot_url,
    error: doc.error,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

function browserEventRow(doc: BrowserEventDoc) {
  return {
    id: doc.legacyId,
    job_id: doc.job_id,
    browser_session_id: doc.browser_session_id,
    external_message_id: doc.external_message_id,
    type: doc.type,
    summary: doc.summary,
    screenshot_url: doc.screenshot_url,
    created_at: doc.created_at,
  };
}

function emailThreadRow(doc: EmailThreadDoc) {
  return {
    id: doc.legacyId,
    job_id: doc.job_id,
    lead_id: doc.lead_id,
    inbox_id: doc.inbox_id,
    thread_id: doc.thread_id,
    outbound_message_id: doc.outbound_message_id,
    last_inbound_message_id: doc.last_inbound_message_id,
    provider_email: doc.provider_email,
    provider_name: doc.provider_name,
    subject: doc.subject,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    last_outbound_at: doc.last_outbound_at,
    last_inbound_at: doc.last_inbound_at,
  };
}

async function getUserDocByLegacyId(ctx: QueryCtx | MutationCtx, id: number) {
  return await ctx.db
    .query("users")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", id))
    .unique();
}

async function getJobDocByLegacyId(ctx: QueryCtx | MutationCtx, id: number) {
  return await ctx.db
    .query("jobs")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", id))
    .unique();
}

async function getLeadDocByLegacyId(ctx: QueryCtx | MutationCtx, id: number) {
  return await ctx.db
    .query("leads")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", id))
    .unique();
}

async function getEmailThreadDocByLegacyId(ctx: QueryCtx | MutationCtx, id: number) {
  return await ctx.db
    .query("email_threads")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", id))
    .unique();
}

export const getOrCreateUser = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    if (existing) return userRow(existing);

    const t = now();
    const doc = {
      legacyId: await nextLegacyId(ctx, "users"),
      phone: args.phone,
      container_tag: `user_${args.phone.replace(/[^0-9]/g, "")}`,
      sponge_wallet_address: null,
      preferred_from_number: null,
      created_at: t,
    };
    await ctx.db.insert("users", doc);
    return userRow(doc);
  },
});

export const setUserPreferredFromNumber = mutation({
  args: { phone: v.string(), fromNumber: nullableString },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    if (!existing) return null;
    if ((existing.preferred_from_number ?? null) === args.fromNumber) return null;
    await ctx.db.patch(existing._id, { preferred_from_number: args.fromNumber });
    return null;
  },
});

export const getUserByConversation = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_conversation_id", (q) => q.eq("conversation_id", args.conversationId))
      .collect();
    const latest = jobs.sort((a, b) => b.legacyId - a.legacyId)[0];
    if (!latest) return null;
    const user = await getUserDocByLegacyId(ctx, latest.user_id);
    return user ? userRow(user) : null;
  },
});

export const getUserByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    return user ? userRow(user) : null;
  },
});

export const findActiveJobByConversation = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_conversation_id", (q) => q.eq("conversation_id", args.conversationId))
      .collect();
    const latest = jobs.sort((a, b) => b.legacyId - a.legacyId)[0];
    return latest ? jobRow(latest) : null;
  },
});

export const createJob = mutation({
  args: { userId: v.number(), conversationId: v.string(), intentRaw: v.string(), watchToken: v.string() },
  handler: async (ctx, args) => {
    const t = now();
    const doc = {
      legacyId: await nextLegacyId(ctx, "jobs"),
      user_id: args.userId,
      conversation_id: args.conversationId,
      watch_token: args.watchToken,
      intent_raw: args.intentRaw,
      service: null,
      location: null,
      budget_cents: null,
      timeframe: null,
      status: "new",
      winning_lead_id: null,
      created_at: t,
      updated_at: t,
    };
    await ctx.db.insert("jobs", doc);
    return jobRow(doc);
  },
});

export const updateJob = mutation({
  args: {
    id: v.number(),
    patch: v.object({
      status: v.optional(v.string()),
      service: v.optional(nullableString),
      location: v.optional(nullableString),
      budget_cents: v.optional(nullableNumber),
      timeframe: v.optional(nullableString),
      winning_lead_id: v.optional(nullableNumber),
      intent_raw: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const job = await getJobDocByLegacyId(ctx, args.id);
    if (!job) return null;
    await ctx.db.patch(job._id, { ...args.patch, updated_at: now() });
    return null;
  },
});

export const getJob = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const job = await getJobDocByLegacyId(ctx, args.id);
    return job ? jobRow(job) : null;
  },
});

export const getJobByWatchToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_watch_token", (q) => q.eq("watch_token", args.token))
      .unique();
    return job ? jobRow(job) : null;
  },
});

export const insertLead = mutation({
  args: {
    job_id: v.number(),
    name: v.string(),
    phone: nullableString,
    email: nullableString,
    address: nullableString,
    rating: nullableNumber,
    source_url: nullableString,
    rank_score: nullableNumber,
    status: v.string(),
    quoted_price_cents: nullableNumber,
    payment_method: v.optional(nullableString),
    notes: nullableString,
  },
  handler: async (ctx, args) => {
    const doc = {
      legacyId: await nextLegacyId(ctx, "leads"),
      ...args,
      payment_method: args.payment_method ?? null,
      created_at: now(),
    };
    await ctx.db.insert("leads", doc);
    return leadRow(doc);
  },
});

export const updateLead = mutation({
  args: {
    id: v.number(),
    patch: v.object({
      job_id: v.optional(v.number()),
      name: v.optional(v.string()),
      phone: v.optional(nullableString),
      email: v.optional(nullableString),
      address: v.optional(nullableString),
      rating: v.optional(nullableNumber),
      source_url: v.optional(nullableString),
      rank_score: v.optional(nullableNumber),
      status: v.optional(v.string()),
      quoted_price_cents: v.optional(nullableNumber),
      payment_method: v.optional(nullableString),
      notes: v.optional(nullableString),
    }),
  },
  handler: async (ctx, args) => {
    const lead = await getLeadDocByLegacyId(ctx, args.id);
    if (!lead) return null;
    await ctx.db.patch(lead._id, args.patch);
    return null;
  },
});

export const getLead = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const lead = await getLeadDocByLegacyId(ctx, args.id);
    return lead ? leadRow(lead) : null;
  },
});

export const listLeads = query({
  args: { jobId: v.number() },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_job_id", (q) => q.eq("job_id", args.jobId))
      .collect();
    return leads
      .sort((a, b) => {
        const ar = a.rank_score ?? -Infinity;
        const br = b.rank_score ?? -Infinity;
        if (br !== ar) return br - ar;
        return a.legacyId - b.legacyId;
      })
      .map(leadRow);
  },
});

export const logMessage = mutation({
  args: {
    jobId: v.number(),
    direction: v.string(),
    channel: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      legacyId: await nextLegacyId(ctx, "messages"),
      job_id: args.jobId,
      direction: args.direction,
      channel: args.channel,
      body: args.body,
      created_at: now(),
    });
    return null;
  },
});

export const createBrowserSession = mutation({
  args: {
    jobId: v.number(),
    label: v.string(),
    phase: v.string(),
    browserUseSessionId: nullableString,
    liveUrl: nullableString,
    status: v.string(),
    stepCount: v.number(),
    lastStepSummary: nullableString,
    screenshotUrl: nullableString,
  },
  handler: async (ctx, args) => {
    const t = now();
    const existing = args.browserUseSessionId
      ? await ctx.db
          .query("browser_sessions")
          .withIndex("by_browser_use_session_id", (q) =>
            q.eq("browser_use_session_id", args.browserUseSessionId),
          )
          .unique()
      : null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        phase: args.phase,
        live_url: args.liveUrl,
        status: args.status,
        step_count: args.stepCount,
        last_step_summary: args.lastStepSummary,
        screenshot_url: args.screenshotUrl,
        updated_at: t,
      });
      return browserSessionRow({
        ...existing,
        label: args.label,
        phase: args.phase,
        live_url: args.liveUrl,
        status: args.status,
        step_count: args.stepCount,
        last_step_summary: args.lastStepSummary,
        screenshot_url: args.screenshotUrl,
        updated_at: t,
      });
    }

    const doc = {
      legacyId: await nextLegacyId(ctx, "browser_sessions"),
      job_id: args.jobId,
      label: args.label,
      phase: args.phase,
      browser_use_session_id: args.browserUseSessionId,
      live_url: args.liveUrl,
      status: args.status,
      step_count: args.stepCount,
      last_step_summary: args.lastStepSummary,
      screenshot_url: args.screenshotUrl,
      error: null,
      created_at: t,
      updated_at: t,
    };
    await ctx.db.insert("browser_sessions", doc);
    return browserSessionRow(doc);
  },
});

export const updateBrowserSession = mutation({
  args: {
    id: v.number(),
    patch: v.object({
      live_url: v.optional(nullableString),
      status: v.optional(v.string()),
      step_count: v.optional(v.number()),
      last_step_summary: v.optional(nullableString),
      screenshot_url: v.optional(nullableString),
      error: v.optional(nullableString),
    }),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("browser_sessions")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (!session) return null;
    await ctx.db.patch(session._id, { ...args.patch, updated_at: now() });
    return null;
  },
});

export const recordBrowserEvent = mutation({
  args: {
    jobId: v.number(),
    browserSessionId: v.number(),
    externalMessageId: nullableString,
    type: v.string(),
    summary: v.string(),
    screenshotUrl: nullableString,
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.externalMessageId) {
      const existing = await ctx.db
        .query("browser_events")
        .withIndex("by_external_message_id", (q) => q.eq("external_message_id", args.externalMessageId))
        .first();
      if (existing) return browserEventRow(existing);
    }

    const doc = {
      legacyId: await nextLegacyId(ctx, "browser_events"),
      job_id: args.jobId,
      browser_session_id: args.browserSessionId,
      external_message_id: args.externalMessageId,
      type: args.type,
      summary: args.summary,
      screenshot_url: args.screenshotUrl,
      created_at: args.createdAt,
    };
    await ctx.db.insert("browser_events", doc);
    return browserEventRow(doc);
  },
});

export const getWatchSnapshot = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_watch_token", (q) => q.eq("watch_token", args.token))
      .unique();
    if (!job) return null;

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_job_id", (q) => q.eq("job_id", job.legacyId))
      .take(50);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_job_id", (q) => q.eq("job_id", job.legacyId))
      .take(50);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_job_id", (q) => q.eq("job_id", job.legacyId))
      .take(100);
    const browserSessions = await ctx.db
      .query("browser_sessions")
      .withIndex("by_job_id", (q) => q.eq("job_id", job.legacyId))
      .take(20);
    const browserEvents = await ctx.db
      .query("browser_events")
      .withIndex("by_job_id", (q) => q.eq("job_id", job.legacyId))
      .take(200);

    return {
      job: jobRow(job),
      leads: leads
        .sort((a, b) => {
          const ar = a.rank_score ?? -Infinity;
          const br = b.rank_score ?? -Infinity;
          if (br !== ar) return br - ar;
          return a.legacyId - b.legacyId;
        })
        .map(leadRow),
      calls: calls.sort((a, b) => b.created_at - a.created_at).map(callRow),
      messages: messages.sort((a, b) => b.created_at - a.created_at).map(messageRow),
      browserSessions: browserSessions.sort((a, b) => b.updated_at - a.updated_at).map(browserSessionRow),
      browserEvents: browserEvents.sort((a, b) => b.created_at - a.created_at).map(browserEventRow),
    };
  },
});

export const recordCallStart = mutation({
  args: { jobId: v.number(), leadId: v.number(), agentphoneCallId: v.string() },
  handler: async (ctx, args) => {
    const id = await nextLegacyId(ctx, "calls");
    await ctx.db.insert("calls", {
      legacyId: id,
      lead_id: args.leadId,
      job_id: args.jobId,
      agentphone_call_id: args.agentphoneCallId,
      transcript_json: null,
      outcome: null,
      quoted_price_cents: null,
      created_at: now(),
      ended_at: null,
    });
    return id;
  },
});

export const recordCallEnd = mutation({
  args: {
    agentphoneCallId: v.string(),
    outcome: v.string(),
    transcript: v.string(),
    quotedPriceCents: nullableNumber,
  },
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("calls")
      .withIndex("by_agentphone_call_id", (q) => q.eq("agentphone_call_id", args.agentphoneCallId))
      .first();
    if (!call || call.ended_at !== null) return null;
    await ctx.db.patch(call._id, {
      outcome: args.outcome,
      transcript_json: args.transcript,
      quoted_price_cents: args.quotedPriceCents,
      ended_at: now(),
    });
    return { leadId: call.lead_id, jobId: call.job_id };
  },
});

export const markJobAwaitingConfirmIfOpen = mutation({
  args: { jobId: v.number(), winningLeadId: v.number() },
  handler: async (ctx, args) => {
    const job = await getJobDocByLegacyId(ctx, args.jobId);
    if (
      !job ||
      job.winning_lead_id !== null ||
      ["awaiting_confirm", "paying", "complete", "failed"].includes(job.status)
    ) {
      return false;
    }
    await ctx.db.patch(job._id, {
      status: "awaiting_confirm",
      winning_lead_id: args.winningLeadId,
      updated_at: now(),
    });
    return true;
  },
});

export const markJobFailedIfUnresolved = mutation({
  args: { jobId: v.number() },
  handler: async (ctx, args) => {
    const job = await getJobDocByLegacyId(ctx, args.jobId);
    if (
      !job ||
      job.winning_lead_id !== null ||
      ["awaiting_confirm", "paying", "complete", "failed"].includes(job.status)
    ) {
      return false;
    }
    await ctx.db.patch(job._id, { status: "failed", updated_at: now() });
    return true;
  },
});

export const upsertEmailThread = mutation({
  args: {
    jobId: v.number(),
    leadId: v.number(),
    inboxId: nullableString,
    threadId: nullableString,
    outboundMessageId: nullableString,
    providerEmail: nullableString,
    providerName: nullableString,
    subject: nullableString,
  },
  handler: async (ctx, args) => {
    const t = now();
    const existing = args.outboundMessageId
      ? await ctx.db
          .query("email_threads")
          .withIndex("by_outbound_message_id", (q) => q.eq("outbound_message_id", args.outboundMessageId))
          .unique()
      : null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        inbox_id: args.inboxId,
        thread_id: args.threadId,
        provider_email: args.providerEmail,
        provider_name: args.providerName,
        subject: args.subject,
        updated_at: t,
        last_outbound_at: t,
      });
      return emailThreadRow({
        ...existing,
        inbox_id: args.inboxId,
        thread_id: args.threadId,
        provider_email: args.providerEmail,
        provider_name: args.providerName,
        subject: args.subject,
        updated_at: t,
        last_outbound_at: t,
      });
    }

    const doc = {
      legacyId: await nextLegacyId(ctx, "email_threads"),
      job_id: args.jobId,
      lead_id: args.leadId,
      inbox_id: args.inboxId,
      thread_id: args.threadId,
      outbound_message_id: args.outboundMessageId,
      last_inbound_message_id: null,
      provider_email: args.providerEmail,
      provider_name: args.providerName,
      subject: args.subject,
      created_at: t,
      updated_at: t,
      last_outbound_at: t,
      last_inbound_at: null,
    };
    await ctx.db.insert("email_threads", doc);
    return emailThreadRow(doc);
  },
});

async function hydrateEmailLeadMatch(ctx: QueryCtx, emailThread: EmailThreadDoc) {
  const job = await getJobDocByLegacyId(ctx, emailThread.job_id);
  const lead = await getLeadDocByLegacyId(ctx, emailThread.lead_id);
  if (!job || !lead) return null;
  return {
    job: jobRow(job),
    lead: leadRow(lead),
    emailThread: emailThreadRow(emailThread),
  };
}

export const findEmailLeadMatch = query({
  args: {
    inboxId: v.optional(nullableString),
    threadId: v.optional(nullableString),
    inReplyTo: v.optional(nullableString),
    providerEmail: v.optional(nullableString),
  },
  handler: async (ctx, args) => {
    if (args.threadId) {
      const thread = await ctx.db
        .query("email_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", args.threadId!))
        .first();
      if (thread) return await hydrateEmailLeadMatch(ctx, thread);
    }

    if (args.inReplyTo) {
      const thread = await ctx.db
        .query("email_threads")
        .withIndex("by_outbound_message_id", (q) => q.eq("outbound_message_id", args.inReplyTo!))
        .first();
      if (thread) return await hydrateEmailLeadMatch(ctx, thread);
    }

    if (args.providerEmail) {
      const threads = await ctx.db
        .query("email_threads")
        .withIndex("by_provider_email", (q) => q.eq("provider_email", args.providerEmail!))
        .collect();
      const matches = (await Promise.all(threads.map((thread) => hydrateEmailLeadMatch(ctx, thread))))
        .filter((match) => match !== null);
      matches.sort((a, b) => {
        const aDone = ["complete", "failed"].includes(a.job.status) ? 1 : 0;
        const bDone = ["complete", "failed"].includes(b.job.status) ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return b.job.updated_at - a.job.updated_at || b.emailThread.updated_at - a.emailThread.updated_at;
      });
      return matches[0] ?? null;
    }

    return null;
  },
});

export const markInboundEmailReceived = mutation({
  args: {
    emailThreadId: v.number(),
    messageId: v.string(),
    threadId: v.optional(nullableString),
  },
  handler: async (ctx, args) => {
    const thread = await getEmailThreadDocByLegacyId(ctx, args.emailThreadId);
    if (!thread || thread.last_inbound_message_id === args.messageId) return false;
    const t = now();
    await ctx.db.patch(thread._id, {
      last_inbound_message_id: args.messageId,
      thread_id: args.threadId ?? thread.thread_id,
      updated_at: t,
      last_inbound_at: t,
    });
    return true;
  },
});

export const findCallByAgentphoneId = query({
  args: { agentphoneCallId: v.string() },
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("calls")
      .withIndex("by_agentphone_call_id", (q) => q.eq("agentphone_call_id", args.agentphoneCallId))
      .first();
    return call ? { id: call.legacyId, leadId: call.lead_id, jobId: call.job_id } : null;
  },
});

export const getCall = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("calls")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    return call ? callRow(call) : null;
  },
});

// --- Conversation Messages ---

export const appendConversationMessage = mutation({
  args: {
    conversationId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("conversation_messages", {
      conversation_id: args.conversationId,
      role: args.role,
      text: args.text,
      created_at: now(),
    });
    return null;
  },
});

export const claimWebhookDelivery = mutation({
  args: {
    deliveryId: v.string(),
    source: v.string(),
    event: nullableString,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhook_deliveries")
      .withIndex("by_delivery_id", (q) => q.eq("delivery_id", args.deliveryId))
      .unique();
    if (existing) return false;
    await ctx.db.insert("webhook_deliveries", {
      delivery_id: args.deliveryId,
      source: args.source,
      event: args.event,
      created_at: now(),
    });
    return true;
  },
});

export const appendWebChatMessage = mutation({
  args: {
    conversationId: v.string(),
    direction: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("web_chat_messages", {
      conversation_id: args.conversationId,
      direction: args.direction,
      body: args.body,
      created_at: now(),
    });
    return null;
  },
});

export const getRecentMessages = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("conversation_messages")
      .withIndex("by_conversation", (q) => q.eq("conversation_id", args.conversationId))
      .order("desc")
      .take(10);
    return messages
      .reverse()
      .map((m) => ({ role: m.role, text: m.text }));
  },
});

// --- Escrow Payments ---

export const createEscrowPayment = mutation({
  args: {
    jobId: v.number(),
    leadId: v.number(),
    amountCents: v.number(),
    fundingSource: v.string(),
    fundingTxHash: nullableString,
    providerPayoutMethod: nullableString,
    payoutToken: v.string(),
  },
  handler: async (ctx, args) => {
    const t = now();
    const doc: EscrowPaymentDoc = {
      legacyId: await nextLegacyId(ctx, "escrow_payments"),
      job_id: args.jobId,
      lead_id: args.leadId,
      amount_cents: args.amountCents,
      funding_source: args.fundingSource,
      funding_tx_hash: args.fundingTxHash,
      provider_payout_method: args.providerPayoutMethod,
      provider_payout_account_id: null,
      release_tx_hash: null,
      status: "held",
      payout_token: args.payoutToken,
      created_at: t,
      updated_at: t,
    };
    await ctx.db.insert("escrow_payments", doc);
    return escrowPaymentRow(doc);
  },
});

export const getEscrowByPayoutToken = query({
  args: { payoutToken: v.string() },
  handler: async (ctx, args) => {
    const escrow = await ctx.db
      .query("escrow_payments")
      .withIndex("by_payout_token", (q) => q.eq("payout_token", args.payoutToken))
      .unique();
    if (!escrow) return null;
    const lead = await getLeadDocByLegacyId(ctx, escrow.lead_id);
    const job = await getJobDocByLegacyId(ctx, escrow.job_id);
    return {
      escrow: escrowPaymentRow(escrow),
      lead: lead ? leadRow(lead) : null,
      job: job ? jobRow(job) : null,
    };
  },
});

export const getEscrowByJobId = query({
  args: { jobId: v.number() },
  handler: async (ctx, args) => {
    const escrow = await ctx.db
      .query("escrow_payments")
      .withIndex("by_job_id", (q) => q.eq("job_id", args.jobId))
      .first();
    return escrow ? escrowPaymentRow(escrow) : null;
  },
});

export const updateEscrowPayment = mutation({
  args: {
    id: v.number(),
    patch: v.object({
      status: v.optional(v.string()),
      provider_payout_account_id: v.optional(nullableString),
      provider_payout_method: v.optional(nullableString),
      release_tx_hash: v.optional(nullableString),
    }),
  },
  handler: async (ctx, args) => {
    const escrow = await ctx.db
      .query("escrow_payments")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.id))
      .unique();
    if (!escrow) return null;
    await ctx.db.patch(escrow._id, { ...args.patch, updated_at: now() });
    return null;
  },
});


export const listWebChatMessages = query({
  args: {
    conversationId: v.string(),
    sinceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("web_chat_messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversation_id", args.conversationId))
      .collect();
    const filtered = args.sinceMs
      ? rows.filter((r) => r.created_at > args.sinceMs!)
      : rows;
    return filtered
      .sort((a, b) => a.created_at - b.created_at)
      .map((r) => ({
        direction: r.direction,
        body: r.body,
        created_at: r.created_at,
      }));
  },
});
