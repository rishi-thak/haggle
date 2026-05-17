import { generateObject } from "ai";
import { z } from "zod";
import { gemini, GEMINI_FAST } from "./gemini";

export const IntentSchema = z.object({
  service: z.string().describe("The service the user wants, normalized e.g. 'car detailing'"),
  location: z.string().describe("City or neighborhood. Default to 'San Francisco' if unspecified."),
  budgetCents: z.number().int().nullable().describe("Max budget in USD cents, or null if unspecified."),
  timeframe: z.string().describe("When the user wants it done, e.g. 'this weekend', 'today', 'ASAP'."),
  notes: z.string().describe("Any other constraints or preferences worth passing to providers."),
});

export type Intent = z.infer<typeof IntentSchema>;

export async function parseIntent(userMessage: string): Promise<Intent> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return fallbackParse(userMessage);
  }
  try {
    const { object } = await generateObject({
      model: gemini()(GEMINI_FAST),
      schema: IntentSchema,
      prompt:
        `Extract a structured service request from this user text.\n\n` +
        `User: "${userMessage}"\n\n` +
        `If budget contains "under $100" or "$50", convert to cents. ` +
        `If no location, return "San Francisco". If no timeframe, return "ASAP".`,
    });
    return object;
  } catch (e) {
    console.error("[intent] gemini failed, falling back", e);
    return fallbackParse(userMessage);
  }
}

function fallbackParse(s: string): Intent {
  const lower = s.toLowerCase();
  const budgetMatch = lower.match(/\$?\s*(\d{2,5})/);
  const budgetCents = budgetMatch ? Number(budgetMatch[1]) * 100 : null;
  let location = "San Francisco";
  if (/\bsf\b|san francisco/i.test(lower)) location = "San Francisco";
  else if (/\bnyc\b|new york/i.test(lower)) location = "New York";
  else if (/\bla\b|los angeles/i.test(lower)) location = "Los Angeles";
  return {
    service: s.replace(/(get|find|book|me|my)/gi, "").replace(/\s+/g, " ").trim().slice(0, 80),
    location,
    budgetCents,
    timeframe: /today|asap|now/i.test(lower) ? "today" : /weekend/i.test(lower) ? "this weekend" : "ASAP",
    notes: "",
  };
}
