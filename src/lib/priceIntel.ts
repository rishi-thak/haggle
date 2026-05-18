import { addMemory, searchMemories } from "./supermemory";

/**
 * Parse dollar amounts (e.g. "$75", "$1,200.50") from a string and return cents.
 */
function parsePriceCentsFromText(text: string): number[] {
  const matches = text.match(/\$[\d,]+(?:\.\d{1,2})?/g);
  if (!matches) return [];
  return matches.map((m) => {
    const cleaned = m.replace(/[$,]/g, "");
    return Math.round(parseFloat(cleaned) * 100);
  });
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Store a structured price memory for a completed service quote/payment.
 */
export async function recordQuote(
  containerTag: string,
  service: string,
  providerName: string,
  priceCents: number,
): Promise<void> {
  const content = `Paid ${formatCents(priceCents)} for ${service} from ${providerName} on ${todayISO()}`;
  await addMemory(containerTag, content, {
    type: "price_record",
    service,
    provider: providerName,
    priceCents,
  });
}

export interface PriceHistory {
  avgCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  lastPriceCents: number | null;
  count: number;
}

/**
 * Search memory for past prices on a service type, parse dollar amounts, return stats.
 */
export async function getPriceHistory(
  containerTag: string,
  service: string,
): Promise<PriceHistory> {
  const results = await searchMemories(containerTag, `${service} price paid cost quote`, 10);

  const prices: number[] = [];
  for (const r of results) {
    const parsed = parsePriceCentsFromText(r.content);
    if (parsed.length > 0) {
      // If metadata has priceCents, prefer that for accuracy
      if (r.metadata && typeof r.metadata.priceCents === "number") {
        prices.push(r.metadata.priceCents);
      } else {
        prices.push(parsed[0]);
      }
    } else if (r.metadata && typeof r.metadata.priceCents === "number") {
      prices.push(r.metadata.priceCents);
    }
  }

  if (prices.length === 0) {
    return { avgCents: null, minCents: null, maxCents: null, lastPriceCents: null, count: 0 };
  }

  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    avgCents: Math.round(sum / prices.length),
    minCents: Math.min(...prices),
    maxCents: Math.max(...prices),
    lastPriceCents: prices[0], // most relevant result from search is likely the most recent
    count: prices.length,
  };
}

export interface BudgetInsight {
  adjustedBudgetCents: number;
  insight: string | null;
}

/**
 * Compare stated budget to actual historical spend.
 * If the user consistently pays 20%+ over stated budget, nudge budget up.
 */
export async function getBudgetInsight(
  containerTag: string,
  service: string,
  statedBudgetCents: number,
): Promise<BudgetInsight> {
  const history = await getPriceHistory(containerTag, service);

  if (history.avgCents === null || history.count < 2) {
    return { adjustedBudgetCents: statedBudgetCents, insight: null };
  }

  const overshootRatio = (history.avgCents - statedBudgetCents) / statedBudgetCents;

  if (overshootRatio >= 0.2) {
    // User typically pays 20%+ more than they state
    const nudgedCents = Math.round(history.avgCents * 1.05); // nudge slightly above average
    const avgFormatted = formatCents(history.avgCents);
    const nudgedFormatted = formatCents(nudgedCents);
    return {
      adjustedBudgetCents: nudgedCents,
      insight: `You usually end up paying around ${avgFormatted} for ${service} — want me to search up to ${nudgedFormatted}?`,
    };
  }

  return { adjustedBudgetCents: statedBudgetCents, insight: null };
}

/**
 * Build a human-readable price context sentence for the user, comparing the quoted price
 * against their history. Returns null if no history is available.
 */
export async function buildPriceContext(
  containerTag: string,
  service: string,
  quotedCents: number,
): Promise<string | null> {
  const history = await getPriceHistory(containerTag, service);

  if (history.avgCents === null || history.count === 0) {
    return null;
  }

  const quotedFormatted = formatCents(quotedCents);

  // Check if this is the cheapest ever
  if (history.minCents !== null && quotedCents < history.minCents) {
    return `${quotedFormatted} is the cheapest quote you've gotten for ${service}.`;
  }

  // Compare to last price
  if (history.lastPriceCents !== null && history.lastPriceCents !== quotedCents) {
    const diff = quotedCents - history.lastPriceCents;
    const pctChange = Math.round(Math.abs(diff / history.lastPriceCents) * 100);
    if (pctChange >= 5) {
      const direction = diff < 0 ? "below" : "above";
      return `This is ${pctChange}% ${direction} what you paid last time for ${service}.`;
    }
  }

  // Compare to average
  if (history.avgCents !== null) {
    const diff = quotedCents - history.avgCents;
    const pctChange = Math.round(Math.abs(diff / history.avgCents) * 100);
    if (pctChange >= 10) {
      const direction = diff < 0 ? "below" : "above";
      return `This is ${pctChange}% ${direction} your average for ${service} (${formatCents(history.avgCents)}).`;
    }
  }

  // Close to normal — no insight needed
  return null;
}
