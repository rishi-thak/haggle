import { BrowserUse } from "browser-use-sdk";
import { env } from "./env";

export interface ScrapedLead {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  rating?: number;
  source_url?: string;
}

const TASK_TEMPLATE = (service: string, location: string, count: number) =>
  `Search Google Maps for "${service}" near "${location}". Open the top ${count} results.\n` +
  `For each business return: name, phone (digits only with + country code if visible), website or Google Maps URL, ` +
  `street address, and average star rating.\n` +
  `Return ONLY a JSON array of objects with keys: name, phone, email, address, rating, source_url. ` +
  `Use null for any missing field. Do not include commentary.`;

function safeJsonExtract(s: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(s);
  } catch { /* noop */ }
  // Try to find the first JSON array
  const m = s.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch { /* noop */ }
  }
  return null;
}

export async function scrapeLeads(
  service: string,
  location: string,
  count = 8,
): Promise<ScrapedLead[]> {
  if (!env.BROWSER_USE_API_KEY) {
    console.warn("[browseruse] no api key, returning empty leads");
    return [];
  }
  process.env.BROWSER_USE_API_KEY = env.BROWSER_USE_API_KEY;
  try {
    const client = new BrowserUse();
    const result = await client.run(TASK_TEMPLATE(service, location, count));
    const raw = (result as { output?: string }).output ?? "";
    const parsed = safeJsonExtract(raw);
    if (!Array.isArray(parsed)) {
      console.error("[browseruse] non-array result", raw.slice(0, 400));
      return [];
    }
    return (parsed as Record<string, unknown>[]).map((r) => ({
      name: String(r.name ?? "").trim(),
      phone: r.phone ? String(r.phone) : undefined,
      email: r.email ? String(r.email) : undefined,
      address: r.address ? String(r.address) : undefined,
      rating: typeof r.rating === "number" ? r.rating : Number(r.rating) || undefined,
      source_url: r.source_url ? String(r.source_url) : undefined,
    })).filter((l) => l.name.length > 0);
  } catch (e) {
    console.error("[browseruse] scrape failed", e);
    return [];
  }
}
