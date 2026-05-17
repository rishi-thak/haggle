import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route";

test("Agentphone voice messages on the main webhook return a voice response", async () => {
  const req = new Request("http://localhost/api/webhooks/agentphone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "agent.message",
      channel: "voice",
      timestamp: "2025-12-03T10:05:00Z",
      agentId: "agent_123",
      data: {
        callId: "call_test_unknown",
        from: "+14155551234",
        to: "+18571234567",
        status: "in-progress",
        transcript: "What are your hours?",
        direction: "inbound",
      },
      conversationState: null,
      recentHistory: [],
    }),
  });

  const res = await POST(req);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: "One moment, I'll call you back." });
});
