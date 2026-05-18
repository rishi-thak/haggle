import { NextRequest, NextResponse } from "next/server";
import { getEscrowByPayoutToken, updateEscrowPayment } from "@/lib/repo";
import { releaseToBank, releaseToVirtualCard } from "@/lib/sponge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const data = await getEscrowByPayoutToken(token);
  if (!data || !data.escrow || !data.lead) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (data.escrow.status !== "held") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 400 });
  }

  const amountUsd = data.escrow.amount_cents / 100;
  const method = data.escrow.provider_payout_method;

  if (method === "card") {
    const result = await releaseToVirtualCard(amountUsd, data.lead.name);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Card payment failed" }, { status: 500 });
    }
    await updateEscrowPayment(data.escrow.id, {
      status: "released",
      release_tx_hash: result.cardNumber ?? null,
    });
    return NextResponse.json({ ok: true, method: "card" });
  }

  if (method === "ach") {
    const accountId = data.escrow.provider_payout_account_id;
    if (!accountId) {
      return NextResponse.json({ error: "Provider has not linked bank account yet" }, { status: 400 });
    }
    const result = await releaseToBank(amountUsd, accountId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "ACH transfer failed" }, { status: 500 });
    }
    await updateEscrowPayment(data.escrow.id, {
      status: "released",
      release_tx_hash: result.txHash ?? null,
    });
    return NextResponse.json({ ok: true, method: "ach", txHash: result.txHash });
  }

  return NextResponse.json({ error: "No payout method configured" }, { status: 400 });
}
