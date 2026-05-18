import type { Lead } from "./types";

type LeadIdentity = {
  name: string;
  phone?: string | null;
  source_url?: string | null;
};

function compareQuoteAsc(
  a: Pick<Lead, "quoted_price_cents">,
  b: Pick<Lead, "quoted_price_cents">,
): number {
  return (
    (a.quoted_price_cents ?? Number.POSITIVE_INFINITY) -
    (b.quoted_price_cents ?? Number.POSITIVE_INFINITY)
  );
}

export function computeBestLead(leads: Lead[]): Lead | null {
  const agreed = leads
    .filter((lead) => lead.status === "agreed" && lead.quoted_price_cents !== null)
    .sort(compareQuoteAsc);
  if (agreed[0]) return agreed[0];

  const priced = leads
    .filter((lead) => lead.quoted_price_cents !== null)
    .sort(compareQuoteAsc);
  return priced[0] ?? null;
}

export function getPendingLeadIdsToRetireBeforeResearch(leads: Lead[]): number[] {
  return leads
    .filter((lead) => lead.status === "pending")
    .map((lead) => lead.id);
}

export function getCallableLeads(leads: Lead[]): Lead[] {
  return leads.filter((lead) => lead.status === "pending");
}

function normalizePhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, "").toLowerCase() || null;
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function leadIdentityKeys(lead: LeadIdentity): string[] {
  const keys: string[] = [];
  const phone = normalizePhone(lead.phone);
  const url = normalizeUrl(lead.source_url);
  const name = normalizeName(lead.name);
  if (phone) keys.push(`phone:${phone}`);
  if (url) keys.push(`url:${url}`);
  if (name) keys.push(`name:${name}`);
  return keys;
}

export function filterNewLeadCandidates<T extends LeadIdentity>(
  candidates: T[],
  existingLeads: LeadIdentity[],
): T[] {
  const seen = new Set(existingLeads.flatMap(leadIdentityKeys));
  const filtered: T[] = [];

  for (const candidate of candidates) {
    const keys = leadIdentityKeys(candidate);
    if (keys.some((key) => seen.has(key))) continue;
    filtered.push(candidate);
    for (const key of keys) seen.add(key);
  }

  return filtered;
}
