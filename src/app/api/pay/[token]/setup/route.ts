import { NextRequest, NextResponse } from "next/server";
import { getEscrowByPayoutToken, updateEscrowPayment } from "@/lib/repo";
import { createProviderKycLink } from "@/lib/sponge";
import { env } from "@/lib/env";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json();
  const method = body.method as string;

  const data = await getEscrowByPayoutToken(token);
  if (!data || !data.escrow) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (data.escrow.status !== "held") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 400 });
  }

  if (method === "ach") {
    const redirectUrl = `${env.PUBLIC_BASE_URL}/pay/${token}?setup=complete`;
    const result = await createProviderKycLink(redirectUrl);
    if (!result.ok || !result.kycUrl) {
      return NextResponse.json({ error: result.error ?? "Failed to create setup link" }, { status: 500 });
    }

    await updateEscrowPayment(data.escrow.id, {
      provider_payout_method: "ach",
    });

    return NextResponse.json({ kycUrl: result.kycUrl });
  }

  return NextResponse.json({ error: "Unsupported payment method" }, { status: 400 });
}
