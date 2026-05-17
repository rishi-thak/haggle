import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/agentphone";
import { ensureSchema } from "@/lib/db";
import { findCallByAgentphoneId, getJob, getLead, getUserByConversation } from "@/lib/repo";
import { nextTurn } from "@/lib/negotiator";
import { recallProviderHistory } from "@/lib/supermemory";
import type { NegotiationContext } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-call in-memory transcript buffer (cleared on call.completed via the main webhook).
const transcripts = new Map<string, { role: "agent" | "lead"; text: string }[]>();

export async function POST(req: Request) {
  await ensureSchema();
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"))) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const callId = String(
    body.callId ?? (body.data as Record<string, unknown> | undefined)?.callId ?? "",
  );
  const data = (body.data as Record<string, unknown>) ?? {};
  const leadUtterance = String(
    data.transcript ?? data.speech ?? body.transcript ?? body.speech ?? "",
  );
  const metadata = (body.metadata as Record<string, unknown> | undefined) ?? {};
  const jobIdMeta = Number(metadata.jobId ?? 0);
  const leadIdMeta = Number(metadata.leadId ?? 0);

  // Resolve context
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
    return NextResponse.json({ text: "One moment, I'll call you back." });
  }

  const lead = await getLead(leadId);
  const job = await getJob(jobId);
  if (!lead || !job) {
    return NextResponse.json({ text: "Sorry, technical issue. Goodbye." , hangup: true });
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
    businessName: lead.name,
  };

  const history = transcripts.get(callId) ?? [];
  const reply = await nextTurn(ctx, history, leadUtterance);
  history.push({ role: "lead", text: leadUtterance });
  history.push({ role: "agent", text: reply });
  transcripts.set(callId, history);

  // Hang up after ~6 turns to avoid runaway
  const hangup = history.length >= 12;
  return NextResponse.json({ text: reply, hangup });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "agentphone voice webhook" });
}
