import { BrowserUse } from "browser-use-sdk";
// browser-use-sdk requires Zod v4 for its `schema` option (it calls `z.toJSONSchema`).
// Our app uses Zod v3 elsewhere; we keep them as separate packages via the `zod4` alias.
import { z as z4 } from "zod4";
import { env } from "./env";

const LeadSchema = z4.object({
  name: z4.string(),
  phone: z4.string().nullable().optional(),
  email: z4.string().nullable().optional(),
  address: z4.string().nullable().optional(),
  rating: z4.number().nullable().optional(),
  source_url: z4.string().nullable().optional(),
});

const LeadsResponseSchema = z4.object({
  leads: z4.array(LeadSchema),
});

export type ScrapedLead = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  rating?: number;
  source_url?: string;
};

function buildTask(service: string, location: string, count: number): string {
  return (
    `Search Google Maps for "${service}" near "${location}". ` +
    `Open the listing for the top ${count} businesses. ` +
    `For each business, capture: name, phone (full international format like +14155551234 if listed), ` +
    `email (if shown), street address, average star rating (number), and the Google Maps URL of the listing. ` +
    `Return the results as a "leads" array. Use null for any field that isn't visible on the listing. ` +
    `Stop after ${count} businesses; do not visit further pages.`
  );
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
  try {
    const client = new BrowserUse({ apiKey: env.BROWSER_USE_API_KEY });
    const result = await client.run(buildTask(service, location, count), {
      schema: LeadsResponseSchema,
    });
    const output = result.output as unknown as { leads?: z4.infer<typeof LeadSchema>[] };
    if (!output || !Array.isArray(output.leads)) {
      console.error("[browseruse] empty/invalid output", output);
      return [];
    }
    return output.leads
      .map((r) => ({
        name: (r.name ?? "").trim(),
        phone: r.phone ?? undefined,
        email: r.email ?? undefined,
        address: r.address ?? undefined,
        rating: r.rating ?? undefined,
        source_url: r.source_url ?? undefined,
      }))
      .filter((l) => l.name.length > 0);
  } catch (e) {
    console.error("[browseruse] scrape failed", e);
    return [];
  }
}

/* ─── stage 2: enrichment ────────────────────────────────────────────────── */

const EnrichmentSchema = z4.object({
  email: z4.string().nullable(),
  website_summary: z4.string().nullable(),
  reddit_sentiment: z4.enum(["positive", "negative", "mixed", "unknown"]),
  reddit_notes: z4.string().nullable(),
});

export interface LeadEnrichment {
  email?: string;
  websiteSummary?: string;
  redditSentiment?: "positive" | "negative" | "mixed" | "unknown";
  redditNotes?: string;
}

function buildEnrichmentTask(args: {
  name: string;
  service: string;
  location: string;
  sourceUrl?: string;
}): string {
  const escapedName = args.name.replace(/"/g, "");
  return (
    `You are gathering negotiation context about a local service provider.\n\n` +
    `Provider: ${escapedName}\n` +
    `Service: ${args.service}\n` +
    `Location: ${args.location}\n` +
    `Source URL: ${args.sourceUrl ?? "(none)"}\n\n` +
    `Step 1 (website + email). ${args.sourceUrl ? `Open ${args.sourceUrl}. If it's a Google Maps listing, find and follow the link to the business's own website. ` : "Search Google for the provider's official website and open it. "}` +
    `On the website, capture any public contact email and a one-sentence summary of their pricing tier or services ` +
    `(e.g. "premium full-detail shop, packages $80–$200" or "budget mobile detailer, no pricing listed").\n\n` +
    `Step 2 (Reddit sentiment). Open https://www.google.com/search?q=site%3Areddit.com+%22${encodeURIComponent(escapedName)}%22+%22${encodeURIComponent(args.location)}%22 ` +
    `to find Reddit threads mentioning this specific provider. If you find none, fall back to ` +
    `https://www.google.com/search?q=site%3Areddit.com+%22${encodeURIComponent(args.service)}%22+%22${encodeURIComponent(args.location)}%22+recommend ` +
    `to assess sentiment about this category in this area. Read up to 3 top results. ` +
    `Classify sentiment as positive / negative / mixed / unknown, and write a short notes string with the most useful tactical insight ` +
    `(e.g. "Reddit warns about upsell pressure on full details" or "Locals on r/sanfrancisco recommend over alternatives at $80").\n\n` +
    `Return JSON only. Skip a step gracefully and leave nullable fields null if you cannot complete it. ` +
    `Do not spend more than two minutes total.`
  );
}

export async function enrichLead(args: {
  name: string;
  service: string;
  location: string;
  sourceUrl?: string;
}): Promise<LeadEnrichment> {
  if (!env.BROWSER_USE_API_KEY) return {};
  try {
    const client = new BrowserUse({ apiKey: env.BROWSER_USE_API_KEY });
    const result = await client.run(buildEnrichmentTask(args), {
      schema: EnrichmentSchema,
    });
    const o = result.output as unknown as z4.infer<typeof EnrichmentSchema>;
    return {
      email: o.email ?? undefined,
      websiteSummary: o.website_summary ?? undefined,
      redditSentiment: o.reddit_sentiment,
      redditNotes: o.reddit_notes ?? undefined,
    };
  } catch (e) {
    console.error("[browseruse] enrichLead failed for", args.name, e);
    return {};
  }
}
