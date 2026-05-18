function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  AGENTPHONE_API_KEY: opt("AGENTPHONE_API_KEY"),
  AGENTPHONE_AGENT_ID: opt("AGENTPHONE_AGENT_ID"),
  AGENTPHONE_FROM_NUMBER: opt("AGENTPHONE_FROM_NUMBER"),
  AGENTPHONE_FROM_NUMBER_ID: opt("AGENTPHONE_FROM_NUMBER_ID"),
  AGENTPHONE_WEBHOOK_SECRET: opt("AGENTPHONE_WEBHOOK_SECRET"),

  AGENTMAIL_API_KEY: opt("AGENTMAIL_API_KEY"),
  AGENTMAIL_INBOX_ID: opt("AGENTMAIL_INBOX_ID"),

  SUPERMEMORY_API_KEY: opt("SUPERMEMORY_API_KEY"),

  BROWSER_USE_API_KEY: opt("BROWSER_USE_API_KEY"),

  SPONGE_API_KEY: opt("SPONGE_API_KEY"),
  SPONGE_DEMO_PAYEE_ADDRESS: opt("SPONGE_DEMO_PAYEE_ADDRESS"),
  SPONGE_CHAIN: (opt("SPONGE_CHAIN", "base") as "base" | "ethereum"),

  GOOGLE_GENERATIVE_AI_API_KEY: opt("GOOGLE_GENERATIVE_AI_API_KEY"),

  PUBLIC_BASE_URL: opt("PUBLIC_BASE_URL", "http://localhost:3000"),
  CONVEX_URL: opt("CONVEX_URL", opt("NEXT_PUBLIC_CONVEX_URL")),
};

export const requireEnv = need;
