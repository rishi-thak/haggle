import { NextResponse } from "next/server";
import { getWatchSnapshot } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  try {
    const snapshot = await getWatchSnapshot(token);
    if (!snapshot) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true, snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[watch] snapshot failed", error);
    return NextResponse.json(
      { ok: false, error: "watch snapshot unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
