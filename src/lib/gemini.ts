import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "./env";

let _provider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

export function gemini() {
  if (!_provider) {
    _provider = createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }
  return _provider;
}

export const GEMINI_FAST = "gemini-2.5-flash";
export const GEMINI_PRO = "gemini-2.5-pro";
