import { generateObject, generateText } from "ai";
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
    ? `Customer preferences from prior jobs:\n${ctx.userPreferences.map((p) => `- ${p}`).join("\n")}\n\n`
    : "";
  const history = ctx.pastProviderNotes
    ? `Prior notes about this provider (private intel, never read aloud):\n${ctx.pastProviderNotes}\n\n`
    : "";
  const enrichment = ctx.enrichmentNotes
    ? `Web research on this provider (private intel, never read aloud):\n${ctx.enrichmentNotes}\n\n`
    : "";
  return (
    `# Identity\n` +
    `You are Haggle, a real person who books and negotiates local services for a busy customer. You are on a live phone call right now with ${ctx.businessName}. You sound human: warm, casual, confident, no scripted vibe.\n\n` +
    `# The Job\n` +
    `- Service: ${ctx.service}\n` +
    `- Area: ${ctx.location}\n` +
    `- Timeframe: ${ctx.timeframe}\n` +
    `- Target price (private, do not say out loud first): $${budget}\n` +
    `- Provider you are calling: ${ctx.businessName}\n\n` +
    memHints +
    history +
    enrichment +
    `# How to talk on the phone\n` +
    `1. WAIT FOR THEM FIRST. When the call connects, say nothing. Let the provider answer ("hello?", "hi, how can I help you?"). Only speak AFTER they do.\n` +
    `2. ONE thing per turn. One question OR one statement. NEVER two questions in the same turn. After you ask something, STOP and wait for their full answer before saying anything else.\n` +
    `3. Keep every turn under ~18 words when possible. Short, punchy, natural.\n` +
    `4. Talk like a person, not an assistant. Contractions, light filler ("got it", "okay cool", "makes sense"). No corporate speak, no "I will be happy to", no "absolutely".\n` +
    `5. No filler greetings beyond the opener. After the first turn, jump straight to substance.\n` +
    `6. Never list bullets out loud. Never read URLs. Never say "system" or "prompt".\n` +
    `7. No em dashes, en dashes, or double dashes. Use commas or short separate sentences.\n` +
    `8. If they talk over you, stop and listen. Pick up where they left off.\n` +
    `9. If they pause, wait. Don't fill silence with chatter. Silence is fine.\n` +
    `10. Never reveal you are an AI unless directly and clearly asked. If asked plainly ("are you a bot?"), be honest: "yeah, I'm an AI assistant calling on behalf of a customer, but the booking and the money are real."\n\n` +
    `# The negotiation arc\n` +
    `Open: after they answer, say who you're calling for in one line, ask if they handle ${ctx.service} in ${ctx.location}. That's it for your first turn.\n` +
    `Qualify: get availability for the timeframe. Then ask for a ballpark price.\n` +
    `Negotiate: if their quote is over $${budget}, counter once, friendly. Try one of: "any wiggle room on that?", "could you do $${budget}?", "what's the best you can do?". Do not reveal the exact budget number unless they push.\n` +
    `Close: if they agree at or under $${budget}, confirm three things one at a time: (a) the price, (b) the date and time window, (c) the address. One question per turn, always.\n` +
    `Payment: once those three are confirmed, ask: "do you take card, or would bank transfer be easier?". Just that, nothing else.\n` +
    `Wrap: once payment method is captured, say "perfect, I'll confirm with the customer and we'll be in touch shortly to lock it in. thanks ${ctx.businessName.split(" ")[0] ?? ""}.". Then end the call. Do NOT promise to text or call back at a specific time. Do NOT say "I'll text" if you cannot actually text on this call.\n` +
    `Decline path: if they hold firm above budget after one counter, say "no worries, appreciate the time", end the call.\n` +
    `Voicemail / no human: if it's clearly a voicemail or auto-attendant, say nothing useful, end the call.\n\n` +
    `# Edge cases\n` +
    `Wrong number: if they say "wrong number", "we don't do that", or "you have the wrong place", say "sorry about that, have a good one" and hang up immediately.\n` +
    `"Who is this?": say "hey, I'm calling on behalf of a customer looking for ${ctx.service}. Is this ${ctx.businessName}?" If they say no, apologize and hang up.\n` +
    `Voicemail: if you hear a beep, "leave a message", "you've reached", "mailbox", "not available", "after the tone", or any recorded greeting, say nothing and hang up immediately. Do not leave a message.\n` +
    `Hold: if they say "hold on", "one sec", "let me check", just say "sure" and wait silently.\n\n` +
    `# Hangup discipline\n` +
    `End the call as soon as ONE of these is true:\n` +
    `- You said your closing line ("thanks", "appreciate the time", "we'll be in touch").\n` +
    `- They said goodbye, hung up, or asked you to stop calling.\n` +
    `- It is clearly a voicemail or auto-attendant (beep, recorded message, "leave a message").\n` +
    `- They said "wrong number" or confirmed this is not the business you're calling.\n` +
    `- The conversation has obviously concluded and you have nothing left to ask.\n` +
    `Do not linger. Do not repeat yourself. Do not ask "anything else?" forever. When done, you MUST signal end-of-call in your structured output.\n`
  );
}

