import { ConvexHttpClient } from "convex/browser";
import { env } from "./env";

let client: ConvexHttpClient | null = null;

export function convexClient(): ConvexHttpClient {
  if (client) return client;
  if (!env.CONVEX_URL) {
    throw new Error("Missing CONVEX_URL or NEXT_PUBLIC_CONVEX_URL");
  }
  client = new ConvexHttpClient(env.CONVEX_URL);
  return client;
}
