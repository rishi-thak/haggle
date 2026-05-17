import { api } from "../../convex/_generated/api";
import { convexClient } from "./convexClient";
import type {
  EmailLeadMatch,
  EmailThread,
  Job,
  JobStatus,
  Lead,
  LeadStatus,
  User,
} from "./types";

type JsonRecord = Record<string, unknown>;

function compact<T extends JsonRecord>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

function rowToUser(r: JsonRecord): User {
  return {
    id: Number(r.id),
    phone: String(r.phone),
    container_tag: String(r.container_tag),
    sponge_wallet_address: r.sponge_wallet_address ? String(r.sponge_wallet_address) : null,
    created_at: Number(r.created_at),
  };
}

function rowToJob(r: JsonRecord): Job {
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    conversation_id: String(r.conversation_id),
    intent_raw: String(r.intent_raw),
    service: r.service ? String(r.service) : null,
    location: r.location ? String(r.location) : null,
    budget_cents: r.budget_cents !== null ? Number(r.budget_cents) : null,
    timeframe: r.timeframe ? String(r.timeframe) : null,
    status: String(r.status) as JobStatus,
    winning_lead_id: r.winning_lead_id !== null ? Number(r.winning_lead_id) : null,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

function rowToLead(r: JsonRecord): Lead {
  return {
    id: Number(r.id),
    job_id: Number(r.job_id),
    name: String(r.name),
    phone: r.phone ? String(r.phone) : null,
    email: r.email ? String(r.email) : null,
    address: r.address ? String(r.address) : null,
    rating: r.rating !== null ? Number(r.rating) : null,
    source_url: r.source_url ? String(r.source_url) : null,
    rank_score: r.rank_score !== null ? Number(r.rank_score) : null,
    status: String(r.status) as LeadStatus,
    quoted_price_cents: r.quoted_price_cents !== null ? Number(r.quoted_price_cents) : null,
    notes: r.notes ? String(r.notes) : null,
    created_at: Number(r.created_at),
  };
}

function rowToEmailThread(r: JsonRecord): EmailThread {
  return {
    id: Number(r.id),
    job_id: Number(r.job_id),
    lead_id: Number(r.lead_id),
    inbox_id: r.inbox_id ? String(r.inbox_id) : null,
    thread_id: r.thread_id ? String(r.thread_id) : null,
    outbound_message_id: r.outbound_message_id ? String(r.outbound_message_id) : null,
    last_inbound_message_id: r.last_inbound_message_id ? String(r.last_inbound_message_id) : null,
    provider_email: r.provider_email ? String(r.provider_email) : null,
    provider_name: r.provider_name ? String(r.provider_name) : null,
    subject: r.subject ? String(r.subject) : null,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    last_outbound_at: Number(r.last_outbound_at),
    last_inbound_at: r.last_inbound_at !== null ? Number(r.last_inbound_at) : null,
  };
}

function rowToEmailLeadMatch(r: JsonRecord): EmailLeadMatch {
  return {
    job: rowToJob(r.job as JsonRecord),
    lead: rowToLead(r.lead as JsonRecord),
    emailThread: r.emailThread ? rowToEmailThread(r.emailThread as JsonRecord) : null,
  };
}

export async function getOrCreateUser(phone: string): Promise<User> {
  const row = await convexClient().mutation(api.repo.getOrCreateUser, { phone });
  return rowToUser(row as JsonRecord);
}

export async function getUserByConversation(conversationId: string): Promise<User | null> {
  const row = await convexClient().query(api.repo.getUserByConversation, { conversationId });
  return row ? rowToUser(row as JsonRecord) : null;
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const row = await convexClient().query(api.repo.getUserByPhone, { phone });
  return row ? rowToUser(row as JsonRecord) : null;
}

export async function findActiveJobByConversation(conversationId: string): Promise<Job | null> {
  const row = await convexClient().query(api.repo.findActiveJobByConversation, { conversationId });
  return row ? rowToJob(row as JsonRecord) : null;
}

export async function createJob(args: {
  userId: number;
  conversationId: string;
  intentRaw: string;
}): Promise<Job> {
  const row = await convexClient().mutation(api.repo.createJob, args);
  return rowToJob(row as JsonRecord);
}

export async function updateJob(
  id: number,
  patch: Partial<Pick<Job, "status" | "service" | "location" | "budget_cents" | "timeframe" | "winning_lead_id">>,
): Promise<void> {
  await convexClient().mutation(api.repo.updateJob, {
    id,
    patch: compact(patch as JsonRecord),
  });
}

export async function getJob(id: number): Promise<Job | null> {
  const row = await convexClient().query(api.repo.getJob, { id });
  return row ? rowToJob(row as JsonRecord) : null;
}

export async function insertLead(args: Omit<Lead, "id" | "created_at">): Promise<Lead> {
  const row = await convexClient().mutation(api.repo.insertLead, args);
  return rowToLead(row as JsonRecord);
}

export async function updateLead(id: number, patch: Partial<Lead>): Promise<void> {
  const { id: _id, created_at: _createdAt, ...rest } = patch;
  await convexClient().mutation(api.repo.updateLead, {
    id,
    patch: compact(rest as JsonRecord),
  });
}

export async function getLead(id: number): Promise<Lead | null> {
  const row = await convexClient().query(api.repo.getLead, { id });
  return row ? rowToLead(row as JsonRecord) : null;
}

export async function listLeads(jobId: number): Promise<Lead[]> {
  const rows = await convexClient().query(api.repo.listLeads, { jobId });
  return (rows as JsonRecord[]).map(rowToLead);
}

export async function logMessage(args: {
  jobId: number;
  direction: "inbound" | "outbound";
  channel: "imessage" | "voice" | "email" | "system";
  body: string;
}): Promise<void> {
  await convexClient().mutation(api.repo.logMessage, args);
}

export async function recordCallStart(args: {
  jobId: number;
  leadId: number;
  agentphoneCallId: string;
}): Promise<number> {
  return Number(await convexClient().mutation(api.repo.recordCallStart, args));
}

export async function recordCallEnd(args: {
  agentphoneCallId: string;
  outcome: string;
  transcript: string;
  quotedPriceCents?: number | null;
}): Promise<{ leadId: number; jobId: number } | null> {
  const row = await convexClient().mutation(api.repo.recordCallEnd, {
    ...args,
    quotedPriceCents: args.quotedPriceCents ?? null,
  });
  if (!row) return null;
  const match = row as JsonRecord;
  return { leadId: Number(match.leadId), jobId: Number(match.jobId) };
}

export async function markJobAwaitingConfirmIfOpen(jobId: number, winningLeadId: number): Promise<boolean> {
  return Boolean(await convexClient().mutation(api.repo.markJobAwaitingConfirmIfOpen, { jobId, winningLeadId }));
}

export async function markJobFailedIfUnresolved(jobId: number): Promise<boolean> {
  return Boolean(await convexClient().mutation(api.repo.markJobFailedIfUnresolved, { jobId }));
}

export async function upsertEmailThread(args: {
  jobId: number;
  leadId: number;
  inboxId: string | null;
  threadId: string | null;
  outboundMessageId: string | null;
  providerEmail: string | null;
  providerName: string | null;
  subject: string | null;
}): Promise<EmailThread> {
  const row = await convexClient().mutation(api.repo.upsertEmailThread, args);
  return rowToEmailThread(row as JsonRecord);
}

export async function findEmailLeadMatch(args: {
  inboxId?: string | null;
  threadId?: string | null;
  inReplyTo?: string | null;
  providerEmail?: string | null;
}): Promise<EmailLeadMatch | null> {
  const row = await convexClient().query(api.repo.findEmailLeadMatch, compact(args as JsonRecord));
  return row ? rowToEmailLeadMatch(row as JsonRecord) : null;
}

export async function markInboundEmailReceived(args: {
  emailThreadId: number;
  messageId: string;
  threadId?: string | null;
}): Promise<boolean> {
  return Boolean(await convexClient().mutation(api.repo.markInboundEmailReceived, args));
}

export async function findCallByAgentphoneId(
  agentphoneCallId: string,
): Promise<{ id: number; leadId: number; jobId: number } | null> {
  const row = await convexClient().query(api.repo.findCallByAgentphoneId, { agentphoneCallId });
  if (!row) return null;
  const call = row as JsonRecord;
  return { id: Number(call.id), leadId: Number(call.leadId), jobId: Number(call.jobId) };
}
