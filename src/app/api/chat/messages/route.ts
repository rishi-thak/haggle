import { NextResponse } from "next/server";
import { listWebChatMessages } from "@/lib/repo";
import { isWebConversation } from "@/lib/userChannel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId") ?? "";
  const sinceRaw = url.searchParams.get("sinceMs");
  const sinceMs = sinceRaw ? Number(sinceRaw) : undefined;

  if (!conversationId || !isWebConversation(conversationId)) {
    return NextResponse.json(
      { ok: false, error: "conversationId must start with 'web:'" },
      { status: 400 },
    );
  }

  const messages = await listWebChatMessages(conversationId, sinceMs);
  return NextResponse.json({ ok: true, messages });
}
