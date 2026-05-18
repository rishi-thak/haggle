import { after } from "next/server";
import { findCallByAgentphoneId, getJob, getLead, getUserByConversation } from "@/lib/repo";
import { nextTurn } from "@/lib/negotiator";
import { recallProviderHistory } from "@/lib/supermemory";
import type { NegotiationContext } from "@/lib/types";

type VoiceResponse = {
  text: string;
  hangup?: boolean;
  action?: "hangup";
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

  const history = transcripts.get(callId) ?? [];
  const turn = await nextTurn(ctx, history, leadUtterance);
  history.push({ role: "lead", text: leadUtterance });
  history.push({ role: "agent", text: turn.text });
  transcripts.set(callId, history);

  // Safety cap: even if the LLM never signals hangup, end the call after a
  // bounded number of turns so we don't loop forever.
  const TURN_CAP = 16;
  const hangup = turn.shouldHangup || history.length >= TURN_CAP;
  console.log("[agentphoneVoice] reply", {
    callId,
    turnCount: history.length,
    hangup,
    text: turn.text,
  });

  if (hangup) {
    // Drop the in-memory transcript and synthesize a plain-text version we can
    // hand to summarizeCall + the rest of the post-call pipeline. We do this
    // ourselves rather than waiting for Agentphone's `agent.call.completed`
    // webhook because in practice that webhook is unreliable, which leaves the
    // dashboard stuck on "calling" and the user's approval text never sends.
    const transcript = history
      .map((h) => `${h.role === "agent" ? "Me" : lead.name}: ${h.text}`)
      .join("\n");
    transcripts.delete(callId);

    // Run after the response is sent so we don't slow down the closing line.
    // `recordCallEnd` is idempotent on `ended_at`, so if Agentphone's own
    // completion webhook does fire later it'll no-op cleanly.
    after(async () => {
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
