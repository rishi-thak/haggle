import { generateText } from "ai";
import { z } from "zod";
import { gemini, GEMINI_FAST } from "./gemini";
import {
  NEGOTIATION_OUTCOME_VALUES,
  type NegotiationContext,
  type NegotiationOutcome,
  type NegotiationStatusSnapshot,
} from "./types";

export function buildSystemPrompt(ctx: NegotiationContext): string {
  const budget = (ctx.budgetCents / 100).toFixed(0);
  const memHints = ctx.userPreferences.length
    ? `User preferences from past conversations:\n${ctx.userPreferences.map((p) => `- ${p}`).join("\n")}\n`
    : "";
  const history = ctx.pastProviderNotes
    ? `Prior notes about this provider:\n${ctx.pastProviderNotes}\n`
    : "";
  const enrichment = ctx.enrichmentNotes
    ? `Web research on this provider (use as tactical intel, don't read aloud):\n${ctx.enrichmentNotes}\n`
    : "";
  return (
    `You are Haggle, a polite but firm negotiation assistant calling on behalf of a customer.\n` +
    `Goal: book ${ctx.service} in ${ctx.location} for $${budget} or less, ${ctx.timeframe}.\n\n` +
    `Calling: ${ctx.businessName}\n\n` +
    memHints +
    history +
    enrichment +
    `\nRules:\n` +
    `1. Keep responses short and conversational (1-2 sentences).\n` +
    `2. Lead by asking for availability and a quote.\n` +
    `3. If their quote is over budget, counter once with the budget number and ask if they can match it.\n` +
    `4. If they hold firm, politely thank and end the call.\n` +
    `5. If they accept, confirm the price, date/time, and address, then say "I'll text the customer to confirm and call you back to book."\n` +
    `6. Never reveal you are an AI unless directly asked. If asked, be honest.\n`
  );
}

export interface NegotiationSummary {
  outcome: NegotiationOutcome;
  quotedPriceCents: number | null;
  summary: string;
}

export const NegotiationOutcomeSchema = z.object({
  outcome: z.enum(NEGOTIATION_OUTCOME_VALUES),
  quotedPriceCents: z.number().int().nullable(),
  summary: z.string().describe("1-2 sentence summary of the call result"),
});

const CALLBACK_HINTS = [
  /\bcall (?:me|us|back)\b/i,
  /\bcallback\b/i,
  /\bring\b.*\bback\b/i,
  /\breach out\b.*\blater\b/i,
] as const;

