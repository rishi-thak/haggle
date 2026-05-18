import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeBestLead,
  filterNewLeadCandidates,
  getCallableLeads,
  getPendingLeadIdsToRetireBeforeResearch,
} from "./leadSelection";
import type { Lead } from "./types";

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 1,
    job_id: 10,
    name: "Provider",
    phone: "+14155550100",
    email: null,
    address: null,
    rating: null,
    source_url: null,
    rank_score: null,
    status: "pending",
    quoted_price_cents: null,
    payment_method: null,
    notes: null,
    created_at: 1,
    ...overrides,
  };
}

test("computeBestLead chooses the cheapest agreed quote", () => {
  const best = computeBestLead([
    lead({ id: 1, name: "Ranked first", status: "agreed", quoted_price_cents: 15000 }),
    lead({ id: 2, name: "Cheapest agreed", status: "agreed", quoted_price_cents: 9000 }),
    lead({ id: 3, name: "Cheaper but not agreed", status: "pending", quoted_price_cents: 7000 }),
  ]);

  assert.equal(best?.id, 2);
});

test("pending leads are the only leads retired before re-searching after feedback", () => {
  assert.deepEqual(
    getPendingLeadIdsToRetireBeforeResearch([
      lead({ id: 1, status: "pending" }),
      lead({ id: 2, status: "agreed" }),
      lead({ id: 3, status: "declined" }),
      lead({ id: 4, status: "no_answer" }),
    ]),
    [1],
  );
});

test("callable leads exclude retired or completed providers", () => {
  assert.deepEqual(
    getCallableLeads([
      lead({ id: 1, status: "declined" }),
      lead({ id: 2, status: "pending" }),
      lead({ id: 3, status: "agreed" }),
      lead({ id: 4, status: "no_answer" }),
    ]).map((l) => l.id),
    [2],
  );
});

test("re-search skips providers that already exist on the job", () => {
  const candidates = [
    { name: "Same Phone", phone: "+14155550100", source_url: null },
    { name: "Same URL", phone: null, source_url: "https://example.com/provider" },
    { name: "Same Name", phone: null, source_url: null },
    { name: "New Provider", phone: "+14155550199", source_url: null },
  ];

  const filtered = filterNewLeadCandidates(candidates, [
    lead({ name: "Old Phone", phone: "+14155550100" }),
    lead({ name: "Old URL", phone: null, source_url: "https://example.com/provider" }),
    lead({ name: "Same Name", phone: null, source_url: null }),
  ]);

  assert.deepEqual(
    filtered.map((candidate) => candidate.name),
    ["New Provider"],
  );
});
