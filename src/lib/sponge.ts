import { SpongeWallet } from "@paysponge/sdk";
import { env } from "./env";

let _walletPromise: ReturnType<typeof SpongeWallet.connect> | null = null;

async function getWallet() {
  if (!env.SPONGE_API_KEY) throw new Error("SPONGE_API_KEY not set");
  if (!_walletPromise) {
    _walletPromise = SpongeWallet.connect({ apiKey: env.SPONGE_API_KEY });
  }
  return _walletPromise;
}

export async function getAddresses(): Promise<{ base?: string; solana?: string }> {
  try {
    const w = await getWallet();
    const a = await w.getAddresses();
    return { base: a.base, solana: a.solana };
  } catch (e) {
    console.error("[sponge] getAddresses failed", e);
    return {};
  }
}

export async function getBalanceSummary(): Promise<string> {
  try {
    const w = await getWallet();
    const balances = await w.getBalances();
    return JSON.stringify(balances);
  } catch (e) {
    console.error("[sponge] getBalances failed", e);
    return "(unavailable)";
  }
}

export interface PayResult {
  ok: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

export async function payUsdc(amountUsd: number, toAddressOverride?: string): Promise<PayResult> {
  const to = toAddressOverride || env.SPONGE_DEMO_PAYEE_ADDRESS;
  if (!to || to === "0x0000000000000000000000000000000000000000") {
    return { ok: false, error: "no payee address configured" };
  }
  if (!env.SPONGE_API_KEY) {
    return { ok: false, error: "SPONGE_API_KEY not set" };
  }
  try {
    const w = await getWallet();
    const tx = await w.evmTransfer({
      chain: env.SPONGE_CHAIN,
      to,
      amount: amountUsd.toFixed(2),
      currency: "USDC",
    });
    return {
      ok: tx.status === "success" || tx.status === "pending" || tx.status === "submitted",
      txHash: tx.transactionHash,
      explorerUrl: tx.explorerUrl,
    };
  } catch (e) {
    console.error("[sponge] payUsdc failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
