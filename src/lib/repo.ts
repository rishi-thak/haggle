import { db, now } from "./db";
import type { Job, JobStatus, Lead, LeadStatus, User } from "./types";

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
    sql: "SELECT id, lead_id, job_id FROM calls WHERE agentphone_call_id = ?",
    args: [args.agentphoneCallId],
  });
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  await c.execute({
    sql: "UPDATE calls SET outcome = ?, transcript_json = ?, quoted_price_cents = ?, ended_at = ? WHERE id = ?",
    args: [args.outcome, args.transcript, args.quotedPriceCents ?? null, now(), Number(row.id)],
  });
  return { leadId: Number(row.lead_id), jobId: Number(row.job_id) };
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
