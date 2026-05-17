import { db, now } from "./db";
import type { EmailLeadMatch, EmailThread, Job, JobStatus, Lead, LeadStatus, User } from "./types";

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: Number(r.id),
    phone: String(r.phone),
    container_tag: String(r.container_tag),
    sponge_wallet_address: r.sponge_wallet_address ? String(r.sponge_wallet_address) : null,
    created_at: Number(r.created_at),
  };
}

function rowToJob(r: Record<string, unknown>): Job {
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

function rowToLead(r: Record<string, unknown>): Lead {
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

function rowToEmailThread(r: Record<string, unknown>): EmailThread {
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

function rowToEmailLeadMatch(r: Record<string, unknown>): EmailLeadMatch {
  return {
    job: rowToJob({
      id: r.job_id,
      user_id: r.job_user_id,
      conversation_id: r.job_conversation_id,
      intent_raw: r.job_intent_raw,
      service: r.job_service,
      location: r.job_location,
      budget_cents: r.job_budget_cents,
      timeframe: r.job_timeframe,
      status: r.job_status,
      winning_lead_id: r.job_winning_lead_id,
      created_at: r.job_created_at,
      updated_at: r.job_updated_at,
    }),
    lead: rowToLead({
      id: r.lead_id,
      job_id: r.lead_job_id,
      name: r.lead_name,
      phone: r.lead_phone,
      email: r.lead_email,
      address: r.lead_address,
      rating: r.lead_rating,
      source_url: r.lead_source_url,
      rank_score: r.lead_rank_score,
      status: r.lead_status,
      quoted_price_cents: r.lead_quoted_price_cents,
      notes: r.lead_notes,
      created_at: r.lead_created_at,
    }),
    emailThread: r.email_thread_id === null
      ? null
      : rowToEmailThread({
          id: r.email_thread_id,
          job_id: r.email_thread_job_id,
          lead_id: r.email_thread_lead_id,
          inbox_id: r.email_thread_inbox_id,
          thread_id: r.email_thread_thread_id,
          outbound_message_id: r.email_thread_outbound_message_id,
          last_inbound_message_id: r.email_thread_last_inbound_message_id,
          provider_email: r.email_thread_provider_email,
          provider_name: r.email_thread_provider_name,
          subject: r.email_thread_subject,
          created_at: r.email_thread_created_at,
          updated_at: r.email_thread_updated_at,
          last_outbound_at: r.email_thread_last_outbound_at,
          last_inbound_at: r.email_thread_last_inbound_at,
        }),
  };
}

export async function getOrCreateUser(phone: string): Promise<User> {
  const c = db();
  const existing = await c.execute({
    sql: "SELECT * FROM users WHERE phone = ?",
    args: [phone],
  });
  if (existing.rows.length) return rowToUser(existing.rows[0] as Record<string, unknown>);
  const containerTag = `user_${phone.replace(/[^0-9]/g, "")}`;
  const created = now();
  const res = await c.execute({
    sql: "INSERT INTO users (phone, container_tag, created_at) VALUES (?, ?, ?) RETURNING *",
    args: [phone, containerTag, created],
  });
  return rowToUser(res.rows[0] as Record<string, unknown>);
}

export async function getUserByConversation(conversationId: string): Promise<User | null> {
  const c = db();
  const r = await c.execute({
    sql: `SELECT u.* FROM users u JOIN jobs j ON j.user_id = u.id WHERE j.conversation_id = ? LIMIT 1`,
    args: [conversationId],
  });
  return r.rows.length ? rowToUser(r.rows[0] as Record<string, unknown>) : null;
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const c = db();
  const r = await c.execute({ sql: "SELECT * FROM users WHERE phone = ?", args: [phone] });
  return r.rows.length ? rowToUser(r.rows[0] as Record<string, unknown>) : null;
}

export async function findActiveJobByConversation(conversationId: string): Promise<Job | null> {
  const c = db();
  const r = await c.execute({
    sql: "SELECT * FROM jobs WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
    args: [conversationId],
  });
  return r.rows.length ? rowToJob(r.rows[0] as Record<string, unknown>) : null;
}

export async function createJob(args: {
  userId: number;
  conversationId: string;
  intentRaw: string;
}): Promise<Job> {
  const c = db();
  const t = now();
  const res = await c.execute({
    sql: `INSERT INTO jobs (user_id, conversation_id, intent_raw, status, created_at, updated_at)
          VALUES (?, ?, ?, 'new', ?, ?) RETURNING *`,
    args: [args.userId, args.conversationId, args.intentRaw, t, t],
  });
  return rowToJob(res.rows[0] as Record<string, unknown>);
}

export async function updateJob(
  id: number,
  patch: Partial<Pick<Job, "status" | "service" | "location" | "budget_cents" | "timeframe" | "winning_lead_id">>,
): Promise<void> {
  const c = db();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    args.push(v as string | number | null);
  }
  fields.push("updated_at = ?");
  args.push(now());
  args.push(id);
  await c.execute({ sql: `UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`, args });
}

export async function getJob(id: number): Promise<Job | null> {
  const c = db();
  const r = await c.execute({ sql: "SELECT * FROM jobs WHERE id = ?", args: [id] });
  return r.rows.length ? rowToJob(r.rows[0] as Record<string, unknown>) : null;
}

export async function insertLead(args: Omit<Lead, "id" | "created_at">): Promise<Lead> {
  const c = db();
  const r = await c.execute({
    sql: `INSERT INTO leads (job_id, name, phone, email, address, rating, source_url, rank_score, status, quoted_price_cents, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      args.job_id,
      args.name,
      args.phone,
      args.email,
      args.address,
      args.rating,
      args.source_url,
      args.rank_score,
      args.status,
      args.quoted_price_cents,
      args.notes,
      now(),
    ],
  });
  return rowToLead(r.rows[0] as Record<string, unknown>);
}

export async function updateLead(id: number, patch: Partial<Lead>): Promise<void> {
  const c = db();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id" || k === "created_at") continue;
    fields.push(`${k} = ?`);
    args.push(v as string | number | null);
  }
  if (!fields.length) return;
  args.push(id);
  await c.execute({ sql: `UPDATE leads SET ${fields.join(", ")} WHERE id = ?`, args });
}

export async function getLead(id: number): Promise<Lead | null> {
  const c = db();
  const r = await c.execute({ sql: "SELECT * FROM leads WHERE id = ?", args: [id] });
  return r.rows.length ? rowToLead(r.rows[0] as Record<string, unknown>) : null;
}

export async function listLeads(jobId: number): Promise<Lead[]> {
  const c = db();
  const r = await c.execute({
    sql: "SELECT * FROM leads WHERE job_id = ? ORDER BY rank_score DESC NULLS LAST, id ASC",
    args: [jobId],
  });
  return r.rows.map((row) => rowToLead(row as Record<string, unknown>));
}

export async function logMessage(args: {
  jobId: number;
  direction: "inbound" | "outbound";
  channel: "imessage" | "voice" | "email" | "system";
  body: string;
}): Promise<void> {
  const c = db();
  await c.execute({
    sql: `INSERT INTO messages (job_id, direction, channel, body, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [args.jobId, args.direction, args.channel, args.body, now()],
  });
}

export async function recordCallStart(args: {
  jobId: number;
  leadId: number;
  agentphoneCallId: string;
}): Promise<number> {
  const c = db();
  const r = await c.execute({
    sql: `INSERT INTO calls (lead_id, job_id, agentphone_call_id, created_at) VALUES (?, ?, ?, ?) RETURNING id`,
    args: [args.leadId, args.jobId, args.agentphoneCallId, now()],
  });
  return Number((r.rows[0] as Record<string, unknown>).id);
}

export async function recordCallEnd(args: {
  agentphoneCallId: string;
  outcome: string;
  transcript: string;
  quotedPriceCents?: number | null;
}): Promise<{ leadId: number; jobId: number } | null> {
  const c = db();
  const r = await c.execute({
    sql: `UPDATE calls
          SET outcome = ?, transcript_json = ?, quoted_price_cents = ?, ended_at = ?
          WHERE agentphone_call_id = ? AND ended_at IS NULL
          RETURNING lead_id, job_id`,
    args: [args.outcome, args.transcript, args.quotedPriceCents ?? null, now(), args.agentphoneCallId],
  });
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return { leadId: Number(row.lead_id), jobId: Number(row.job_id) };
}

export async function markJobAwaitingConfirmIfOpen(jobId: number, winningLeadId: number): Promise<boolean> {
  const c = db();
  const r = await c.execute({
    sql: `UPDATE jobs
          SET status = 'awaiting_confirm', winning_lead_id = ?, updated_at = ?
          WHERE id = ?
            AND winning_lead_id IS NULL
            AND status NOT IN ('awaiting_confirm', 'paying', 'complete', 'failed')
          RETURNING id`,
    args: [winningLeadId, now(), jobId],
  });
  return r.rows.length > 0;
}

export async function markJobFailedIfUnresolved(jobId: number): Promise<boolean> {
  const c = db();
  const r = await c.execute({
    sql: `UPDATE jobs
          SET status = 'failed', updated_at = ?
          WHERE id = ?
            AND winning_lead_id IS NULL
            AND status NOT IN ('awaiting_confirm', 'paying', 'complete', 'failed')
          RETURNING id`,
    args: [now(), jobId],
  });
  return r.rows.length > 0;
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
  const c = db();
  const t = now();
  const r = await c.execute({
    sql: `INSERT INTO email_threads (
            job_id, lead_id, inbox_id, thread_id, outbound_message_id,
            last_inbound_message_id, provider_email, provider_name, subject,
            created_at, updated_at, last_outbound_at, last_inbound_at
          )
          VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(outbound_message_id) DO UPDATE SET
            inbox_id = excluded.inbox_id,
            thread_id = excluded.thread_id,
            provider_email = excluded.provider_email,
            provider_name = excluded.provider_name,
            subject = excluded.subject,
            updated_at = excluded.updated_at,
            last_outbound_at = excluded.last_outbound_at
          RETURNING *`,
    args: [
      args.jobId,
      args.leadId,
      args.inboxId,
      args.threadId,
      args.outboundMessageId,
      args.providerEmail,
      args.providerName,
      args.subject,
      t,
      t,
      t,
    ],
  });
  return rowToEmailThread(r.rows[0] as Record<string, unknown>);
}

const EMAIL_MATCH_SELECT = `
SELECT
  j.id AS job_id,
  j.user_id AS job_user_id,
  j.conversation_id AS job_conversation_id,
  j.intent_raw AS job_intent_raw,
  j.service AS job_service,
  j.location AS job_location,
  j.budget_cents AS job_budget_cents,
  j.timeframe AS job_timeframe,
  j.status AS job_status,
  j.winning_lead_id AS job_winning_lead_id,
  j.created_at AS job_created_at,
  j.updated_at AS job_updated_at,
  l.id AS lead_id,
  l.job_id AS lead_job_id,
  l.name AS lead_name,
  l.phone AS lead_phone,
  l.email AS lead_email,
  l.address AS lead_address,
  l.rating AS lead_rating,
  l.source_url AS lead_source_url,
  l.rank_score AS lead_rank_score,
  l.status AS lead_status,
  l.quoted_price_cents AS lead_quoted_price_cents,
  l.notes AS lead_notes,
  l.created_at AS lead_created_at,
  et.id AS email_thread_id,
  et.job_id AS email_thread_job_id,
  et.lead_id AS email_thread_lead_id,
  et.inbox_id AS email_thread_inbox_id,
  et.thread_id AS email_thread_thread_id,
  et.outbound_message_id AS email_thread_outbound_message_id,
  et.last_inbound_message_id AS email_thread_last_inbound_message_id,
  et.provider_email AS email_thread_provider_email,
  et.provider_name AS email_thread_provider_name,
  et.subject AS email_thread_subject,
  et.created_at AS email_thread_created_at,
  et.updated_at AS email_thread_updated_at,
  et.last_outbound_at AS email_thread_last_outbound_at,
  et.last_inbound_at AS email_thread_last_inbound_at
FROM email_threads et
JOIN jobs j ON j.id = et.job_id
JOIN leads l ON l.id = et.lead_id
`;

async function findEmailLeadMatchByQuery(
  sqlTail: string,
  args: (string | number | null)[],
): Promise<EmailLeadMatch | null> {
  const c = db();
  const r = await c.execute({
    sql: `${EMAIL_MATCH_SELECT} ${sqlTail} LIMIT 1`,
    args,
  });
  if (!r.rows.length) return null;
  return rowToEmailLeadMatch(r.rows[0] as Record<string, unknown>);
}

export async function findEmailLeadMatch(args: {
  inboxId?: string | null;
  threadId?: string | null;
  inReplyTo?: string | null;
  providerEmail?: string | null;
}): Promise<EmailLeadMatch | null> {
  if (args.threadId) {
    const byThread = await findEmailLeadMatchByQuery(
      `WHERE et.thread_id = ? ORDER BY j.updated_at DESC, et.updated_at DESC`,
      [args.threadId],
    );
    if (byThread) return byThread;
  }
  if (args.inReplyTo) {
    const byReply = await findEmailLeadMatchByQuery(
      `WHERE et.outbound_message_id = ? ORDER BY j.updated_at DESC, et.updated_at DESC`,
      [args.inReplyTo],
    );
    if (byReply) return byReply;
  }
  if (args.providerEmail) {
    return findEmailLeadMatchByQuery(
      `WHERE et.provider_email = ?
       ORDER BY
         CASE WHEN j.status IN ('complete', 'failed') THEN 1 ELSE 0 END,
         j.updated_at DESC,
         et.updated_at DESC`,
      [args.providerEmail],
    );
  }
  return null;
}

export async function markInboundEmailReceived(args: {
  emailThreadId: number;
  messageId: string;
  threadId?: string | null;
}): Promise<boolean> {
  const c = db();
  const r = await c.execute({
    sql: `UPDATE email_threads
          SET
            last_inbound_message_id = ?,
            thread_id = COALESCE(?, thread_id),
            updated_at = ?,
            last_inbound_at = ?
          WHERE id = ?
            AND COALESCE(last_inbound_message_id, '') <> ?
          RETURNING id`,
    args: [args.messageId, args.threadId ?? null, now(), now(), args.emailThreadId, args.messageId],
  });
  return r.rows.length > 0;
}

export async function findCallByAgentphoneId(
  agentphoneCallId: string,
): Promise<{ id: number; leadId: number; jobId: number } | null> {
  const c = db();
  const r = await c.execute({
    sql: "SELECT id, lead_id, job_id FROM calls WHERE agentphone_call_id = ?",
    args: [agentphoneCallId],
  });
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return { id: Number(row.id), leadId: Number(row.lead_id), jobId: Number(row.job_id) };
}
