import { randomBytes } from "crypto";

export function createPayoutToken(): string {
  return randomBytes(16).toString("hex");
}

export function buildPayoutUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/pay/${token}`;
}
