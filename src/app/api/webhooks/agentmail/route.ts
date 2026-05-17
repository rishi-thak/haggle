import { NextResponse } from "next/server";
import { handleInboundEmailReply } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getFirstEmailAddress(raw: unknown): string | null {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const parsed = getFirstEmailAddress(item);
      if (parsed) return parsed;
    }
    return null;
  }
  if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;
    return getFirstEmailAddress(candidate.email ?? candidate.address ?? candidate.value ?? candidate.name);
  }
  if (typeof raw !== "string") return null;
  const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const eventType = String((body as Record<string, unknown>).eventType ?? (body as Record<string, unknown>).event_type ?? "");
  if (eventType !== "message.received") {
    return NextResponse.json({ ok: true, ignored: eventType || "unknown" });
  }

  const message = ((body as Record<string, unknown>).message ?? {}) as Record<string, unknown>;
  const labels = Array.isArray(message.labels) ? message.labels.map((label) => String(label).toLowerCase()) : [];
  if (labels.includes("sent")) {
    return NextResponse.json({ ok: true, skipped: "outbound" });
  }

  const messageId = String(message.messageId ?? "");
  const text = String(message.extractedText ?? message.text ?? message.preview ?? "").trim();
  if (!messageId || !text) {
    return NextResponse.json({ ok: false, error: "missing message payload" }, { status: 400 });
  }

  handleInboundEmailReply({
    inboxId: typeof message.inboxId === "string" ? message.inboxId : null,
    threadId: typeof message.threadId === "string" ? message.threadId : null,
    messageId,
    inReplyTo: typeof message.inReplyTo === "string" ? message.inReplyTo : null,
    fromEmail: getFirstEmailAddress(message.from),
    subject: typeof message.subject === "string" ? message.subject : null,
    text,
  }).catch((error) => {
    console.error("[webhook/agentmail] handler", error);
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "agentmail webhook" });
}
