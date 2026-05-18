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
    preferred_from_number: v.optional(nullableString),
    created_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_phone", ["phone"]),

  jobs: defineTable({
    legacyId: v.number(),
    user_id: v.number(),
    conversation_id: v.string(),
    watch_token: v.optional(nullableString),
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
    .index("by_conversation_id", ["conversation_id"])
    .index("by_watch_token", ["watch_token"]),

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
    payment_method: nullableString,
    notes: nullableString,
    created_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_job_id", ["job_id"]),

  escrow_payments: defineTable({
    legacyId: v.number(),
    job_id: v.number(),
    lead_id: v.number(),
    amount_cents: v.number(),
    funding_source: v.string(),
    funding_tx_hash: nullableString,
    provider_payout_method: nullableString,
    provider_payout_account_id: nullableString,
    release_tx_hash: nullableString,
    status: v.string(),
    payout_token: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_job_id", ["job_id"])
    .index("by_payout_token", ["payout_token"]),

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

  browser_sessions: defineTable({
    legacyId: v.number(),
    job_id: v.number(),
    label: v.string(),
    phase: v.string(),
    browser_use_session_id: nullableString,
    live_url: nullableString,
    status: v.string(),
    step_count: v.number(),
    last_step_summary: nullableString,
    screenshot_url: nullableString,
    error: nullableString,
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_job_id", ["job_id"])
    .index("by_browser_use_session_id", ["browser_use_session_id"]),

  browser_events: defineTable({
    legacyId: v.number(),
    job_id: v.number(),
    browser_session_id: v.number(),
    external_message_id: nullableString,
    type: v.string(),
    summary: v.string(),
    screenshot_url: nullableString,
    created_at: v.number(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_job_id", ["job_id"])
    .index("by_browser_session_id", ["browser_session_id"])
    .index("by_external_message_id", ["external_message_id"]),

  conversation_messages: defineTable({
    conversation_id: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    created_at: v.number(),
  }).index("by_conversation", ["conversation_id", "created_at"]),

  web_chat_messages: defineTable({
    conversation_id: v.string(),
    direction: v.string(),
    body: v.string(),
    created_at: v.number(),
  }).index("by_conversation_id_and_created_at", ["conversation_id", "created_at"]),

  webhook_deliveries: defineTable({
    delivery_id: v.string(),
    source: v.string(),
    event: nullableString,
    created_at: v.number(),
  }).index("by_delivery_id", ["delivery_id"]),

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
