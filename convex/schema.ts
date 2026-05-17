import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

export default defineSchema({
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  users: defineTable({
    legacyId: v.number(),
    phone: v.string(),
    container_tag: v.string(),
    sponge_wallet_address: nullableString,
    created_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_phone", ["phone"]),

  jobs: defineTable({
    legacyId: v.number(),
    user_id: v.number(),
    conversation_id: v.string(),
    intent_raw: v.string(),
    service: nullableString,
    location: nullableString,
    budget_cents: nullableNumber,
    timeframe: nullableString,
    status: v.string(),
    winning_lead_id: nullableNumber,
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_conversation_id", ["conversation_id"]),

  leads: defineTable({
    legacyId: v.number(),
    job_id: v.number(),
    name: v.string(),
    phone: nullableString,
    email: nullableString,
    address: nullableString,
    rating: nullableNumber,
    source_url: nullableString,
    rank_score: nullableNumber,
    status: v.string(),
    quoted_price_cents: nullableNumber,
    notes: nullableString,
    created_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_job_id", ["job_id"]),

  calls: defineTable({
    legacyId: v.number(),
    lead_id: v.number(),
    job_id: v.number(),
    agentphone_call_id: nullableString,
    transcript_json: nullableString,
    outcome: nullableString,
    quoted_price_cents: nullableNumber,
    created_at: v.number(),
    ended_at: nullableNumber,
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_agentphone_call_id", ["agentphone_call_id"])
    .index("by_job_id", ["job_id"])
    .index("by_lead_id", ["lead_id"]),

  messages: defineTable({
    legacyId: v.number(),
    job_id: v.number(),
    direction: v.string(),
    channel: v.string(),
    body: v.string(),
    created_at: v.number(),
  }).index("by_job_id", ["job_id"]),

  email_threads: defineTable({
    legacyId: v.number(),
    job_id: v.number(),
    lead_id: v.number(),
    inbox_id: nullableString,
    thread_id: nullableString,
    outbound_message_id: nullableString,
    last_inbound_message_id: nullableString,
    provider_email: nullableString,
    provider_name: nullableString,
    subject: nullableString,
    created_at: v.number(),
    updated_at: v.number(),
    last_outbound_at: v.number(),
    last_inbound_at: nullableNumber,
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_outbound_message_id", ["outbound_message_id"])
    .index("by_thread_id", ["thread_id"])
    .index("by_provider_email", ["provider_email"])
    .index("by_job_id_and_lead_id", ["job_id", "lead_id"]),
});
