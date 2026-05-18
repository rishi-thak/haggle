import { NextResponse } from "next/server";
import { handleInboundIMessage } from "@/lib/orchestrator";
import { appendWebChatMessage } from "@/lib/repo";
import { isWebConversation } from "@/lib/userChannel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    phone?: string;
    text?: string;
  };
  const conversationId = String(body.conversationId ?? "");
  const text = String(body.text ?? "").trim();
  const phone = normalizePhone(String(body.phone ?? ""));

  if (!conversationId || !isWebConversation(conversationId)) {
    return NextResponse.json(
      { ok: false, error: "conversationId must start with 'web:'" },
      { status: 400 },
    );
  }
  if (!text) {
    return NextResponse.json({ ok: false, error: "missing text" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ ok: false, error: "invalid phone" }, { status: 400 });
  }

  await appendWebChatMessage({ conversationId, direction: "inbound", body: text });

  await handleInboundIMessage({ conversationId, fromPhone: phone, text });

  return NextResponse.json({ ok: true });
}
