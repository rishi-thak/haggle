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
    const json = (await res.json()) as { results?: MemoryResult[] };
    return json.results ?? [];
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
