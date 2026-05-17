import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/agentphone";
import { buildAgentphoneVoiceResponse } from "@/lib/agentphoneVoice";
import { ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSchema();
  const raw = await req.text();
  const sig = req.headers.get("x-webhook-signature");
  const ts = req.headers.get("x-webhook-timestamp");
  if (!verifyWebhookSignature(raw, sig, ts)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const channel = String(body.channel ?? "");

  // Agentphone's current webhook model sends both SMS and voice turns to the
  // configured webhook URL. Voice turns must synchronously return text to speak.
  if (event === "agent.message" && channel === "voice") {
    return NextResponse.json(await buildAgentphoneVoiceResponse(body));
  }

  // Inbound iMessage
  if (event === "agent.message" && (channel === "imessage" || channel === "sms")) {
    const data = body.data as Record<string, unknown>;
    const direction = String(data?.direction ?? "inbound");
    if (direction !== "inbound") return NextResponse.json({ ok: true, skipped: "outbound" });
    const conversationId = String(data.conversationId ?? "");
    const fromPhone = String(data.from ?? "");
    const text = String(data.message ?? "");
    if (!conversationId || !fromPhone || !text) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }
    // Don't await: spec says full autonomy; we want to ack quickly.
    const { handleInboundIMessage } = await import("@/lib/orchestrator");
    handleInboundIMessage({ conversationId, fromPhone, text }).catch((e) =>
      console.error("[webhook/agentphone] inbound handler", e),
    );
    return NextResponse.json({ ok: true });
  }

  // Call completed
  if (event === "agent.call.completed" || event === "agent.call.failed" || event === "agent.call.no_answer") {
    const callId = String(body.callId ?? (body.data as Record<string, unknown> | undefined)?.callId ?? "");
    const data = (body.data as Record<string, unknown>) ?? {};
    const transcript = String(data.transcript ?? body.transcript ?? "");
    const outcome = String(data.outcome ?? body.outcome ?? event.split(".").pop() ?? "");
    if (!callId) return NextResponse.json({ ok: false, error: "missing callId" }, { status: 400 });
    const { handleCallCompleted } = await import("@/lib/orchestrator");
    handleCallCompleted({ agentphoneCallId: callId, transcript, outcome }).catch((e) =>
      console.error("[webhook/agentphone] call handler", e),
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: event });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "agentphone webhook" });
}
