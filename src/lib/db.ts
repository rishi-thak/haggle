import { createClient, type Client } from "@libsql/client";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __haggleDb: Client | undefined;
  // eslint-disable-next-line no-var
  var __haggleDbReady: boolean | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  container_tag TEXT UNIQUE NOT NULL,
  sponge_wallet_address TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  conversation_id TEXT NOT NULL,
  intent_raw TEXT NOT NULL,
  service TEXT,
  location TEXT,
  budget_cents INTEGER,
  timeframe TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  winning_lead_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  rating REAL,
  source_url TEXT,
  rank_score REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  quoted_price_cents INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  agentphone_call_id TEXT,
  transcript_json TEXT,
  outcome TEXT,
  quoted_price_cents INTEGER,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  inbox_id TEXT,
  thread_id TEXT,
  outbound_message_id TEXT,
  last_inbound_message_id TEXT,
  provider_email TEXT,
  provider_name TEXT,
  subject TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_outbound_at INTEGER NOT NULL,
  last_inbound_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_conversation ON jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_job ON leads(job_id);
CREATE INDEX IF NOT EXISTS idx_calls_lead ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_job ON messages(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_threads_outbound_message ON email_threads(outbound_message_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_thread ON email_threads(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_job_lead ON email_threads(job_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_provider_email ON email_threads(provider_email);
`;

export function db(): Client {
  if (globalThis.__haggleDb) return globalThis.__haggleDb;
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN || undefined,
  });
  globalThis.__haggleDb = client;
  return client;
}

export async function ensureSchema(): Promise<void> {
  if (globalThis.__haggleDbReady) return;
  const c = db();
  const stmts = SCHEMA.split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of stmts) await c.execute(s);
  globalThis.__haggleDbReady = true;
}

export function now(): number {
  return Date.now();
}
