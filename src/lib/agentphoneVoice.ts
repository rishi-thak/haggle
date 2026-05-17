import { findCallByAgentphoneId, getJob, getLead, getUserByConversation } from "@/lib/repo";
import { nextTurn } from "@/lib/negotiator";
import { recallProviderHistory } from "@/lib/supermemory";
import type { NegotiationContext } from "@/lib/types";

type VoiceResponse = {
  text: string;
  hangup?: boolean;
};

// Per-call in-memory transcript buffer (cleared by process restart).
const transcripts = new Map<string, { role: "agent" | "lead"; text: string }[]>();

export async function buildAgentphoneVoiceResponse(body: Record<string, unknown>): Promise<VoiceResponse> {
  const data = (body.data as Record<string, unknown> | undefined) ?? {};
  const callId = String(body.callId ?? data.callId ?? "");
  const leadUtterance = String(
    data.transcript ?? data.speech ?? data.message ?? body.transcript ?? body.speech ?? "",
  );
  const metadata =
    (body.metadata as Record<string, unknown> | undefined) ??
    (body.variables as Record<string, unknown> | undefined) ??
    (data.metadata as Record<string, unknown> | undefined) ??
    (data.variables as Record<string, unknown> | undefined) ??
    {};
  const jobIdMeta = Number(metadata.jobId ?? 0);
  const leadIdMeta = Number(metadata.leadId ?? 0);

  let leadId = leadIdMeta;
  let jobId = jobIdMeta;
  if (!leadId || !jobId) {
    const found = await findCallByAgentphoneId(callId);
    if (found) {
      leadId = found.leadId;
      jobId = found.jobId;
    }
  }
  if (!leadId || !jobId) {
    return { text: "One moment, I'll call you back." };
  }

  const lead = await getLead(leadId);
  const job = await getJob(jobId);
  if (!lead || !job) {
    return { text: "Sorry, technical issue. Goodbye.", hangup: true };
  }

  const user = await getUserByConversation(job.conversation_id);
  const containerTag = user?.container_tag ?? "user_unknown";
  const past = await recallProviderHistory(containerTag, job.service ?? "", lead.name);

  const ctx: NegotiationContext = {
    jobId: job.id,
    leadId: lead.id,
    service: job.service ?? "service",
    location: job.location ?? "",
    budgetCents: job.budget_cents ?? 10000,
    timeframe: job.timeframe ?? "ASAP",
    userPreferences: [],
    pastProviderNotes: past.summary,
    enrichmentNotes: lead.notes ?? undefined,
    businessName: lead.name,
  };

  const history = transcripts.get(callId) ?? [];
  const reply = await nextTurn(ctx, history, leadUtterance);
  history.push({ role: "lead", text: leadUtterance });
  history.push({ role: "agent", text: reply });
  transcripts.set(callId, history);

  return { text: reply, hangup: history.length >= 12 };
}
