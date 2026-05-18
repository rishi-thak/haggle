import { generateObject } from "ai";
import { z } from "zod";
import { gemini, GEMINI_FAST } from "./gemini";

const ResearchSchema = z.object({
  marketContext: z
    .string()
    .describe(
      "1-2 sentence market notes: typical price range, common gotchas, what affects price. " +
        "Used internally; not shown to the user.",
    ),
  questionsMessage: z
    .string()
    .describe(
      "Single casual lowercase text message to send the user asking 2-4 short questions " +
        "that a real provider would need answered before quoting. Fragments, no end periods, " +
        "sounds like a friend. Example for lawn mowing: " +
        "'few qs before i call around — how many acres? riding or push? one-time or recurring?'",
    ),
});

export interface Research {
  marketContext: string;
  questionsMessage: string;
}

export async function gatherResearch(args: {
  service: string;
  location: string;
}): Promise<Research> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      marketContext: "",
      questionsMessage: `before i call around — any specifics i should give them about your ${args.service}?`,
    };
  }
  try {
    const { object } = await generateObject({
      model: gemini()(GEMINI_FAST),
      schema: ResearchSchema,
      prompt:
        `A user wants help booking: "${args.service}" in ${args.location}.\n\n` +
        `Think about what a real ${args.service} provider would ask before quoting a price. ` +
        `Examples:\n` +
        `- lawn mowing: yard size in acres, riding vs push, frequency, edging\n` +
        `- car detailing: vehicle size, interior/exterior, pet hair, ceramic coat\n` +
        `- moving: # of bedrooms, stairs, distance, packing help\n` +
        `- plumbing: nature of the issue, ETA urgency, access\n\n` +
        `Pick the 2-4 questions that most affect price/quote. Return:\n` +
        `1) marketContext: short market notes for internal use.\n` +
        `2) questionsMessage: ONE casual lowercase text to the user with those questions. ` +
        `match the haggle voice: fragments over full sentences, no periods at sentence ends, ` +
        `sounds like a friend doing a favor.`,
    });
    return object;
  } catch (e) {
    console.error("[research] failed", e);
    return {
      marketContext: "",
      questionsMessage: `before i call around — any specifics i should give them about your ${args.service}?`,
    };
  }
}
