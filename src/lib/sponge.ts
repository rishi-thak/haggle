import { SpongeWallet, SpongePlatform } from "@paysponge/sdk";
import { env } from "./env";

let _walletPromise: ReturnType<typeof SpongeWallet.connect> | null = null;
let _platformPromise: ReturnType<typeof SpongePlatform.connect> | null = null;

async function getWallet() {
  if (!env.SPONGE_API_KEY) throw new Error("SPONGE_API_KEY not set");
  if (!_walletPromise) {
    _walletPromise = SpongeWallet.connect({ apiKey: env.SPONGE_API_KEY });
  }
  return _walletPromise;
}

async function getPlatform() {
  if (!env.SPONGE_API_KEY) throw new Error("SPONGE_API_KEY not set");
  if (!_platformPromise) {
    _platformPromise = SpongePlatform.connect({ apiKey: env.SPONGE_API_KEY });
  }
  return _platformPromise;
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

// --- Escrow Operations ---

export interface EscrowLockResult {
  ok: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Lock funds into escrow by transferring USDC from user's funding into our escrow wallet.
 * For card payments: onrampCrypto charges the card → USDC arrives in escrow.
 * For USDC payments: direct transfer from user wallet → escrow wallet.
 */
export async function lockEscrowFromCard(amountUsd: number, redirectUrl?: string): Promise<{
  ok: boolean;
  onrampUrl?: string;
  sessionId?: string;
  error?: string;
}> {
  try {
    const w = await getWallet();
    const addresses = await w.getAddresses();
    const escrowAddress = addresses.base;
    if (!escrowAddress) return { ok: false, error: "no escrow wallet address" };

    const result = await w.onrampCrypto({
      wallet_address: escrowAddress,
      provider: "auto",
      chain: "base",
      fiat_amount: amountUsd.toFixed(2),
      fiat_currency: "USD",
      lock_wallet_address: true,
      redirect_url: redirectUrl,
    });

    return {
      ok: result.success,
      onrampUrl: result.url,
      sessionId: result.sessionId,
    };
  } catch (e) {
    console.error("[sponge] lockEscrowFromCard failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Lock escrow by transferring USDC from the user's Sponge wallet to our escrow wallet.
 */
export async function lockEscrowFromUsdc(amountUsd: number, fromAddress?: string): Promise<EscrowLockResult> {
  try {
    const w = await getWallet();
    const addresses = await w.getAddresses();
    const escrowAddress = addresses.base;
    if (!escrowAddress) return { ok: false, error: "no escrow wallet address" };

    const tx = await w.evmTransfer({
      chain: env.SPONGE_CHAIN,
      to: escrowAddress,
      amount: amountUsd.toFixed(2),
      currency: "USDC",
    });
    return {
      ok: tx.status === "success" || tx.status === "pending" || tx.status === "submitted",
      txHash: tx.transactionHash,
    };
  } catch (e) {
    console.error("[sponge] lockEscrowFromUsdc failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Release escrow funds to provider via virtual card (for card-accepting providers).
 */
export async function releaseToVirtualCard(amountUsd: number, providerName: string): Promise<{
  ok: boolean;
  cardNumber?: string;
  error?: string;
}> {
  try {
    const w = await getWallet();
    const result = await w.issueVirtualCard({
      amount: amountUsd.toFixed(2),
      merchant_name: providerName,
      merchant_url: "https://haggle.app",
      currency: "USD",
    }) as { card_number?: string; success?: boolean };
    return {
      ok: !!result?.success || !!result?.card_number,
      cardNumber: result?.card_number,
    };
  } catch (e) {
    console.error("[sponge] releaseToVirtualCard failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Release escrow funds to provider via ACH bank transfer (using Bridge).
 * Requires the provider to have completed KYC and linked their bank.
 */
export async function releaseToBank(amountUsd: number, externalAccountId: string): Promise<PayResult> {
  try {
    const platform = await getPlatform();
    const w = await getWallet();
    const addresses = await w.getAddresses();
    const transfer = await platform.createBridgeTransfer({
      amount: amountUsd.toFixed(2),
      walletId: addresses.base,
      externalAccountId,
    });
    return {
      ok: !!transfer,
      txHash: (transfer as { id?: string })?.id,
    };
  } catch (e) {
    console.error("[sponge] releaseToBank failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Release escrow funds directly to a USDC address (provider has crypto wallet).
 */
export async function releaseToAddress(amountUsd: number, toAddress: string): Promise<PayResult> {
  return payUsdc(amountUsd, toAddress);
}

/**
 * Refund escrow funds back to user (provider no-show, cancellation).
 */
export async function refundEscrow(amountUsd: number, userWalletAddress: string): Promise<PayResult> {
  return payUsdc(amountUsd, userWalletAddress);
}

/**
 * Generate a KYC link for a provider to set up their bank account for ACH payout.
 * This returns a hosted Sponge/Bridge page URL — we never touch their bank details.
 */
export async function createProviderKycLink(redirectUrl?: string): Promise<{
  ok: boolean;
  kycUrl?: string;
  error?: string;
}> {
  try {
    const platform = await getPlatform();
    const result = await platform.createBridgeKycLink({
      redirectUri: redirectUrl,
    });
    return {
      ok: !!result?.url,
      kycUrl: result?.url,
    };
  } catch (e) {
    console.error("[sponge] createProviderKycLink failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
