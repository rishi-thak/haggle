import { api } from "../../convex/_generated/api";
import { convexClient } from "./convexClient";
import type { Job, Lead } from "./types";

const FOLLOW_UP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function scheduleFollowUp(job: Job, lead: Lead): Promise<void> {
  await convexClient().mutation(api.repo.createFollowUp, {
    jobId: job.id,
    leadId: lead.id,
    conversationId: job.conversation_id,
    providerName: lead.name,
    service: job.service ?? "service",
    scheduledAt: Date.now() + FOLLOW_UP_DELAY_MS,
  });
}

export interface PendingFollowUp {
  _id: string;
  job_id: number;
  lead_id: number;
  conversation_id: string;
  provider_name: string;
  service: string;
  scheduled_at: number;
  sent: boolean;
}

export async function getPendingFollowUps(): Promise<PendingFollowUp[]> {
  const rows = await convexClient().query(api.repo.getPendingFollowUps, { now: Date.now() });
  return rows as unknown as PendingFollowUp[];
}

export async function markFollowUpSent(id: string): Promise<void> {
  await convexClient().mutation(api.repo.markFollowUpSent, { id: id as never });
}
