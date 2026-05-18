import { generateObject } from "ai";
import { z } from "zod";
import { gemini, GEMINI_FAST } from "./gemini";
import { getServiceAddress } from "./userDefaults";

export const IntentSchema = z.object({
  service: z.string().describe("The service the user wants, normalized e.g. 'car detailing'"),
  location: z.string().describe("City or neighborhood. Return 'UNKNOWN' if the user did not specify any location."),
  budgetCents: z.number().int().nullable().describe("Max budget in USD cents, or null if unspecified."),
  timeframe: z.string().describe("When the user wants it done, e.g. 'this weekend', 'today', 'ASAP'."),
  notes: z.string().describe("Any other constraints or preferences worth passing to providers."),
  specificProvider: z
    .string()
    .nullable()
    .describe(
      "Exact business name if the user named a specific provider they want called " +
        "(e.g. 'call Mike's Auto Detail and book it' → 'Mike's Auto Detail'). " +
        "null if the user just described a service generically.",
    ),
});

export type Intent = z.infer<typeof IntentSchema>;

export async function parseIntent(userMessage: string, containerTag?: string): Promise<Intent> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return fallbackParse(userMessage, containerTag);
  }
  try {
    const { object } = await generateObject({
      model: gemini()(GEMINI_FAST),
      schema: IntentSchema,
      prompt:
        `Extract a structured service request from this user text.\n\n` +
        `User: "${userMessage}"\n\n` +
        `If budget contains "under $100" or "$50", convert to cents. ` +
        `If no location is mentioned at all, return "UNKNOWN". If no timeframe, return "ASAP". ` +
        `specificProvider: only set if the user names a specific business (e.g. "call Joe's Detail", ` +
        `"book me with Mike's Plumbing"). Generic phrases like "find a plumber" → null.`,
    });
    // Resolve UNKNOWN location from user's saved address
    if (object.location === "UNKNOWN" && containerTag) {
      const saved = await getServiceAddress(containerTag);
      if (saved) {
        const city = saved.address.split(",").slice(-2, -1)[0]?.trim() || saved.address;
        object.location = city;
      }
    }
    if (object.location === "UNKNOWN") {
      object.location = "San Francisco";
    }
    return object;
  } catch (e) {
    console.error("[intent] gemini failed, falling back", e);
    return fallbackParse(userMessage, containerTag);
  }
}

async function fallbackParse(s: string, containerTag?: string): Promise<Intent> {
  const lower = s.toLowerCase();
  const budgetMatch = lower.match(/\$?\s*(\d{2,5})/);
  const budgetCents = budgetMatch ? Number(budgetMatch[1]) * 100 : null;
  let location = "";
  if (/\bsf\b|san francisco/i.test(lower)) location = "San Francisco";
  else if (/\bnyc\b|new york/i.test(lower)) location = "New York";
  else if (/\bla\b|los angeles/i.test(lower)) location = "Los Angeles";

  if (!location && containerTag) {
    const saved = await getServiceAddress(containerTag);
    if (saved) {
      const city = saved.address.split(",").slice(-2, -1)[0]?.trim() || saved.address;
      location = city;
    }
  }
  if (!location) location = "San Francisco";

  return {
    service: s.replace(/(get|find|book|me|my)/gi, "").replace(/\s+/g, " ").trim().slice(0, 80),
    location,
    budgetCents,
    timeframe: /today|asap|now/i.test(lower) ? "today" : /weekend/i.test(lower) ? "this weekend" : "ASAP",
    notes: "",
    specificProvider: null,
  };
}
