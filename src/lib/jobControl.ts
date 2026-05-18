import { generateObject } from "ai";
import { z } from "zod";
import { gemini, GEMINI_FAST } from "./gemini";

export type JobControlIntent =
  | { type: "status" }
  | { type: "cancel" }
  | { type: "modify"; budgetCents?: number; location?: string; timeframe?: string }
  | { type: "skip" }
  | { type: "confirm" }
  | { type: "other"; reply: string };

const JobControlSchema = z.object({
  type: z.enum(["status", "cancel", "modify", "skip", "confirm", "other"]).describe(
    "status = user wants an update on progress. cancel = user wants to stop/abort. " +
    "modify = user wants to change budget/location/timeframe. skip = user wants to try different providers. " +
    "confirm = user is confirming/approving something (yes, do it, book it, pay). " +
    "other = unrelated chat or something that doesn't fit.",
  ),
  budgetCents: z.number().int().nullable().describe("New budget in cents if the user specified one, else null."),
  location: z.string().nullable().describe("New location if the user specified one, else null."),
  timeframe: z.string().nullable().describe("New timeframe if the user specified one, else null."),
  reply: z.string().nullable().describe("For type=other, null. Do NOT generate a reply."),
});

const CANCEL_RE = /\b(cancel|stop|nevermind|never\s*mind|abort|forget\s*it|nvm)\b/i;
const STATUS_RE = /\b(status|update|where are we|how's it going|what's happening|any news|progress)\b/i;
const SKIP_RE = /\b(skip|try (someone|others?|different)|next one|move on)\b/i;
const CONFIRM_RE = /\b(yes|yeah|yep|yup|yea|do it|book it|go ahead|confirm|pay|pay them|done|send it|let's go|for sure|absolutely|go for it)\b/i;
const BUDGET_RE = /\b(?:raise|bump|increase|change)\b.*?\$\s*(\d{2,5})\b|\b\$\s*(\d{2,5})\b.*?\b(?:budget|max|limit)\b/i;

export async function classifyJobControl(text: string): Promise<JobControlIntent> {
  // Fast regex path for obvious cases
  const lower = text.toLowerCase().trim();

  if (CANCEL_RE.test(lower)) return { type: "cancel" };
  if (CONFIRM_RE.test(lower) && lower.length < 30) return { type: "confirm" };
  if (STATUS_RE.test(lower)) return { type: "status" };
  if (SKIP_RE.test(lower)) return { type: "skip" };

  const budgetMatch = text.match(BUDGET_RE);
  if (budgetMatch) {
    const cents = Number(budgetMatch[1] || budgetMatch[2]) * 100;
    return { type: "modify", budgetCents: cents };
  }

  // LLM classification for ambiguous messages
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { type: "other", reply: "still working on it — hang tight" };
  }

  try {
    const { object } = await generateObject({
      model: gemini()(GEMINI_FAST),
      schema: JobControlSchema,
      prompt:
        `The user has an active job (service search in progress). Classify their message.\n\n` +
        `Message: "${text}"\n\n` +
        `- "status" = they want to know what's happening\n` +
        `- "cancel" = they want to stop the search\n` +
        `- "modify" = they want to change budget, location, or timeframe\n` +
        `- "skip" = they want to skip current leads and try others\n` +
        `- "confirm" = they are saying yes/approving (yes, do it, book it, pay, etc)\n` +
        `- "other" = anything else (chat, off-topic, unclear)\n\n` +
        `If type is "other", set reply to null. Do not generate a reply.`,
    });

    if (object.type === "modify") {
      return {
        type: "modify",
        budgetCents: object.budgetCents ?? undefined,
        location: object.location ?? undefined,
        timeframe: object.timeframe ?? undefined,
      };
    }
    if (object.type === "other") {
      return { type: "other", reply: object.reply ?? "still working on it — hang tight" };
    }
    return { type: object.type };
  } catch (e) {
    console.error("[jobControl] gemini failed, falling back", e);
    return { type: "other", reply: "still working on it — hang tight" };
  }
}
