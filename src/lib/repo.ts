import { api } from "../../convex/_generated/api";
import { convexClient } from "./convexClient";
import type {
  BrowserEventRow,
  BrowserSessionRow,
  CallRow,
  EmailLeadMatch,
  EmailThread,
  EscrowPayment,
  EscrowStatus,
  Job,
  JobStatus,
  Lead,
  LeadStatus,
  MessageRow,
  PaymentMethod,
  User,
  WatchSnapshot,
} from "./types";
import { createWatchToken } from "./watch";

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
    preferred_from_number: r.preferred_from_number ? String(r.preferred_from_number) : null,
    created_at: Number(r.created_at),
  };
}

function rowToJob(r: JsonRecord): Job {
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    conversation_id: String(r.conversation_id),
    watch_token: r.watch_token ? String(r.watch_token) : null,
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
    payment_method: (r.payment_method as PaymentMethod) ?? null,
    notes: r.notes ? String(r.notes) : null,
    created_at: Number(r.created_at),
  };
}

function rowToEscrowPayment(r: JsonRecord): EscrowPayment {
  return {
    id: Number(r.id),
    job_id: Number(r.job_id),
    lead_id: Number(r.lead_id),
    amount_cents: Number(r.amount_cents),
    funding_source: String(r.funding_source) as "card" | "usdc",
    funding_tx_hash: r.funding_tx_hash ? String(r.funding_tx_hash) : null,
    provider_payout_method: (r.provider_payout_method as PaymentMethod) ?? null,
    provider_payout_account_id: r.provider_payout_account_id ? String(r.provider_payout_account_id) : null,
    release_tx_hash: r.release_tx_hash ? String(r.release_tx_hash) : null,
    status: String(r.status) as EscrowStatus,
    payout_token: String(r.payout_token),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

function rowToMessage(r: JsonRecord): MessageRow {
  return {
    id: Number(r.id),
    job_id: Number(r.job_id),
    direction: String(r.direction) as MessageRow["direction"],
    channel: String(r.channel) as MessageRow["channel"],
    body: String(r.body),
    created_at: Number(r.created_at),
  };
}

function rowToCall(r: JsonRecord): CallRow {
  return {
    id: Number(r.id),
    lead_id: Number(r.lead_id),
    job_id: Number(r.job_id),
    agentphone_call_id: r.agentphone_call_id ? String(r.agentphone_call_id) : null,
    transcript_json: r.transcript_json ? String(r.transcript_json) : null,
    outcome: r.outcome ? String(r.outcome) : null,
    quoted_price_cents: r.quoted_price_cents !== null ? Number(r.quoted_price_cents) : null,
    created_at: Number(r.created_at),
    ended_at: r.ended_at !== null ? Number(r.ended_at) : null,
  };
}

function rowToBrowserSession(r: JsonRecord): BrowserSessionRow {
  return {
    id: Number(r.id),
    job_id: Number(r.job_id),
    label: String(r.label),
    phase: String(r.phase),
    browser_use_session_id: r.browser_use_session_id ? String(r.browser_use_session_id) : null,
    live_url: r.live_url ? String(r.live_url) : null,
    share_url: r.share_url ? String(r.share_url) : null,
    status: String(r.status),
    step_count: Number(r.step_count),
    last_step_summary: r.last_step_summary ? String(r.last_step_summary) : null,
    screenshot_url: r.screenshot_url ? String(r.screenshot_url) : null,
    error: r.error ? String(r.error) : null,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

function rowToBrowserEvent(r: JsonRecord): BrowserEventRow {
  return {
    id: Number(r.id),
    job_id: Number(r.job_id),
    browser_session_id: Number(r.browser_session_id),
    external_message_id: r.external_message_id ? String(r.external_message_id) : null,
    type: String(r.type),
    summary: String(r.summary),
    screenshot_url: r.screenshot_url ? String(r.screenshot_url) : null,
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

export async function getOrCreateUser(
  phone: string,
  preferredFromNumber?: string | null,
): Promise<User> {
  const row = await convexClient().mutation(api.repo.getOrCreateUser, {
    phone,
    ...(preferredFromNumber !== undefined ? { preferredFromNumber } : {}),
  });
  return rowToUser(row as JsonRecord);
}

export async function getUserByConversation(conversationId: string): Promise<User | null> {
  const row = await convexClient().query(api.repo.getUserByConversation, { conversationId });
  return row ? rowToUser(row as JsonRecord) : null;
}

export async function setUserPreferredFromNumber(
  phone: string,
  fromNumber: string | null,
): Promise<void> {
  await convexClient().mutation(api.repo.setUserPreferredFromNumber, {
    phone,
    fromNumber,
  });
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
  const row = await convexClient().mutation(api.repo.createJob, {
    ...args,
    watchToken: createWatchToken(),
  });
  return rowToJob(row as JsonRecord);
}

export async function updateJob(
  id: number,
  patch: Partial<
    Pick<
      Job,
      | "status"
      | "service"
      | "location"
      | "budget_cents"
      | "timeframe"
      | "winning_lead_id"
      | "intent_raw"
    >
  >,
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

export async function getJobByWatchToken(token: string): Promise<Job | null> {
  const row = await convexClient().query(api.repo.getJobByWatchToken, { token });
  return row ? rowToJob(row as JsonRecord) : null;
}

export async function insertLead(args: Omit<Lead, "id" | "created_at">): Promise<Lead> {
  const row = await convexClient().mutation(api.repo.insertLead, {
    ...args,
    payment_method: args.payment_method ?? null,
  });
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

export async function createBrowserSession(args: {
  jobId: number;
  label: string;
  phase: string;
  browserUseSessionId: string | null;
  liveUrl: string | null;
  shareUrl?: string | null;
  status: string;
  stepCount: number;
  lastStepSummary: string | null;
  screenshotUrl: string | null;
}): Promise<BrowserSessionRow> {
  const row = await convexClient().mutation(api.repo.createBrowserSession, args);
  return rowToBrowserSession(row as JsonRecord);
}

export async function updateBrowserSession(
  id: number,
  patch: Partial<Pick<BrowserSessionRow, "live_url" | "share_url" | "status" | "step_count" | "last_step_summary" | "screenshot_url" | "error">>,
): Promise<void> {
  await convexClient().mutation(api.repo.updateBrowserSession, {
    id,
    patch: compact(patch as JsonRecord),
  });
}

export async function recordBrowserEvent(args: {
  jobId: number;
  browserSessionId: number;
  externalMessageId: string | null;
  type: string;
  summary: string;
  screenshotUrl: string | null;
  createdAt: number;
}): Promise<BrowserEventRow> {
  const row = await convexClient().mutation(api.repo.recordBrowserEvent, args);
  return rowToBrowserEvent(row as JsonRecord);
}

export async function getWatchSnapshot(token: string): Promise<WatchSnapshot | null> {
  const row = await convexClient().query(api.repo.getWatchSnapshot, { token });
  if (!row) return null;
  const snapshot = row as JsonRecord;
  return {
    job: rowToJob(snapshot.job as JsonRecord),
    leads: (snapshot.leads as JsonRecord[]).map(rowToLead),
    calls: (snapshot.calls as JsonRecord[]).map(rowToCall),
    messages: (snapshot.messages as JsonRecord[]).map(rowToMessage),
    browserSessions: (snapshot.browserSessions as JsonRecord[]).map(rowToBrowserSession),
    browserEvents: (snapshot.browserEvents as JsonRecord[]).map(rowToBrowserEvent),
  };
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

export async function claimWebhookDelivery(args: {
  deliveryId: string;
  source: string;
  event: string | null;
}): Promise<boolean> {
  return Boolean(
    await convexClient().mutation(api.repo.claimWebhookDelivery, args),
  );
}

export async function appendWebChatMessage(args: {
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string;
}): Promise<void> {
  await convexClient().mutation(api.repo.appendWebChatMessage, args);
}

export interface WebChatMessage {
  direction: "inbound" | "outbound";
  body: string;
  created_at: number;
}

export async function listWebChatMessages(
  conversationId: string,
  sinceMs?: number,
): Promise<WebChatMessage[]> {
  const rows = await convexClient().query(api.repo.listWebChatMessages, {
    conversationId,
    ...(sinceMs !== undefined ? { sinceMs } : {}),
  });
  return (rows as JsonRecord[]).map((r) => ({
    direction: String(r.direction) as "inbound" | "outbound",
    body: String(r.body),
    created_at: Number(r.created_at),
  }));
}

export async function findCallByAgentphoneId(
  agentphoneCallId: string,
): Promise<{ id: number; leadId: number; jobId: number } | null> {
  const row = await convexClient().query(api.repo.findCallByAgentphoneId, { agentphoneCallId });
  if (!row) return null;
  const call = row as JsonRecord;
  return { id: Number(call.id), leadId: Number(call.leadId), jobId: Number(call.jobId) };
}

export async function appendConversationMessage(
  conversationId: string,
  role: "user" | "assistant",
  text: string,
): Promise<void> {
  await convexClient().mutation(api.repo.appendConversationMessage, { conversationId, role, text });
}

export async function getRecentMessages(
  conversationId: string,
): Promise<{ role: "user" | "assistant"; text: string }[]> {
  const rows = await convexClient().query(api.repo.getRecentMessages, { conversationId });
  return rows as { role: "user" | "assistant"; text: string }[];
}

export async function createEscrowPayment(args: {
  jobId: number;
  leadId: number;
  amountCents: number;
  fundingSource: "card" | "usdc";
  fundingTxHash: string | null;
  providerPayoutMethod: PaymentMethod;
  payoutToken: string;
}): Promise<EscrowPayment> {
  const row = await convexClient().mutation(api.repo.createEscrowPayment, args);
  return rowToEscrowPayment(row as JsonRecord);
}

export async function getEscrowByPayoutToken(payoutToken: string): Promise<{
  escrow: EscrowPayment;
  lead: Lead | null;
  job: Job | null;
} | null> {
  const row = await convexClient().query(api.repo.getEscrowByPayoutToken, { payoutToken });
  if (!row) return null;
  const data = row as JsonRecord;
  return {
    escrow: rowToEscrowPayment(data.escrow as JsonRecord),
    lead: data.lead ? rowToLead(data.lead as JsonRecord) : null,
    job: data.job ? rowToJob(data.job as JsonRecord) : null,
  };
}

export async function getEscrowByJobId(jobId: number): Promise<EscrowPayment | null> {
  const row = await convexClient().query(api.repo.getEscrowByJobId, { jobId });
  return row ? rowToEscrowPayment(row as JsonRecord) : null;
}

export async function updateEscrowPayment(
  id: number,
  patch: Partial<Pick<EscrowPayment, "status" | "provider_payout_account_id" | "provider_payout_method" | "release_tx_hash">>,
): Promise<void> {
  await convexClient().mutation(api.repo.updateEscrowPayment, {
    id,
    patch: compact(patch as JsonRecord),
  });
}

// --- Call turns (persisted across serverless instances) ---

export async function appendCallTurn(
  callId: string,
  role: "agent" | "lead",
  text: string,
): Promise<void> {
  await convexClient().mutation(api.repo.appendCallTurn, { callId, role, text });
}

export async function getCallTurns(
  callId: string,
): Promise<{ role: "agent" | "lead"; text: string }[]> {
  const rows = await convexClient().query(api.repo.getCallTurns, { callId });
  return rows as { role: "agent" | "lead"; text: string }[];
}

export async function deleteCallTurns(callId: string): Promise<void> {
  await convexClient().mutation(api.repo.deleteCallTurns, { callId });
}