const DECLINE_HINTS = [
  /\bcan(?:not|'t)\b/i,
  /\bwon't\b/i,
  /\bnot interested\b/i,
  /\bwe (?:do not|don't) provide\b/i,
  /\btoo (?:busy|booked)\b/i,
] as const;

const AMBIGUOUS_HINTS = [
  /\bmaybe\b/i,
  /\bnot sure\b/i,
  /\bdepends\b/i,
  /\bcheck (?:the )?schedule\b/i,
  /\bneed to confirm\b/i,
] as const;

const NO_ANSWER_HINTS = [
  /\bvoicemail\b/i,
  /\bno answer\b/i,
  /\bdisconnected\b/i,
  /\bline busy\b/i,
] as const;

const NEGOTIATION_STATUS_MAP: Record<NegotiationOutcome, NegotiationStatusSnapshot> = {
  agreed: { leadStatus: "agreed", suggestedJobStatus: "awaiting_confirm", isTerminal: true },
  declined: { leadStatus: "declined", suggestedJobStatus: "negotiating", isTerminal: true },
  no_answer: { leadStatus: "no_answer", suggestedJobStatus: "calling", isTerminal: false },
  callback: { leadStatus: "callback", suggestedJobStatus: "awaiting_callback", isTerminal: false },
  ambiguous: { leadStatus: "ambiguous", suggestedJobStatus: "negotiating", isTerminal: false },
};

/**
 * Central outcome-to-status mapping so callers do not collapse callback/unclear
 * calls into a hard decline.
 */
export function getNegotiationStatusSnapshot(outcome: NegotiationOutcome): NegotiationStatusSnapshot {
  return NEGOTIATION_STATUS_MAP[outcome];
}

export async function summarizeCall(
  ctx: NegotiationContext,
  transcript: string,
): Promise<NegotiationSummary> {
  if (!transcript.trim()) {
    return { outcome: "no_answer", quotedPriceCents: null, summary: "No answer" };
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return naiveSummarize(transcript, ctx);
  }
  try {
    const { text } = await generateText({
      model: gemini()(GEMINI_FAST),
      prompt:
        `Negotiation transcript with ${ctx.businessName}. Target was $${(ctx.budgetCents / 100).toFixed(0)} for ${ctx.service}.\n\n` +
        `Transcript:\n${transcript}\n\n` +
        `Return strict JSON with keys outcome, quotedPriceCents, and summary. ` +
        `Outcome must be one of: ${NEGOTIATION_OUTCOME_VALUES.join(", ")}. ` +
        `quotedPriceCents must be an integer number of cents or null. ` +
        `summary must be 1-2 sentences.`,
      maxOutputTokens: 160,
    });
    return NegotiationOutcomeSchema.parse(JSON.parse(text)) as NegotiationSummary;
  } catch (e) {
    console.error("[negotiator] summarize failed, falling back", e);
    return naiveSummarize(transcript, ctx);
  }
}

function naiveSummarize(transcript: string, ctx: NegotiationContext): NegotiationSummary {
  const priceMatches = Array.from(transcript.matchAll(/\$\s*(\d{2,5})/g));
  const latestPrice = priceMatches.at(-1)?.[1];
  const priceCents = latestPrice ? Number(latestPrice) * 100 : null;
  const normalized = transcript.replace(/\s+/g, " ").trim();
  const agreed = priceCents !== null && priceCents <= ctx.budgetCents;
  const callbackRequested = CALLBACK_HINTS.some((pattern) => pattern.test(normalized));
  const noAnswer = NO_ANSWER_HINTS.some((pattern) => pattern.test(normalized));
  const clearlyDeclined = DECLINE_HINTS.some((pattern) => pattern.test(normalized));
  const ambiguous = AMBIGUOUS_HINTS.some((pattern) => pattern.test(normalized));

  let outcome: NegotiationOutcome;
  if (agreed) {
    outcome = "agreed";
  } else if (callbackRequested) {
    outcome = "callback";
  } else if (noAnswer || normalized.length < 24) {
    outcome = "no_answer";
  } else if (clearlyDeclined) {
    outcome = "declined";
  } else if (priceCents !== null || ambiguous || normalized.length > 50) {
    outcome = "ambiguous";
  } else {
    outcome = "no_answer";
  }

  return {
    outcome,
    quotedPriceCents: priceCents,
    summary: summarizeFallbackOutcome(outcome, priceCents),
  };
}

function summarizeFallbackOutcome(outcome: NegotiationOutcome, priceCents: number | null): string {
  if (outcome === "agreed" && priceCents !== null) {
    return `Quoted $${(priceCents / 100).toFixed(0)}, within budget.`;
  }
  if (outcome === "declined" && priceCents !== null) {
    return `Quoted $${(priceCents / 100).toFixed(0)}, above budget or declined.`;
  }
  if (outcome === "callback") {
    return "Provider asked for a callback before confirming price or availability.";
  }
  if (outcome === "ambiguous") {
    return "Call ended without a firm yes or no.";
  }
  return "No answer or no usable pricing details.";
}

/**
 * Voice webhook turn handler: produce next thing for the agent to say.
 */
export async function nextTurn(
  ctx: NegotiationContext,
  history: { role: "agent" | "lead"; text: string }[],
  latestLeadUtterance: string,
): Promise<string> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return defaultTurn(ctx, history.length);
  }
  const system = buildSystemPrompt(ctx);
  const dialogue = history
    .concat([{ role: "lead", text: latestLeadUtterance }])
    .map((h) => `${h.role === "agent" ? "Me" : ctx.businessName}: ${h.text}`)
    .join("\n");
  try {
    const { text } = await generateText({
      model: gemini()(GEMINI_FAST),
      system,
      prompt: `${dialogue}\nMe:`,
      maxOutputTokens: 120,
    });
    return text.trim();
  } catch (e) {
    console.error("[negotiator] nextTurn failed", e);
    return defaultTurn(ctx, history.length);
  }
}

function defaultTurn(ctx: NegotiationContext, turnCount: number): string {
  const budget = (ctx.budgetCents / 100).toFixed(0);
  if (turnCount === 0)
    return `Hi, I'm calling on behalf of a customer who needs ${ctx.service} ${ctx.timeframe}. Do you have availability, and what would you charge?`;
  if (turnCount === 1)
    return `Their budget is $${budget}. Can you do it at that price?`;
  return `Got it, thanks. I'll text the customer and call back to confirm.`;
}
