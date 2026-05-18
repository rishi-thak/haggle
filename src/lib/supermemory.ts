import { env } from "./env";

const BASE = "https://api.supermemory.ai/v3";

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${env.SUPERMEMORY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface MemoryResult {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function scoreValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadataValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function chunkContent(value: unknown): string | null {
  if (typeof value === "string") return textValue(value);
  if (!isRecord(value)) return null;
  return textValue(value.content);
}

function chunksContent(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  const relevant = value.find(
    (chunk) => isRecord(chunk) && chunk.isRelevant === true && chunkContent(chunk),
  );
  const firstWithContent = relevant ?? value.find((chunk) => chunkContent(chunk));
  return chunkContent(firstWithContent);
}

function resultContent(result: Record<string, unknown>): string | null {
  return (
    textValue(result.content) ??
    textValue(result.text) ??
    textValue(result.memory) ??
    chunkContent(result.chunk) ??
    chunksContent(result.chunks) ??
    null
  );
}

function normalizeMemoryResult(value: unknown, index: number): MemoryResult | null {
  if (!isRecord(value)) return null;

  const content = resultContent(value);
  if (!content) return null;

  return {
    id:
      textValue(value.id) ??
      textValue(value.documentId) ??
      textValue(value.memoryId) ??
      `result-${index}`,
    content,
    score: scoreValue(value.score) ?? scoreValue(value.similarity),
    metadata: metadataValue(value.metadata),
  };
}

export async function addMemory(
  containerTag: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!env.SUPERMEMORY_API_KEY) return;
  try {
    const res = await fetch(`${BASE}/memories`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        content,
        containerTags: [containerTag],
        metadata: metadata ?? {},
      }),
    });
    if (!res.ok) console.error("[supermemory] addMemory failed", res.status, await res.text());
  } catch (e) {
    console.error("[supermemory] addMemory error", e);
  }
}

export async function searchMemories(
  containerTag: string,
  query: string,
  limit = 5,
): Promise<MemoryResult[]> {
  if (!env.SUPERMEMORY_API_KEY) return [];
  try {
    const res = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        q: query,
        containerTags: [containerTag],
        limit,
      }),
    });
    if (!res.ok) {
      console.error("[supermemory] search failed", res.status, await res.text());
      return [];
    }
    const json = (await res.json()) as { results?: unknown };
    if (!Array.isArray(json.results)) return [];
    return json.results
      .map((result, index) => normalizeMemoryResult(result, index))
      .filter((result): result is MemoryResult => result !== null);
  } catch (e) {
    console.error("[supermemory] search error", e);
    return [];
  }
}

export async function recallProviderHistory(
  containerTag: string,
  service: string,
  businessName?: string,
): Promise<{ summary: string; usedBefore: boolean }> {
  const query = businessName
    ? `${service} ${businessName} provider experience`
    : `${service} provider experience preferences`;
  const results = await searchMemories(containerTag, query, 6);
  if (!results.length) return { summary: "", usedBefore: false };
  const text = results.map((r) => `- ${r.content}`).join("\n");
  const usedBefore = businessName
    ? results.some((r) => r.content.toLowerCase().includes(businessName.toLowerCase()))
    : false;
  return { summary: text, usedBefore };
}

export async function getUserPreferences(
  containerTag: string,
  service: string,
): Promise<MemoryResult[]> {
  return searchMemories(containerTag, `${service} preferences personal notes`, 5);
}

export async function getProviderReputation(
  containerTag: string,
  providerName: string,
): Promise<{ memories: MemoryResult[]; sentiment: "positive" | "negative" | "neutral" }> {
  const results = await searchMemories(containerTag, `${providerName} experience outcome`, 5);
  if (!results.length) return { memories: results, sentiment: "neutral" };

  const text = results.map((r) => r.content.toLowerCase()).join(" ");
  const positiveSignals = /\b(great|good|well|success|happy|loved|recommend|booked|paid)\b/;
  const negativeSignals = /\b(bad|terrible|declined|refused|don't use|avoid|never again|rude|late|no-show)\b/;

  const hasPositive = positiveSignals.test(text);
  const hasNegative = negativeSignals.test(text);

  let sentiment: "positive" | "negative" | "neutral" = "neutral";
  if (hasNegative && !hasPositive) sentiment = "negative";
  else if (hasPositive && !hasNegative) sentiment = "positive";

  return { memories: results, sentiment };
}

export async function addProviderFeedback(
  containerTag: string,
  providerName: string,
  service: string,
  feedback: string,
  sentiment: "positive" | "negative",
): Promise<void> {
  const content =
    sentiment === "positive"
      ? `Positive experience with ${providerName} for ${service}: ${feedback}`
      : `Negative experience with ${providerName} for ${service}: ${feedback}`;
  await addMemory(containerTag, content, {
    type: "provider_feedback",
    providerName,
    service,
    sentiment,
  });
}
