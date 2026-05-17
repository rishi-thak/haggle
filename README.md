# Haggle — local service concierge in iMessage

You text "get my car detailed in SF for under $100" to a single number. Haggle
researches local providers with Browser Use, calls 4 in parallel via Agentphone
voice (negotiation driven by Gemini), emails the ones without a phone via
Agentmail, recalls past provider context from Supermemory, and once you reply
"pay them" it sends USDC via Sponge. Every state change is texted back to you.

## Architecture

- **Next.js 15 (App Router)** — frontend + serverless route handlers.
- **libsql / Turso** — shared conversation + job + lead + call log.
- **Vercel AI SDK + Gemini** — intent parsing, voice negotiation turns,
  call-result summarization.
- **State machine in `src/lib/orchestrator.ts`** — every transition writes a
  message back to the iMessage thread.

```
new → searching → ranked → calling → (per-lead) negotiating
                                 ↘  email_fallback
   → awaiting_confirm  →  paying  → complete
```

## Routes

| Path | What |
|---|---|
| `GET  /` | One-page React form: phone → onboard |
| `POST /api/onboard` | Creates a user row + a Supermemory profile |
| `POST /api/webhooks/agentphone` | Inbound iMessage *and* call lifecycle events |
| `POST /api/webhooks/agentphone/voice` | Voice webhook — returns the next thing Haggle should say (Gemini) |
| `POST /api/webhooks/agentmail` | Inbound email replies from cold-emailed leads |

## Setup

```bash
pnpm install
cp .env.example .env   # fill in keys (see below)
pnpm dev               # http://localhost:3000
```

### Required env vars

| Var | How to get it |
|---|---|
| `AGENTPHONE_API_KEY` | Agentphone dashboard |
| `AGENTPHONE_AGENT_ID` | Create an agent on Agentphone with **voice mode = webhook**, set the voice webhook URL to `$PUBLIC_BASE_URL/api/webhooks/agentphone/voice` and the general webhook to `$PUBLIC_BASE_URL/api/webhooks/agentphone` |
| `AGENTPHONE_FROM_NUMBER` | Your provisioned iMessage number (e.g. `+14155550100`) |
| `AGENTPHONE_WEBHOOK_SECRET` | Optional — if set, we verify HMAC signatures |
| `AGENTMAIL_API_KEY` | agentmail.to |
| `AGENTMAIL_INBOX_ID` | Optional — auto-created on first send if blank |
| `SUPERMEMORY_API_KEY` | supermemory.ai |
| `BROWSER_USE_API_KEY` | cloud.browser-use.com |
| `SPONGE_API_KEY` | dashboard.paysponge.com (agent-scoped key) |
| `SPONGE_DEMO_PAYEE_ADDRESS` | An EVM address on Base — every "pay them" sends USDC here |
| `GOOGLE_GENERATIVE_AI_API_KEY` | aistudio.google.com |
| `DATABASE_URL` | `file:./haggle.db` locally; a Turso `libsql://…` URL in prod |
| `DATABASE_AUTH_TOKEN` | Turso token (prod only) |

## Deploy

```bash
vercel
# Add the same env vars in the Vercel project settings.
# On Vercel, swap DATABASE_URL to a Turso db (filesystem is read-only on Vercel).
```

After deploy, point Agentphone at the deployed URL:

- General webhook: `https://YOUR.vercel.app/api/webhooks/agentphone`
- Voice webhook:   `https://YOUR.vercel.app/api/webhooks/agentphone/voice`

## End-to-end flow

1. User onboards on `/`, gets the Agentphone iMessage number to text.
2. User texts the number with intent.
3. Agentphone webhook → `handleInboundIMessage` →
   - parse intent (Gemini) → write request memory →
   - Browser Use scrapes Google Maps for 5–10 leads →
   - DB inserts + rank →
   - `createOutboundCall` × N in parallel (Agentphone voice webhook mode) →
   - phone-less leads → `sendColdEmail` (Agentmail).
4. Each negotiation turn hits `/api/webhooks/agentphone/voice` and Gemini
   produces the response (with Supermemory context about prior dealings with
   that provider).
5. When a call ends, Agentphone fires `agent.call.completed` →
   `handleCallCompleted` summarizes outcome, picks the cheapest "agreed"
   provider, texts the user "Best offer: …, reply pay them".
6. User texts "pay them" → `runPayment` → `wallet.evmTransfer({chain: 'base',
   currency: 'USDC', to: $SPONGE_DEMO_PAYEE_ADDRESS, amount})` →
   complete + tx link in iMessage.

## Implementation notes

- **Webhook ack speed.** All webhook handlers return 200 immediately and run
  orchestration in a fire-and-forget Promise. On Vercel use
  `waitUntil(promise)` for long tails if you start to see truncation; for
  hackathon-scale traffic the current pattern is fine.
- **Voice webhook mode** keeps the negotiation LLM inside our process so we can
  enrich each turn with Supermemory recall and apply our own budget logic.
- **Idempotency.** `findCallByAgentphoneId()` looks up the lead+job from the
  Agentphone callId, so the voice webhook works even if Agentphone doesn't echo
  our `variables`.

## Sponsor doc references

- Supermemory × AI SDK: <https://supermemory.ai/docs/integrations/ai-sdk>
- AI SDK: <https://ai-sdk.dev/>
- Agentphone webhook example: <https://github.com/manav2modi/Personal-AI-Phone-Assistant>
- Agentphone full API: <https://docs.agentphone.ai/llms-full.txt>
- AgentMail: <https://www.agentmail.to/docs/welcome>
- Sponge: <https://docs.paysponge.com/>
- Sponge AI SDK: <https://docs.paysponge.com/wallet/vercel-ai-sdk>
- Browser Use Cloud: <https://docs.browser-use.com/llms-full.txt>
