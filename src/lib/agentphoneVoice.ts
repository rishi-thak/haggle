import { after } from "next/server";
import { appendCallTurn, deleteCallTurns, findCallByAgentphoneId, getCallTurns, getJob, getLead, getUserByConversation } from "@/lib/repo";
import { nextTurn } from "@/lib/negotiator";
import { recallProviderHistory } from "@/lib/supermemory";
import type { NegotiationContext } from "@/lib/types";

type VoiceResponse = {
  text: string;
  hangup?: boolean;
  action?: "hangup";
};

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
    return { text: "Sorry, technical issue. Goodbye.", hangup: true, action: "hangup" };
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

  // Load transcript history from Convex (persisted across serverless instances)
  const history = await getCallTurns(callId);
  const turn = await nextTurn(ctx, history, leadUtterance);

  // Persist the new turns
  await appendCallTurn(callId, "lead", leadUtterance);
  await appendCallTurn(callId, "agent", turn.text);

  const turnCount = history.length + 2;
  const TURN_CAP = 16;
  const hangup = turn.shouldHangup || turnCount >= TURN_CAP;
  console.log("[agentphoneVoice] reply", {
    callId,
    turnCount,
    hangup,
    text: turn.text,
  });

  if (hangup) {
    const fullHistory = [...history, { role: "lead" as const, text: leadUtterance }, { role: "agent" as const, text: turn.text }];
    const transcript = fullHistory
      .map((h) => `${h.role === "agent" ? "Me" : lead.name}: ${h.text}`)
      .join("\n");

    // Clean up stored turns + trigger post-call pipeline after response is sent.
    // Using after() so the voice response isn't delayed, but also firing
    // handleCallCompleted inline as a fallback since after() can be unreliable
    // on serverless cold-recycle.
    after(async () => {
      try {
        await deleteCallTurns(callId);
      } catch (e) {
        console.error("[agentphoneVoice] deleteCallTurns failed", e);
      }
      try {
        const { handleCallCompleted } = await import("@/lib/orchestrator");
        await handleCallCompleted({
          agentphoneCallId: callId,
          transcript,
          outcome: "completed",
        });
      } catch (e) {
        console.error("[agentphoneVoice] self-trigger handleCallCompleted failed", e);
      }
    });

    return { text: turn.text, hangup: true, action: "hangup" };
  }

  return { text: turn.text };
}
