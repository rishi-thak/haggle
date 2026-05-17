import { listLeads } from "./repo";
import type { Job, Lead } from "./types";

/**
 * Generate a human-readable status message for an active job based on current lead states.
 * Matches haggle voice: lowercase, casual, informative.
 */
export async function getJobStatusText(job: Job): Promise<string> {
  const leads = await listLeads(job.id);

  if (!leads.length) {
    switch (job.status) {
      case "new":
      case "searching":
        return "still searching for options — haven't found any yet";
      default:
        return "working on it, nothing to report yet";
    }
  }

  const calling = leads.filter((l) => l.status === "calling");
  const negotiating = leads.filter((l) => l.status === "negotiating");
  const agreed = leads.filter((l) => l.status === "agreed");
  const declined = leads.filter((l) => l.status === "declined");
  const noAnswer = leads.filter((l) => l.status === "no_answer");
  const callback = leads.filter((l) => l.status === "callback");
  const emailed = leads.filter((l) => l.status === "emailed");
  const pending = leads.filter((l) => l.status === "pending");

  // If we have an agreed lead, surface it
  if (agreed.length) {
    const best = agreed.sort((a, b) => (a.quoted_price_cents ?? 0) - (b.quoted_price_cents ?? 0))[0];
    const price = best.quoted_price_cents ? `$${(best.quoted_price_cents / 100).toFixed(0)}` : "a price";
    return `${best.name} quoted ${price} and they're good to go — just waiting on your go-ahead`;
  }

  const parts: string[] = [];

  // Calling / negotiating in progress
  const activeCallCount = calling.length + negotiating.length;
  if (activeCallCount > 0) {
    parts.push(`${activeCallCount} ${activeCallCount === 1 ? "call" : "calls"} still live`);
  }

  // Quoted results from leads that got through
  const quotedLeads = leads.filter((l) => l.quoted_price_cents !== null && l.status !== "declined");
  if (quotedLeads.length) {
    const prices = quotedLeads.map((l) => `$${((l.quoted_price_cents ?? 0) / 100).toFixed(0)}`);
    parts.push(`got ${quotedLeads.length === 1 ? "a quote" : "quotes"}: ${prices.join(", ")}`);
  }

  // Declined
  if (declined.length) {
    parts.push(`${declined.length} declined`);
  }

  // No answer
  if (noAnswer.length) {
    parts.push(`${noAnswer.length} didn't pick up`);
  }

  // Callback
  if (callback.length) {
    parts.push(`${callback.length} said they'd call back`);
  }

  // Emailed (still waiting)
  if (emailed.length) {
    parts.push(`emailed ${emailed.length}, waiting on replies`);
  }

  // Pending (haven't been contacted yet)
  if (pending.length && !activeCallCount) {
    parts.push(`${pending.length} more to try`);
  }

  if (parts.length === 0) {
    // Shouldn't happen but fallback
    return `found ${leads.length} options — working through them now`;
  }

  return parts.join(" — ");
}
