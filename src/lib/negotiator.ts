import { generateText, generateObject } from "ai";
import { z } from "zod";
import { gemini, GEMINI_FAST } from "./gemini";
import type { NegotiationContext } from "./types";

export function buildSystemPrompt(ctx: NegotiationContext): string {
  const budget = (ctx.budgetCents / 100).toFixed(0);
  const memHints = ctx.userPreferences.length
    ? `User preferences from past conversations:\n${ctx.userPreferences.map((p) => `- ${p}`).join("\n")}\n`
    : "";
  const history = ctx.pastProviderNotes
    ? `Prior notes about this provider:\n${ctx.pastProviderNotes}\n`
    : "";
  return (
    `You are Haggle, a polite but firm negotiation assistant calling on behalf of a customer.\n` +
    `Goal: book ${ctx.service} in ${ctx.location} for $${budget} or less, ${ctx.timeframe}.\n\n` +
    `Calling: ${ctx.businessName}\n\n` +
    memHints +
    history +
    `\nRules:\n` +
    `1. Keep responses short and conversational (1-2 sentences).\n` +
    `2. Lead by asking for availability and a quote.\n` +
    `3. If their quote is over budget, counter once with the budget number and ask if they can match it.\n` +
    `4. If they hold firm, politely thank and end the call.\n` +
    `5. If they accept, confirm the price, date/time, and address, then say "I'll text the customer to confirm and call you back to book."\n` +
    `6. Never reveal you are an AI unless directly asked. If asked, be honest.\n`
  );
}

export const NegotiationOutcomeSchema = z.object({
  outcome: z.enum(["agreed", "declined", "no_answer", "callback", "ambiguous"]),
  quotedPriceCents: z.number().int().nullable(),
  summary: z.string().describe("1-2 sentence summary of the call result"),
});

export type NegotiationOutcome = z.infer<typeof NegotiationOutcomeSchema>;

export async function summarizeCall(
  ctx: NegotiationContext,
  transcript: string,
): Promise<NegotiationOutcome> {
  if (!transcript.trim()) {
    return { outcome: "no_answer", quotedPriceCents: null, summary: "No answer" };
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return naiveSummarize(transcript, ctx);
  }
  try {
    const { object } = await generateObject({
      model: gemini()(GEMINI_FAST),
      schema: NegotiationOutcomeSchema,
      prompt:
        `Negotiation transcript with ${ctx.businessName}. Target was $${(ctx.budgetCents / 100).toFixed(0)} for ${ctx.service}.\n\n` +
        `Transcript:\n${transcript}\n\n` +
        `Decide outcome and extract the final quoted price in cents (or null).`,
    });
    return object;
  } catch (e) {
    console.error("[negotiator] summarize failed, falling back", e);
    return naiveSummarize(transcript, ctx);
  }
}

function naiveSummarize(transcript: string, ctx: NegotiationContext): NegotiationOutcome {
  const m = transcript.match(/\$\s*(\d{2,5})/);
  const priceCents = m ? Number(m[1]) * 100 : null;
  const agreed = priceCents !== null && priceCents <= ctx.budgetCents;
  return {
    outcome: agreed ? "agreed" : transcript.length > 50 ? "declined" : "no_answer",
    quotedPriceCents: priceCents,
    summary: agreed ? `Quoted $${(priceCents! / 100).toFixed(0)}, within budget.` : "Out of budget or unclear.",
  };
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
