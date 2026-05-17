import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

type UserDoc = {
  legacyId: number;
  phone: string;
  container_tag: string;
  sponge_wallet_address: string | null;
  created_at: number;
};

type JobDoc = {
  legacyId: number;
  user_id: number;
  conversation_id: string;
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
  notes: string | null;
  created_at: number;
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
    created_at: doc.created_at,
  };
}

function jobRow(doc: JobDoc) {
  return {
    id: doc.legacyId,
    user_id: doc.user_id,
    conversation_id: doc.conversation_id,
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
    notes: doc.notes,
    created_at: doc.created_at,
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
      created_at: t,
    };
    await ctx.db.insert("users", doc);
    return userRow(doc);
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
  args: { userId: v.number(), conversationId: v.string(), intentRaw: v.string() },
  handler: async (ctx, args) => {
    const t = now();
    const doc = {
      legacyId: await nextLegacyId(ctx, "jobs"),
      user_id: args.userId,
      conversation_id: args.conversationId,
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
    notes: nullableString,
  },
  handler: async (ctx, args) => {
    const doc = {
      legacyId: await nextLegacyId(ctx, "leads"),
      ...args,
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
