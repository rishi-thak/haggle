import { addMemory, searchMemories } from "./supermemory";

// ─── recordTactic ──────────────────────────────────────────────────────────────
/**
 * Stores what negotiation approach worked (or didn't) with a specific provider.
 */
export async function recordTactic(
  containerTag: string,
  providerName: string,
  service: string,
  tactic: string,
  worked: boolean,
): Promise<void> {
  const label = worked ? "[WORKED]" : "[DID NOT WORK]";
  const content = `${label} Negotiation with ${providerName} (${service}): ${tactic}`;
  await addMemory(containerTag, content, {
    type: "negotiation_tactic",
    provider: providerName,
    service,
    worked,
  });
}

// ─── getProviderNegotiationProfile ─────────────────────────────────────────────

export interface ProviderNegotiationProfile {
  flexibleOnPrice: boolean | null;
  effectiveTactics: string[];
  ineffectiveTactics: string[];
  priceFloor: number | null;
  notes: string;
}

/**
 * Searches memory for past negotiation history with a specific provider and
 * parses results into a structured profile.
 */
export async function getProviderNegotiationProfile(
  containerTag: string,
  providerName: string,
  service: string,
): Promise<ProviderNegotiationProfile> {
  const results = await searchMemories(
    containerTag,
    `negotiation tactic ${providerName} ${service} price discount`,
    10,
  );

  const effectiveTactics: string[] = [];
  const ineffectiveTactics: string[] = [];
  let flexibleOnPrice: boolean | null = null;
  let priceFloor: number | null = null;
  const noteLines: string[] = [];

  for (const r of results) {
    const content = r.content;
    const isWorked = content.startsWith("[WORKED]") || r.metadata?.worked === true;
    const isFailed = content.startsWith("[DID NOT WORK]") || r.metadata?.worked === false;

    // Only consider results relevant to this provider
    if (!content.toLowerCase().includes(providerName.toLowerCase())) continue;

    // Extract tactic description (strip prefix and provider/service context)
    const tacticDesc = content
      .replace(/^\[(WORKED|DID NOT WORK)\]\s*/i, "")
      .replace(/^Negotiation with .+?:\s*/i, "")
      .trim();

    if (isWorked) {
      effectiveTactics.push(tacticDesc);
      // If something worked price-wise, they're flexible
      if (/drop|lower|discount|reduced|match|agreed/i.test(content)) {
        flexibleOnPrice = true;
      }
    } else if (isFailed) {
      ineffectiveTactics.push(tacticDesc);
      // If price tactics fail repeatedly, mark inflexible
      if (/won't|never|refuse|firm|no budg/i.test(content)) {
        if (flexibleOnPrice === null) flexibleOnPrice = false;
      }
    }

    // Extract price floor — look for dollar amounts in "won't go below" or "lowest was" patterns
    const floorMatch = content.match(
      /(?:won't go below|never below|lowest (?:was|price)|minimum|floor|no less than)\D*\$(\d+)/i,
    );
    if (floorMatch) {
      const val = parseInt(floorMatch[1], 10);
      if (priceFloor === null || val > priceFloor) {
        priceFloor = val;
      }
    }

    // Also pick up explicit dollar amounts in "didn't work" contexts as floor hints
    if (isFailed) {
      const priceMatch = content.match(/\$(\d+)/);
      if (priceMatch && /below|under|less/i.test(content)) {
        const val = parseInt(priceMatch[1], 10);
        if (priceFloor === null || val > priceFloor) {
          priceFloor = val;
        }
      }
    }

    noteLines.push(content);
  }

  return {
    flexibleOnPrice,
    effectiveTactics,
    ineffectiveTactics,
    priceFloor,
    notes: noteLines.join("\n"),
  };
}

// ─── buildNegotiationHints ─────────────────────────────────────────────────────
/**
 * Returns a paragraph to inject into the voice agent system prompt with
 * tactical hints about negotiating with this provider. Empty string if no history.
 */
export async function buildNegotiationHints(
  containerTag: string,
  providerName: string,
  service: string,
  budgetCents: number,
): Promise<string> {
  const profile = await getProviderNegotiationProfile(containerTag, providerName, service);

  // No useful history
  if (
    profile.effectiveTactics.length === 0 &&
    profile.ineffectiveTactics.length === 0 &&
    profile.priceFloor === null
  ) {
    return "";
  }

  const parts: string[] = [];

  // Flexibility insight
  if (profile.flexibleOnPrice === true) {
    parts.push("This provider has been flexible on price in the past.");
  } else if (profile.flexibleOnPrice === false) {
    parts.push("This provider tends to hold firm on pricing.");
  }

  // Effective tactics
  if (profile.effectiveTactics.length > 0) {
    const tactics = profile.effectiveTactics.slice(0, 3).join("; ");
    parts.push(`Approaches that worked before: ${tactics}.`);
  }

  // Ineffective tactics
  if (profile.ineffectiveTactics.length > 0) {
    const tactics = profile.ineffectiveTactics.slice(0, 3).join("; ");
    parts.push(`Don't bother with: ${tactics}.`);
  }

  // Price floor
  if (profile.priceFloor !== null) {
    parts.push(`Their lowest known price was $${profile.priceFloor}.`);
    const budgetDollars = Math.floor(budgetCents / 100);
    if (budgetDollars < profile.priceFloor) {
      parts.push(
        `Don't bother asking for below $${profile.priceFloor}, they won't go there.`,
      );
    }
  }

  return parts.join(" ");
}

// ─── inferTacticsFromTranscript ────────────────────────────────────────────────

interface InferredTactic {
  description: string;
  worked: boolean;
}

/**
 * Analyzes a call transcript to extract what negotiation moves happened and
 * whether they worked. Pure regex/heuristic analysis — no external API calls.
 */
export function inferTacticsFromTranscript(
  transcript: string,
  outcome: string,
  quotedPriceCents: number | null,
  budgetCents: number,
): { tactics: InferredTactic[] } {
  const tactics: InferredTactic[] = [];
  const normalized = transcript.replace(/\s+/g, " ");

  // Determine overall success: outcome=agreed and price within budget
  const overallSuccess =
    outcome === "agreed" && quotedPriceCents !== null && quotedPriceCents <= budgetCents;

  // Pattern: Mentioning competitor quote
  const competitorPattern =
    /(?:someone else|another company|competitor|other provider|another (?:guy|person|plumber|electrician|contractor))\s+(?:quoted|offered|said|charges?)\s*\$?(\d+)/i;
  const competitorMatch = normalized.match(competitorPattern);
  if (competitorMatch) {
    tactics.push({
      description: `Mentioning competitor quote ($${competitorMatch[1]})`,
      worked: overallSuccess,
    });
  }

  // Pattern: Mentioning budget
  const budgetPattern =
    /(?:my budget|our budget|the budget|budget is|only have|can only (?:spend|afford|do))\s*(?:is\s*)?\$?(\d+)/i;
  const budgetMatch = normalized.match(budgetPattern);
  if (budgetMatch) {
    tactics.push({
      description: `Mentioning budget ($${budgetMatch[1]})`,
      worked: overallSuccess,
    });
  }

  // Pattern: Asking for discount
  const discountPattern =
    /(?:any discount|discount (?:for|if)|special (?:rate|price|deal)|first-time|loyalty|repeat customer)/i;
  if (discountPattern.test(normalized)) {
    tactics.push({
      description: "Asking for a discount or special rate",
      worked: overallSuccess,
    });
  }

  // Pattern: Flexibility / counter-offer
  const flexPattern =
    /(?:can you do (?:it )?for|would you (?:take|accept|do it for)|how about|what about|could you come down to)\s*\$?(\d+)/i;
  const flexMatch = normalized.match(flexPattern);
  if (flexMatch) {
    tactics.push({
      description: `Counter-offering at $${flexMatch[1]}`,
      worked: overallSuccess,
    });
  }

  // Pattern: Bundling / repeat business
  const bundlePattern =
    /(?:if I book (?:again|another|more)|next (?:month|week|time)|regular (?:customer|work|business)|ongoing|bundle|multiple (?:jobs|services))/i;
  if (bundlePattern.test(normalized)) {
    tactics.push({
      description: "Offering repeat/bundle business for a better rate",
      worked: overallSuccess,
    });
  }

  // Pattern: Urgency / scheduling flexibility
  const flexSchedulePattern =
    /(?:flexible (?:on|with) (?:timing|schedule|date)|any (?:day|time) works|not in a rush|whenever (?:works|you're free))/i;
  if (flexSchedulePattern.test(normalized)) {
    tactics.push({
      description: "Offering scheduling flexibility for a lower price",
      worked: overallSuccess,
    });
  }

  // Pattern: Cash/payment incentive
  const cashPattern =
    /(?:pay (?:in )?cash|cash (?:payment|deal)|pay up ?front|immediate payment)/i;
  if (cashPattern.test(normalized)) {
    tactics.push({
      description: "Offering cash or immediate payment for a discount",
      worked: overallSuccess,
    });
  }

  return { tactics };
}

// ─── getReferralBoost ──────────────────────────────────────────────────────────
/**
 * Checks if there's a referral source for this provider in memory.
 * Returns a rapport-building hint if found, null otherwise.
 */
export async function getReferralBoost(
  containerTag: string,
  providerName: string,
): Promise<string | null> {
  const results = await searchMemories(
    containerTag,
    `${providerName} referral recommended by neighbor friend`,
    5,
  );

  for (const r of results) {
    const content = r.content.toLowerCase();
    // Only consider results actually mentioning this provider
    if (!content.includes(providerName.toLowerCase())) continue;

    // Try to extract who referred them
    const referralPatterns = [
      /(?:recommended by|referred by|suggested by|heard about .* from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:neighbor|friend|coworker|colleague|family)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:recommended|referred|suggested|told)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:recommended|referred|suggested|said to call)/i,
    ];

    for (const pattern of referralPatterns) {
      const match = r.content.match(pattern);
      if (match) {
        return `${match[1]} recommended them`;
      }
    }

    // Generic referral detection without a specific name
    if (
      /\b(neighbor|friend|coworker|family member|colleague)\b.*\b(recommend|referr|suggest)/i.test(
        r.content,
      )
    ) {
      const whoMatch = r.content.match(/\b(neighbor|friend|coworker|family member|colleague)\b/i);
      return `Your ${whoMatch?.[1] ?? "neighbor"} recommended them`;
    }

    if (/\brecommend/i.test(r.content) || /\breferr/i.test(r.content)) {
      return "Someone you know recommended them";
    }
  }

  return null;
}
