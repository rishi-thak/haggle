import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/agentphone";
import { buildAgentphoneVoiceResponse } from "@/lib/agentphoneVoice";
import { claimWebhookDelivery } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
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
  // configured webhook URL. Voice turns must synchronously return text to speak,
  // so they MUST bypass dedupe (a retried turn still needs a fresh response).
  if (event === "agent.message" && channel === "voice") {
    return NextResponse.json(await buildAgentphoneVoiceResponse(body));
  }

  // Idempotency for everything else: Agentphone retries deliveries up to 6
  // times across ~20h (attempts at +0, +5m, +30m, +2h, +6h, +12h).
  const deliveryId = req.headers.get("x-webhook-id");
  if (deliveryId) {
    const fresh = await claimWebhookDelivery({
      deliveryId,
      source: "agentphone",
      event: event || null,
    }).catch((e) => {
      console.error("[webhook/agentphone] claimWebhookDelivery failed", e);
      // On store failure, fall open so we don't drop a real message.
      return true;
    });
    if (!fresh) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  } else {
    console.warn("[webhook/agentphone] missing x-webhook-id header; skipping dedupe");
  }

  // Inbound iMessage
  if (event === "agent.message" && (channel === "imessage" || channel === "sms")) {
    const data = body.data as Record<string, unknown>;
    const direction = String(data?.direction ?? "inbound");
    if (direction !== "inbound") return NextResponse.json({ ok: true, skipped: "outbound" });
    const conversationId = String(data.conversationId ?? "");
    const fromPhone = String(data.from ?? "");
    const toPhone = data.to ? String(data.to) : undefined;
    const text = String(data.message ?? "");
    if (!conversationId || !fromPhone || !text) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }
    const { handleInboundIMessage } = await import("@/lib/orchestrator");
    try {
      await handleInboundIMessage({ conversationId, fromPhone, toPhone, text });
    } catch (e) {
      console.error("[webhook/agentphone] inbound handler", e);
      return NextResponse.json({ ok: false, error: "handler failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Call ended. Agentphone sends `agent.call_ended` (underscore) per their docs.
  // Also accept dot-separated variants for safety.
  if (/^(agent[._])?call[._](completed|failed|no_answer|ended)$/.test(event)) {
    const data = (body.data as Record<string, unknown>) ?? {};
    const callId = String(data.callId ?? body.callId ?? "");
    // Transcript can be a string or array of {role, content} objects
    let transcript = "";
    const rawTranscript = data.transcript ?? body.transcript;
    if (typeof rawTranscript === "string") {
      transcript = rawTranscript;
    } else if (Array.isArray(rawTranscript)) {
      transcript = rawTranscript
        .map((t: Record<string, string>) => `${t.role ?? "unknown"}: ${t.content ?? t.text ?? ""}`)
        .join("\n");
    }
    const outcome = String(data.status ?? data.outcome ?? body.outcome ?? "completed");
    if (!callId) return NextResponse.json({ ok: false, error: "missing callId" }, { status: 400 });
    const { handleCallCompleted } = await import("@/lib/orchestrator");
    try {
      await handleCallCompleted({ agentphoneCallId: callId, transcript, outcome });
    } catch (e) {
      console.error("[webhook/agentphone] call handler", e);
      return NextResponse.json({ ok: false, error: "call handler failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: event });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "agentphone webhook" });
}
