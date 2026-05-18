import { addMemory, searchMemories } from "./supermemory";

export async function recordReferral(
  containerTag: string,
  providerName: string,
  service: string,
  source: string,
): Promise<void> {
  await addMemory(
    containerTag,
    `${source} recommended ${providerName} for ${service}`,
    { type: "referral", provider: providerName, service, source },
  );
}

export function parseReferralFromMessage(
  text: string,
): { providerName: string | null; source: string | null } {
  const patterns = [
    // "my neighbor recommended drain pros"
    /my\s+(\w+)\s+recommended\s+(.+)/i,
    // "my friend uses mike's plumbing"
    /my\s+(\w+)\s+uses\s+(.+)/i,
    // "my coworker told me about ABC services"
    /my\s+(\w+)\s+told me about\s+(.+)/i,
    // "my sister suggested drain pros"
    /my\s+(\w+)\s+suggested\s+(.+)/i,
    // "a neighbor recommended drain pros"
    /a\s+(\w+)\s+recommended\s+(.+)/i,
    // "a friend uses mike's plumbing"
    /a\s+(\w+)\s+uses\s+(.+)/i,
    // "a coworker told me about ABC services"
    /a\s+(\w+)\s+told me about\s+(.+)/i,
    // "a friend suggested drain pros"
    /a\s+(\w+)\s+suggested\s+(.+)/i,
  ];

  const trimmed = text.trim();

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const source = match[1].toLowerCase();
      const providerName = match[2].replace(/[.!?,]+$/, "").trim();
      return { providerName, source: `your ${source}` };
    }
  }

  return { providerName: null, source: null };
}

export async function getReferralSource(
  containerTag: string,
  providerName: string,
): Promise<string | null> {
  const results = await searchMemories(containerTag, `referral recommended ${providerName}`, 5);

  for (const r of results) {
    // Match "X recommended providerName for Y"
    const match = r.content.match(/^(.+?)\s+recommended\s+/i);
    if (match && r.content.toLowerCase().includes(providerName.toLowerCase())) {
      return match[1].toLowerCase();
    }
    // Check metadata
    if (
      r.metadata?.type === "referral" &&
      (r.metadata.provider as string)?.toLowerCase() === providerName.toLowerCase() &&
      r.metadata.source
    ) {
      return r.metadata.source as string;
    }
  }

  return null;
}

export async function getTrustedReferrers(
  containerTag: string,
): Promise<{ source: string; successCount: number }[]> {
  // Get all referrals
  const referrals = await searchMemories(containerTag, "recommended referral", 20);
  // Get positive feedback
  const feedback = await searchMemories(containerTag, "positive experience provider feedback", 20);

  const positiveProviders = new Set<string>();
  for (const f of feedback) {
    if (f.metadata?.sentiment === "positive" && f.metadata?.providerName) {
      positiveProviders.add((f.metadata.providerName as string).toLowerCase());
    }
    // Also check content for positive signals
    const contentMatch = f.content.match(/Positive experience with (.+?) for/i);
    if (contentMatch) {
      positiveProviders.add(contentMatch[1].toLowerCase());
    }
  }

  // Count successful referrals per source
  const sourceCounts: Record<string, number> = {};

  for (const r of referrals) {
    if (r.metadata?.type === "referral" && r.metadata?.source && r.metadata?.provider) {
      const provider = (r.metadata.provider as string).toLowerCase();
      const source = r.metadata.source as string;
      if (positiveProviders.has(provider)) {
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      }
    } else {
      // Parse from content: "X recommended ProviderName for service"
      const match = r.content.match(/^(.+?)\s+recommended\s+(.+?)\s+for\s+/i);
      if (match) {
        const source = match[1].toLowerCase();
        const provider = match[2].toLowerCase();
        if (positiveProviders.has(provider)) {
          sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        }
      }
    }
  }

  return Object.entries(sourceCounts)
    .map(([source, successCount]) => ({ source, successCount }))
    .sort((a, b) => b.successCount - a.successCount);
}
