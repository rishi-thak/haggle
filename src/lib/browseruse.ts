import { BrowserUse, type MessageResponse, type SessionResponse } from "browser-use-sdk/v3";
// browser-use-sdk requires Zod v4 for its `schema` option (it calls `z.toJSONSchema`).
// Our app uses Zod v3 elsewhere; we keep them as separate packages via the `zod4` alias.
import { z as z4 } from "zod4";
import { env } from "./env";

const TERMINAL_SESSION_STATUSES = new Set(["idle", "stopped", "timed_out", "error"]);
const DEFAULT_BROWSER_USE_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_BROWSER_USE_INTERVAL_MS = 2_000;

export type BrowserUseObservedSession = {
  id: string;
  liveUrl: string | null;
  status: string;
  stepCount: number;
  lastStepSummary: string | null;
  screenshotUrl: string | null;
};

export type BrowserUseObservedMessage = {
  id: string;
  type: string;
  summary: string;
  screenshotUrl: string | null;
  hidden: boolean;
  createdAt: number;
};

export type BrowserUseTaskObserver = {
  onSessionStarted?: (session: BrowserUseObservedSession) => Promise<void>;
  onSessionUpdated?: (session: BrowserUseObservedSession) => Promise<void>;
  onMessage?: (message: BrowserUseObservedMessage) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyObserver(callback: () => Promise<void> | undefined): Promise<void> {
  try {
    await callback();
  } catch (error) {
    console.error("[browseruse] progress observer failed", error);
  }
}

function normalizeSession(session: SessionResponse): BrowserUseObservedSession {
  return {
    id: session.id,
    liveUrl: session.liveUrl ?? null,
    status: session.status,
    stepCount: session.stepCount ?? 0,
    lastStepSummary: session.lastStepSummary ?? null,
    screenshotUrl: session.screenshotUrl ?? null,
  };
}

function normalizeMessage(message: MessageResponse): BrowserUseObservedMessage {
  return {
    id: message.id,
    type: message.type,
    summary: message.summary || message.type,
    screenshotUrl: message.screenshotUrl ?? null,
    hidden: message.hidden,
    createdAt: Date.parse(message.createdAt) || Date.now(),
  };
}

function parseStructuredOutput<T extends z4.ZodType>(
  output: unknown,
  schema: T,
): z4.infer<T> | null {
  if (output == null) return null;
  const raw = typeof output === "string" ? JSON.parse(output) : output;
  return schema.parse(raw);
}

async function runBrowserUseTask<T extends z4.ZodType>(args: {
  task: string;
  schema: T;
  observer?: BrowserUseTaskObserver;
  timeoutMs?: number;
}): Promise<z4.infer<T> | null> {
  const client = new BrowserUse({ apiKey: env.BROWSER_USE_API_KEY });
  let sessionId: string | null = null;

  try {
    const created = await client.sessions.create({
      task: args.task,
      keepAlive: false,
      agentmail: false,
      outputSchema: z4.toJSONSchema(args.schema),
    });
    sessionId = created.id;
    await notifyObserver(() => args.observer?.onSessionStarted?.(normalizeSession(created)));

    let cursor: string | null = null;
    const deadline = Date.now() + (args.timeoutMs ?? DEFAULT_BROWSER_USE_TIMEOUT_MS);

    while (Date.now() < deadline) {
      const messages = await client.sessions.messages(sessionId, { after: cursor, limit: 100 });
      for (const message of messages.messages) {
        cursor = message.id;
        await notifyObserver(() => args.observer?.onMessage?.(normalizeMessage(message)));
      }

      const current = await client.sessions.get(sessionId);
      await notifyObserver(() => args.observer?.onSessionUpdated?.(normalizeSession(current)));
      if (TERMINAL_SESSION_STATUSES.has(current.status)) {
        return parseStructuredOutput(current.output, args.schema);
      }

      const remaining = deadline - Date.now();
      await delay(Math.min(DEFAULT_BROWSER_USE_INTERVAL_MS, remaining));
    }

    throw new Error(`Browser Use session ${sessionId} did not complete in time`);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    await notifyObserver(() => args.observer?.onError?.(normalized));
    throw normalized;
  }
}

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
    `You are searching for local service providers offering "${service}" near "${location}". ` +
    `Search across ALL of the following sources and collect up to ${count} total unique leads:\n` +
    `1. Google Maps — search "${service} near ${location}", open top results\n` +
    `2. Craigslist — go to the nearest craigslist city, search Services section for "${service}"\n` +
    `3. Facebook Marketplace — search Services for "${service}" near "${location}"\n` +
    `4. Thumbtack (thumbtack.com) — search for "${service}" in "${location}"\n` +
    `5. TaskRabbit (taskrabbit.com) — search for "${service}" in "${location}"\n` +
    `For each lead capture: name, phone (full international format like +14155551234 if listed), ` +
    `email (if shown), street address or city, average star rating (number), and the source URL.\n` +
    `Deduplicate by phone number. Prefer leads with a phone number.\n` +
    `Return the results as a "leads" array. Use null for any field that isn't visible.`
  );
}

export async function scrapeLeads(
  service: string,
  location: string,
  count = 8,
  observer?: BrowserUseTaskObserver,
): Promise<ScrapedLead[]> {
  if (!env.BROWSER_USE_API_KEY) {
    console.warn("[browseruse] no api key, returning empty leads");
    return [];
  }
  try {
    const output = await runBrowserUseTask({
      task: buildTask(service, location, count),
      schema: LeadsResponseSchema,
      observer,
    });
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
  observer?: BrowserUseTaskObserver;
}): Promise<LeadEnrichment> {
  if (!env.BROWSER_USE_API_KEY) return {};
  try {
    const o = await runBrowserUseTask({
      task: buildEnrichmentTask(args),
      schema: EnrichmentSchema,
      observer: args.observer,
    });
    if (!o) return {};
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
