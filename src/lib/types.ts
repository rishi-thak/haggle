export type JobStatus =
  | "new"
  | "searching"
  | "ranked"
  | "calling"
  | "negotiating"
  | "email_fallback"
  | "awaiting_confirm"
  | "paying"
  | "complete"
  | "failed";

export type LeadStatus =
  | "pending"
  | "calling"
  | "negotiating"
  | "agreed"
  | "declined"
  | "no_answer"
  | "emailed";

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
  notes: string | null;
  created_at: number;
}

export interface CallRow {
  id: number;
  lead_id: number;
  job_id: number;
  agentphone_call_id: string | null;
  transcript_json: string | null;
  outcome: string | null;
  quoted_price_cents: number | null;
  created_at: number;
  ended_at: number | null;
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
  businessName: string;
}
