import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AgentMail inbound reply handler. For demo simplicity we just log replies;
// a fuller build would parse the quote and call handleCallCompleted-equivalent.
export async function POST(req: Request) {
  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  console.log("[webhook/agentmail] reply", JSON.stringify(body).slice(0, 500));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "agentmail webhook" });
}
