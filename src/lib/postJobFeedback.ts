import { addMemory, searchMemories, addProviderFeedback } from "./supermemory";

export function askForRating(service: string, providerName: string): string {
  return `how was ${providerName.toLowerCase()}'s ${service}? quick 1-5 and any notes help me pick better next time`;
}

export function parseRatingReply(text: string): { rating: number | null; notes: string | null } {
  const trimmed = text.trim().toLowerCase();

  // Check for word-based ratings
  const wordRatings: Record<string, number> = {
    terrible: 1,
    awful: 1,
    horrible: 1,
    bad: 2,
    poor: 2,
    ok: 3,
    okay: 3,
    fine: 3,
    decent: 3,
    good: 4,
    great: 5,
    excellent: 5,
    amazing: 5,
    perfect: 5,
    fantastic: 5,
    wonderful: 5,
  };

  // Try numeric rating first: "4 he was on time"
  const numericMatch = trimmed.match(/^(\d)\s*(.*)/);
  if (numericMatch) {
    const rating = parseInt(numericMatch[1], 10);
    if (rating >= 1 && rating <= 5) {
      const notes = numericMatch[2].trim() || null;
      return { rating, notes };
    }
  }

  // Try word-based rating
  for (const [word, rating] of Object.entries(wordRatings)) {
    if (trimmed.startsWith(word)) {
      const rest = trimmed.slice(word.length).replace(/^[,.\s]+/, "").trim();
      return { rating, notes: rest || null };
    }
  }

  // No recognizable rating
  return { rating: null, notes: trimmed || null };
}

export async function recordPostJobFeedback(
  containerTag: string,
  providerName: string,
  service: string,
  rating: number,
  notes: string | null,
): Promise<void> {
  const sentiment: "positive" | "negative" | "neutral" =
    rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";

  const feedbackText = notes
    ? `Rated ${rating}/5. ${notes}`
    : `Rated ${rating}/5.`;

  if (sentiment !== "neutral") {
    await addProviderFeedback(containerTag, providerName, service, feedbackText, sentiment);
  }

  const today = new Date().toISOString().split("T")[0];
  await addMemory(containerTag, `${providerName} ${service} feedback: ${feedbackText}`, {
    type: "job_feedback",
    provider: providerName,
    service,
    rating,
    date: today,
  });
}

export async function recordServiceInterval(
  containerTag: string,
  service: string,
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  await addMemory(containerTag, `Last ${service} completed on ${today}`, {
    type: "service_interval",
    service,
    date: today,
  });
}

export async function getServiceIntervals(
  containerTag: string,
): Promise<{ service: string; lastDate: string; daysSince: number }[]> {
  const results = await searchMemories(containerTag, "service_interval completed", 20);
  const intervals: { service: string; lastDate: string; daysSince: number }[] = [];
  const today = new Date();

  for (const r of results) {
    // Parse "Last {service} completed on {date}"
    const match = r.content.match(/^Last (.+?) completed on (\d{4}-\d{2}-\d{2})$/);
    if (match) {
      const service = match[1];
      const lastDate = match[2];
      const then = new Date(lastDate);
      const daysSince = Math.floor((today.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
      intervals.push({ service, lastDate, daysSince });
    }
  }

  // Sort by most overdue (highest daysSince first)
  intervals.sort((a, b) => b.daysSince - a.daysSince);
  return intervals;
}

export async function getOverdueServices(
  containerTag: string,
  thresholdDays = 180,
): Promise<{ service: string; lastDate: string; daysSince: number; suggestion: string }[]> {
  const intervals = await getServiceIntervals(containerTag);
  return intervals
    .filter((i) => i.daysSince >= thresholdDays)
    .map((i) => {
      const months = Math.floor(i.daysSince / 30);
      const timeLabel = months >= 12 ? `${Math.floor(months / 12)} year${Math.floor(months / 12) > 1 ? "s" : ""}` : `${months} month${months > 1 ? "s" : ""}`;
      return {
        ...i,
        suggestion: `it's been ${timeLabel} since your last ${i.service} — want me to book again?`,
      };
    });
}