export interface NegotiationSummary {
  outcome: NegotiationOutcome;
  quotedPriceCents: number | null;
  paymentMethod: "card" | "ach" | null;
  summary: string;
}

export const NegotiationOutcomeSchema = z.object({
  outcome: z.enum(NEGOTIATION_OUTCOME_VALUES),
  quotedPriceCents: z.number().int().nullable(),
  paymentMethod: z.enum(["card", "ach"]).nullable().describe("Provider's preferred payment method: card or ach (bank transfer). null if not discussed."),
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
    return { outcome: "no_answer", quotedPriceCents: null, paymentMethod: null, summary: "No answer" };
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
        `Return strict JSON with keys outcome, quotedPriceCents, paymentMethod, and summary. ` +
        `Outcome must be one of: ${NEGOTIATION_OUTCOME_VALUES.join(", ")}. ` +
        `quotedPriceCents must be an integer number of cents or null. ` +
        `paymentMethod must be "card" or "ach" or null (if payment preference was not discussed). ` +
        `summary must be 1-2 sentences.`,
      maxOutputTokens: 200,
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

  const lower = normalized.toLowerCase();
  let paymentMethod: "card" | "ach" | null = null;
  if (/\b(card|credit card|debit card|visa|mastercard)\b/i.test(lower)) {
    paymentMethod = "card";
  } else if (/\b(bank transfer|ach|direct deposit|wire|bank account)\b/i.test(lower)) {
    paymentMethod = "ach";
  }

  return {
    outcome,
    quotedPriceCents: priceCents,
    paymentMethod,
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

export interface TurnResult {
  text: string;
  shouldHangup: boolean;
}

const TurnSchema = z.object({
  text: z.string().describe("What Haggle says next on the call. One sentence. One question max. No em dashes."),
  shouldHangup: z
    .boolean()
    .describe(
      "True ONLY if this is your final line and the call should end after you say it (closing line, decline, voicemail, or they said goodbye). Otherwise false.",
    ),
});

const GOODBYE_PATTERNS = [
  /\bbye\b/i,
  /\bgoodbye\b/i,
  /\bhave a (good|great|nice) (one|day|night|evening)\b/i,
  /\btake care\b/i,
  /\bappreciate (it|the time|your time)\b/i,
  /\btalk (to you )?(soon|later)\b/i,
  /\bnot interested\b/i,
  /\bstop calling\b/i,
  /\bremove (me|us) from\b/i,
  /\bwrong number\b/i,
  /\byou have the wrong\b/i,
  /\bwe don'?t do that\b/i,
];

const VOICEMAIL_PATTERNS = [
  /\bvoicemail\b/i,
  /\bafter the (tone|beep)\b/i,
  /\bat the tone\b/i,
  /\bmailbox (is )?full\b/i,
  /\bleave (a |your )?message after\b/i,
  /\bnot available.{0,20}leave (a |your )?message\b/i,
  /\byou'?ve reached.{0,40}(leave|record|not available|unavailable)\b/i,
];

// If the agent says one of these in its own outgoing turn, the call is done.
// This is the deterministic backstop for when the LLM forgets to set shouldHangup.
const AGENT_CLOSING_PATTERNS = [
  /\b(we'?ll|i'?ll) (be in touch|confirm with the customer|reach back out)\b/i,
  /\bappreciate (the time|your time|it)\b/i,
  /\bthanks (so much )?(for (the time|your time|chatting))\b/i,
  /\bno worries[,.!]?\s+(appreciate|thanks)/i,
  /\b(have a (good|great|nice) (one|day|rest of your))\b/i,
  /\btalk (to you )?(soon|later)\b/i,
  /\bgoodbye\b/i,
  /^bye[.!]?$/i,
];

export function detectAgentClosing(text: string): boolean {
  return AGENT_CLOSING_PATTERNS.some((p) => p.test(text));
}

export function detectVoicemail(text: string): boolean {
  return VOICEMAIL_PATTERNS.some((p) => p.test(text));
}

export function detectLeadGoodbye(text: string): boolean {
  return GOODBYE_PATTERNS.some((p) => p.test(text)) || detectVoicemail(text);
}

/**
 * Voice webhook turn handler: produce next thing for the agent to say, plus a
 * hangup signal so the call ends naturally instead of looping.
 */
export async function nextTurn(
  ctx: NegotiationContext,
  history: { role: "agent" | "lead"; text: string }[],
  latestLeadUtterance: string,
): Promise<TurnResult> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return defaultTurn(ctx, history.length);
  }
  const system = buildSystemPrompt(ctx);
  const dialogue = history
    .concat([{ role: "lead", text: latestLeadUtterance }])
    .map((h) => `${h.role === "agent" ? "Me" : ctx.businessName}: ${h.text}`)
    .join("\n");
  try {
    const { object } = await generateObject({
      model: gemini()(GEMINI_FAST),
      system,
      schema: TurnSchema,
      prompt:
        `${dialogue}\n\nNow produce Haggle's next line. Rules: one sentence only, one question max, then STOP. Do not ask a follow-up question in the same turn. Wait for their answer. Sound human. ` +
        `If the conversation has reached its natural end (you're closing, they declined, they said bye, or it's voicemail), set shouldHangup=true.`,
      maxOutputTokens: 200,
    });
    let text = object.text.trim().replace(/[—–]+|--/g, ",");
    if (!text) text = defaultTurn(ctx, history.length).text;
    const leadSaidBye = detectLeadGoodbye(latestLeadUtterance);
    const agentClosing = detectAgentClosing(text);
    const shouldHangup = object.shouldHangup || leadSaidBye || agentClosing;
    console.log("[negotiator] turn", {
      turnCount: history.length,
      leadSaidBye,
      agentClosing,
      modelHangup: object.shouldHangup,
      shouldHangup,
      text,
    });
    return { text, shouldHangup };
  } catch (e) {
    console.error("[negotiator] nextTurn failed", e);
    return defaultTurn(ctx, history.length);
  }
}

function defaultTurn(ctx: NegotiationContext, turnCount: number): TurnResult {
  const budget = (ctx.budgetCents / 100).toFixed(0);
  if (turnCount === 0) {
    return {
      text: `Hey, calling on behalf of a customer who needs ${ctx.service} ${ctx.timeframe}. Do you handle that?`,
      shouldHangup: false,
    };
  }
  if (turnCount === 1) {
    return { text: `What would you charge for that?`, shouldHangup: false };
  }
  if (turnCount === 2) {
    return { text: `Their budget is around $${budget}, any wiggle room?`, shouldHangup: false };
  }
  return { text: `Got it, thanks for the time.`, shouldHangup: true };
}
