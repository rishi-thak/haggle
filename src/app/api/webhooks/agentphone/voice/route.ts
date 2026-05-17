import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/agentphone";
import { ensureSchema } from "@/lib/db";
import { buildAgentphoneVoiceResponse } from "@/lib/agentphoneVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return NextResponse.json(await buildAgentphoneVoiceResponse(body));
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "agentphone voice webhook" });
}
