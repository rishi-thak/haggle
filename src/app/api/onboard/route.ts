import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getOrCreateUser } from "@/lib/repo";
import { addMemory } from "@/lib/supermemory";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function POST(req: Request) {
  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  const phoneRaw = String(body.phone ?? "");
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    return NextResponse.json({ ok: false, error: "invalid phone" }, { status: 400 });
  }

  const user = await getOrCreateUser(phone);

  // Seed an onboarding memory so we can recognize this user later.
  await addMemory(
    user.container_tag,
    `User ${phone} onboarded via web. Default city: San Francisco. Prefers concise updates and ≤ budget pricing.`,
    { type: "onboarding" },
  );

  return NextResponse.json({
    ok: true,
    user: { id: user.id, phone: user.phone },
    instructions: env.AGENTPHONE_FROM_NUMBER
      ? `Text ${env.AGENTPHONE_FROM_NUMBER} to start. e.g. "get my car detailed in SF for under $100".`
      : "Set AGENTPHONE_FROM_NUMBER in .env to show your iMessage entry point.",
    iMessageNumber: env.AGENTPHONE_FROM_NUMBER || null,
  });
}
