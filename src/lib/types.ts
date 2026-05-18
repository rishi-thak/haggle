export const NEGOTIATION_OUTCOME_VALUES = [
  "agreed",
  "declined",
  "no_answer",
  "callback",
  "ambiguous",
] as const;

export type NegotiationOutcome = (typeof NEGOTIATION_OUTCOME_VALUES)[number];

export type JobStatus =
  | "new"
  | "searching"
  | "ranked"
  | "calling"
  | "negotiating"
  | "awaiting_callback"
  | "email_fallback"
  | "awaiting_confirm"
  | "paying"
  | "awaiting_completion"
  | "complete"
  | "failed";

export type PaymentMethod = "card" | "ach" | null;

export type LeadStatus =
  | "pending"
  | "calling"
  | "negotiating"
  | "agreed"
  | "declined"
  | "no_answer"
  | "callback"
  | "ambiguous"
  | "emailed";

export interface NegotiationStatusSnapshot {
  leadStatus: LeadStatus;
  suggestedJobStatus: JobStatus;
  isTerminal: boolean;
}

export interface User {
  id: number;
  phone: string;
  container_tag: string;
  sponge_wallet_address: string | null;
  created_at: number;
}

export interface Job {
  id: number;
  user_id: number;
  conversation_id: string;
  watch_token: string | null;
  intent_raw: string;
  service: string | null;
  location: string | null;
  budget_cents: number | null;
  timeframe: string | null;
  status: JobStatus;
  winning_lead_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface Lead {
  id: number;
  job_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  rating: number | null;
  source_url: string | null;
  rank_score: number | null;
  status: LeadStatus;
  quoted_price_cents: number | null;
  payment_method: PaymentMethod;
  notes: string | null;
  created_at: number;
}

export type EscrowStatus = "held" | "released" | "refunded";

export interface EscrowPayment {
  id: number;
  job_id: number;
  lead_id: number;
  amount_cents: number;
  funding_source: "card" | "usdc";
  funding_tx_hash: string | null;
  provider_payout_method: PaymentMethod;
  provider_payout_account_id: string | null;
  release_tx_hash: string | null;
  status: EscrowStatus;
  payout_token: string;
  created_at: number;
  updated_at: number;
}

export interface CallRow {
  id: number;
  lead_id: number;
  job_id: number;
  agentphone_call_id: string | null;
  transcript_json: string | null;
  outcome: NegotiationOutcome | string | null;
  quoted_price_cents: number | null;
  created_at: number;
  ended_at: number | null;
}

export interface MessageRow {
  id: number;
  job_id: number;
  direction: "inbound" | "outbound";
  channel: "imessage" | "voice" | "email" | "system";
  body: string;
  created_at: number;
}

export interface BrowserSessionRow {
  id: number;
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
}

export interface BrowserEventRow {
  id: number;
  job_id: number;
  browser_session_id: number;
  external_message_id: string | null;
  type: string;
  summary: string;
  screenshot_url: string | null;
  created_at: number;
}

export interface EmailThread {
  id: number;
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
}

export interface EmailLeadMatch {
  job: Job;
  lead: Lead;
  emailThread: EmailThread | null;
}

export interface WatchSnapshot {
  job: Job;
  leads: Lead[];
  calls: CallRow[];
  messages: MessageRow[];
  browserSessions: BrowserSessionRow[];
  browserEvents: BrowserEventRow[];
}

export interface NegotiationContext {
  jobId: number;
  leadId: number;
  service: string;
  location: string;
  budgetCents: number;
  timeframe: string;
  userPreferences: string[];
  pastProviderNotes: string;
  /** Stage-2 enrichment: website summary + Reddit sentiment for this specific provider. */
  enrichmentNotes?: string;
  businessName: string;
}
