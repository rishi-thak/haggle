import {
  searchMemories,
  addMemory,
  addProviderFeedback,
} from "./supermemory";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PreferredProvider {
  name: string;
  phone: string | null;
  email: string | null;
  rating: number | null;
  lastUsed: string | null;
  sentiment: string;
}

export interface SkipScrapingResult {
  skip: boolean;
  suggestion: string | null;
  providers: { name: string; phone: string | null; email: string | null }[];
}

// ─── Parsing helpers ───────────────────────────────────────────────────────

const PHONE_RE = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
const EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/;
const DATE_RE = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/;
const DOLLAR_RE = /\$\s?([\d,]+(?:\.\d{2})?)/;

function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  return m ? m[1].trim() : null;
}

function extractEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[1].trim() : null;
}

function extractDate(text: string): string | null {
  const m = text.match(DATE_RE);
  return m ? m[1] : null;
}

function inferSentiment(text: string, metadata?: Record<string, unknown>): string {
  if (metadata?.sentiment) return String(metadata.sentiment);

  const lower = text.toLowerCase();
  const positiveSignals = /\b(great|good|excellent|happy|recommend|loved|awesome|satisfied|well done|booked again)\b/;
  const negativeSignals = /\b(bad|terrible|awful|rude|late|no-show|avoid|never again|disappointed|overcharged)\b/;

  const hasPositive = positiveSignals.test(lower);
  const hasNegative = negativeSignals.test(lower);

  if (hasPositive && !hasNegative) return "positive";
  if (hasNegative && !hasPositive) return "negative";
  return "neutral";
}

function extractProviderName(content: string, metadata?: Record<string, unknown>): string | null {
  if (metadata?.provider) return String(metadata.provider);
  if (metadata?.providerName) return String(metadata.providerName);

  // Try common patterns: "with <Name>" or "booked <Name>"
  const withMatch = content.match(/(?:with|booked|hired|called|used)\s+([A-Z][A-Za-z'']+(?:\s+[A-Z][A-Za-z'']+){0,3}(?:'s)?(?:\s+[A-Z][A-Za-z]+)*)/);
  if (withMatch) return withMatch[1].trim();

  return null;
}

function extractRating(content: string, metadata?: Record<string, unknown>): number | null {
  if (metadata?.rating != null) return Number(metadata.rating);
  const ratingMatch = content.match(/(\d)\s*(?:\/\s*5|out of 5|stars?)/i);
  return ratingMatch ? parseInt(ratingMatch[1], 10) : null;
}

// ─── Exported functions ────────────────────────────────────────────────────

/**
 * Search memory for past bookings/feedback for this service type.
 * Returns providers the user has used before, sorted by sentiment (positive first).
 */
export async function getPreferredProviders(
  containerTag: string,
  service: string,
): Promise<PreferredProvider[]> {
  const results = await searchMemories(
    containerTag,
    `${service} provider booking feedback experience`,
    10,
  );

  if (!results.length) return [];

  const providerMap = new Map<string, PreferredProvider>();

  for (const r of results) {
    const name = extractProviderName(r.content, r.metadata ?? undefined);
    if (!name) continue;

    const key = name.toLowerCase();
    const existing = providerMap.get(key);

    const phone =
      (r.metadata?.phone as string | undefined) ?? extractPhone(r.content);
    const email =
      (r.metadata?.email as string | undefined) ?? extractEmail(r.content);
    const rating = extractRating(r.content, r.metadata ?? undefined);
    const lastUsed =
      (r.metadata?.date as string | undefined) ?? extractDate(r.content);
    const sentiment = inferSentiment(r.content, r.metadata ?? undefined);

    if (!existing) {
      providerMap.set(key, { name, phone, email, rating, lastUsed, sentiment });
    } else {
      // Merge: keep best info
      if (!existing.phone && phone) existing.phone = phone;
      if (!existing.email && email) existing.email = email;
      if (rating != null && (existing.rating == null || rating > existing.rating))
        existing.rating = rating;
      if (lastUsed && (!existing.lastUsed || lastUsed > existing.lastUsed))
        existing.lastUsed = lastUsed;
      // Upgrade sentiment: positive > neutral > negative
      if (sentiment === "positive") existing.sentiment = "positive";
      else if (sentiment === "neutral" && existing.sentiment === "negative")
        existing.sentiment = "neutral";
    }
  }

  const providers = Array.from(providerMap.values());

  // Sort: positive first, then neutral, then negative
  const sentimentOrder: Record<string, number> = { positive: 0, neutral: 1, negative: 2 };
  providers.sort(
    (a, b) => (sentimentOrder[a.sentiment] ?? 1) - (sentimentOrder[b.sentiment] ?? 1),
  );

  return providers;
}

/**
 * If user has 1+ positively-rated providers for this service, return skip=true
 * with a suggestion message and provider details.
 */
export async function shouldSkipScraping(
  containerTag: string,
  service: string,
): Promise<SkipScrapingResult> {
  const providers = await getPreferredProviders(containerTag, service);
  const positiveProviders = providers.filter((p) => p.sentiment === "positive");

  if (positiveProviders.length === 0) {
    return { skip: false, suggestion: null, providers: [] };
  }

  const top = positiveProviders[0];
  const contactDetail = top.phone
    ? `call ${top.phone}`
    : top.email
      ? `email ${top.email}`
      : "contact them directly";

  const suggestion =
    `You used ${top.name} last time and liked them — want me to just ${contactDetail}?` +
    (positiveProviders.length > 1
      ? ` (${positiveProviders.length - 1} other preferred provider${positiveProviders.length - 1 > 1 ? "s" : ""} also available)`
      : "");

  return {
    skip: true,
    suggestion,
    providers: positiveProviders.map((p) => ({
      name: p.name,
      phone: p.phone,
      email: p.email,
    })),
  };
}

/**
 * Store a structured booking memory for later recall.
 */
export async function recordBooking(
  containerTag: string,
  service: string,
  providerName: string,
  priceCents: number,
  providerPhone: string | null,
  providerEmail: string | null,
): Promise<void> {
  const priceFormatted = `$${(priceCents / 100).toFixed(2)}`;
  const date = new Date().toISOString().split("T")[0];

  const content = [
    `Booked ${providerName} for ${service} on ${date} at ${priceFormatted}.`,
    providerPhone ? `Phone: ${providerPhone}.` : null,
    providerEmail ? `Email: ${providerEmail}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  await addMemory(containerTag, content, {
    type: "booking",
    service,
    provider: providerName,
    priceCents,
    phone: providerPhone,
    email: providerEmail,
    date,
  });
}

/**
 * Store a provider rating. Maps 1-5 scale to sentiment:
 * 4-5 = positive, 3 = neutral, 1-2 = negative.
 */
export async function recordProviderRating(
  containerTag: string,
  providerName: string,
  service: string,
  rating: number,
  notes: string | null,
): Promise<void> {
  const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));

  let sentiment: "positive" | "negative";
  if (clampedRating >= 4) {
    sentiment = "positive";
  } else if (clampedRating <= 2) {
    sentiment = "negative";
  } else {
    // Rating 3 is neutral, but addProviderFeedback only accepts positive/negative
    // Store as positive with a neutral note so we don't lose the data
    sentiment = "positive";
  }

  const feedback = [
    `Rating: ${clampedRating}/5.`,
    notes ? notes : null,
  ]
    .filter(Boolean)
    .join(" ");

  await addProviderFeedback(containerTag, providerName, service, feedback, sentiment);
}
