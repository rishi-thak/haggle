"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * /chat — fallback UI while agentphone is down.
 *
 * Same orchestrator, web-routed via `web:*` conversation IDs (lib/userChannel).
 * To swap back later: just stop pointing users here.
 * ───────────────────────────────────────────────────────── */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";

type Msg = {
  direction: "inbound" | "outbound";
  body: string;
  created_at: number;
  optimistic?: boolean;
};

const STORAGE_KEYS = {
  conversation: "haggle.chat.conversationId",
  phone: "haggle.chat.phone",
};

const SUGGESTIONS = [
  "detail my car in SF for under $100",
  "find a locksmith near me asap",
  "book a mover for saturday",
  "groomer for my dog this week",
];

function randomConversationId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `web:${rand.slice(0, 16)}`;
}

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cid = localStorage.getItem(STORAGE_KEYS.conversation);
    const ph = localStorage.getItem(STORAGE_KEYS.phone);
    if (cid && ph) {
      setConversationId(cid);
      setPhone(ph);
      setReady(true);
    }
  }, []);

  const startSession = useCallback((p: string) => {
    const cid = randomConversationId();
    localStorage.setItem(STORAGE_KEYS.conversation, cid);
    localStorage.setItem(STORAGE_KEYS.phone, p);
    setConversationId(cid);
    setPhone(p);
    setReady(true);
  }, []);

  const resetSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.conversation);
    setConversationId(null);
    setReady(false);
  }, []);

  return (
    <main className="chat-canvas relative isolate flex min-h-dvh flex-col text-ink-900 antialiased">
      {!ready ? (
        <StartScreen onStart={startSession} initialPhone={phone} />
      ) : (
        <ChatScreen
          conversationId={conversationId!}
          phone={phone}
          onReset={resetSession}
        />
      )}
    </main>
  );
}

/* ─── start screen ──────────────────────────────────────── */

function StartScreen({
  onStart,
  initialPhone,
}: {
  onStart: (phone: string) => void;
  initialPhone: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/[^0-9+]/g, "");
    if (digits.length < 10) {
      setErr("need at least 10 digits");
      return;
    }
    onStart(phone);
  }

  return (
    <>
      <header className="relative z-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-2.5">
            <div className="relative size-7 overflow-hidden">
              <Image src="/Haggle2.png" alt="" fill className="object-contain" />
            </div>
            <span className="font-display text-[19px] font-bold tracking-tight">
              haggle
            </span>
          </a>
          <a
            href="/"
            className="text-[13px] text-ink-500 transition hover:text-ink-900"
          >
            ← back to home
          </a>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mx-auto inline-flex w-full items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white/80 px-3 py-1 text-[12px] font-medium text-ink-500 shadow-sm ring-1 ring-black/[0.02] backdrop-blur">
              <span className="relative inline-flex size-1.5">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-haggle-500/70" />
                <span className="relative size-1.5 rounded-full bg-haggle-500" />
              </span>
              iMessage is down — chat here instead
            </span>
          </div>

          <h1
            className="mt-7 text-center font-display text-[clamp(2.25rem,6vw,3.5rem)] font-black leading-[1.02] tracking-[-0.025em] text-balance"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
          >
            Chat with <span className="text-haggle-500">Haggle</span>.
          </h1>
          <p className="mt-4 text-center text-[15px] leading-relaxed text-ink-500 text-pretty">
            Same concierge, web edition. We dial, haggle, and book — you just type.
          </p>

          <form onSubmit={submit} className="mt-10">
            <label
              htmlFor="phone"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400"
            >
              Phone number
            </label>
            <div className="mt-2 flex items-center gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/10 transition focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.08)] focus-within:ring-ink-900">
              <span className="pl-3 pr-1 font-mono text-[15px] text-ink-300">
                +1
              </span>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="415 555 0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[16px] text-ink-900 outline-none placeholder:text-ink-300"
              />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-ink-900 px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-haggle-500 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
              >
                Start
                <ArrowRight className="size-3.5" />
              </button>
            </div>
            {err && (
              <p className="mt-3 text-[12px] text-haggle-600">{err}</p>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
              Used as your account id. Memory, jobs, and past haggles all carry
              over to your real iMessage thread later.
            </p>
          </form>

          <div className="mt-12">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
              · try saying
            </div>
            <ul role="list" className="mt-3 space-y-2">
              {SUGGESTIONS.map((s) => (
                <li
                  key={s}
                  className="rounded-xl bg-white/60 px-3 py-2 text-[13px] text-ink-600 ring-1 ring-black/5"
                >
                  <span className="text-haggle-500">›</span>{" "}
                  <span className="font-mono">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── chat screen ──────────────────────────────────────── */

function ChatScreen({
  conversationId,
  phone,
  onReset,
}: {
  conversationId: string;
  phone: string;
  onReset: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastSendAt, setLastSendAt] = useState<number>(0);
  const [connected, setConnected] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSeen = useRef<number>(0);
  const isPinnedToBottom = useRef<boolean>(true);

  // Poll Convex via our route for new messages. Convex live queries would be
  // cleaner; polling keeps this self-contained.
  const fetchMessages = useCallback(async () => {
    try {
      const url = new URL("/api/chat/messages", window.location.origin);
      url.searchParams.set("conversationId", conversationId);
      if (lastSeen.current > 0) {
        url.searchParams.set("sinceMs", String(lastSeen.current));
      }
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; messages?: Msg[] };
      setConnected(true);
      if (!json.ok || !json.messages?.length) return;
      setMessages((prev) => {
        // Drop any optimistic message that the server has now confirmed
        // (matched by direction + body — server timestamp will differ from
        // our client-side Date.now()).
        const incomingKeys = new Set(
          json.messages!.map((m) => `${m.direction}|${m.body}`),
        );
        const kept = prev.filter(
          (m) => !(m.optimistic && incomingKeys.has(`${m.direction}|${m.body}`)),
        );
        const merged = [...kept, ...json.messages!];
        const seen = new Set<string>();
        const out: Msg[] = [];
        for (const m of merged) {
          const key = m.optimistic
            ? `opt|${m.direction}|${m.body}`
            : `${m.direction}|${m.created_at}|${m.body}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(m);
        }
        return out.sort((a, b) => a.created_at - b.created_at);
      });
      lastSeen.current = Math.max(
        lastSeen.current,
        ...json.messages.map((m) => m.created_at),
      );
    } catch {
      setConnected(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, 1500);
    return () => clearInterval(id);
  }, [fetchMessages]);

  // Track whether the user is pinned to bottom so we don't yank them around.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
      isPinnedToBottom.current = distance < 80;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (!isPinnedToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Auto-grow the textarea.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    const next = Math.min(ta.scrollHeight, 180);
    ta.style.height = `${next}px`;
  }, [draft]);

  const lastMsg = messages.at(-1);
  const showTyping =
    sending ||
    (lastMsg?.direction === "inbound" &&
      Date.now() - Math.max(lastMsg.created_at, lastSendAt) < 30000);

  const agentStatus = computeStatus(messages, showTyping);

  async function send(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setErr(null);
    setDraft("");
    const at = Date.now();
    setLastSendAt(at);
    setMessages((prev) => [
      ...prev,
      { direction: "inbound", body: text, created_at: at, optimistic: true },
    ]);
    isPinnedToBottom.current = true;
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, phone, text }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "send failed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function applySuggestion(s: string) {
    setDraft(s);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ChatHeader
        phone={phone}
        connected={connected}
        status={agentStatus}
        onReset={onReset}
      />

      <FallbackBanner />

      <div
        ref={scrollRef}
        className="chat-scroll relative flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-6 sm:px-6">
          {messages.length === 0 ? (
            <EmptyState onPick={applySuggestion} />
          ) : (
            <MessageList messages={messages} showTyping={showTyping} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {err && (
        <div className="mx-auto -mb-1 max-w-2xl px-6">
          <p className="text-center text-[12px] text-haggle-600">{err}</p>
        </div>
      )}

      <Composer
        ref={textareaRef}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={send}
        onKeyDown={onKeyDown}
        sending={sending}
        suggestions={messages.length === 0 ? [] : SUGGESTIONS.slice(0, 3)}
        onSuggest={applySuggestion}
      />
    </div>
  );
}

/* ─── header ───────────────────────────────────────────── */

type AgentStatus =
  | { kind: "online"; label: string }
  | { kind: "thinking"; label: string }
  | { kind: "busy"; label: string };

function computeStatus(messages: Msg[], typing: boolean): AgentStatus {
  if (typing) return { kind: "thinking", label: "typing…" };
  const last = messages.at(-1);
  if (!last) return { kind: "online", label: "online · usually replies in seconds" };
  // Heuristic: if the agent's last note hinted at active work, surface it.
  const txt = last.body.toLowerCase();
  if (/calling|dialing|negotiat|searching|looking|on it/.test(txt)) {
    return { kind: "busy", label: "working on it" };
  }
  return { kind: "online", label: "online" };
}

function ChatHeader({
  phone,
  connected,
  status,
  onReset,
}: {
  phone: string;
  connected: boolean;
  status: AgentStatus;
  onReset: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
        <a
          href="/"
          aria-label="back to home"
          className="relative -ml-1 inline-flex size-9 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-50 hover:text-ink-900"
        >
          <ChevronLeft className="size-4" />
        </a>

        <div className="relative shrink-0">
          <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-haggle-500 ring-2 ring-white">
            <span className="font-display text-lg font-black text-white">H</span>
          </div>
          <span
            className={[
              "absolute -right-0.5 -bottom-0.5 inline-flex size-3 items-center justify-center rounded-full ring-2 ring-paper",
              status.kind === "thinking"
                ? "bg-amber-400"
                : status.kind === "busy"
                  ? "bg-haggle-500"
                  : "bg-emerald-500",
            ].join(" ")}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[14px] font-semibold tracking-tight text-ink-900">
              Haggle
            </p>
            <VerifiedBadge />
          </div>
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[12px] text-ink-500">{status.label}</p>
            {status.kind === "thinking" && <ThinkingDots />}
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]",
              connected
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10"
                : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
            ].join(" ")}
            title={connected ? "Live" : "Reconnecting"}
          >
            <span
              className={[
                "size-1.5 rounded-full",
                connected ? "animate-ping-dot bg-emerald-500" : "bg-amber-500",
              ].join(" ")}
            />
            {connected ? "Live" : "Offline"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-300">
            {formatPhoneCompact(phone)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (confirm("start a new conversation? this won't delete history")) {
              onReset();
            }
          }}
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          aria-label="new conversation"
          title="new conversation"
        >
          <PencilSquare className="size-4" />
        </button>
      </div>
    </header>
  );
}

function VerifiedBadge() {
  return (
    <span
      title="Verified concierge"
      className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-haggle-500 text-white"
    >
      <svg viewBox="0 0 12 12" className="size-2.5" fill="none">
        <path
          d="M2.5 6.3L4.7 8.5L9.5 3.7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1 animate-ping-dot rounded-full bg-amber-500"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  );
}

/* ─── fallback banner (collapsible) ────────────────────── */

function FallbackBanner() {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(localStorage.getItem("haggle.chat.bannerDismissed") === "1");
  }, []);
  if (dismissed) return null;
  return (
    <div className="border-b border-haggle-500/10 bg-haggle-500/[0.04]">
      <div className="mx-auto flex w-full max-w-2xl items-start gap-3 px-4 py-2.5 sm:px-6">
        <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-haggle-500/10 text-haggle-600">
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none">
            <path
              d="M6 3.5V6.5M6 8.5V8.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <p className="flex-1 text-[12px] leading-relaxed text-ink-700">
          Agentphone is having a moment. You&apos;re using the web fallback —
          everything still works, and your history syncs back to iMessage when
          it&apos;s up.
        </p>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem("haggle.chat.bannerDismissed", "1");
            setDismissed(true);
          }}
          aria-label="dismiss"
          className="relative -mr-1 inline-flex size-6 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
        >
          <svg viewBox="0 0 12 12" className="size-3" fill="none">
            <path
              d="M3 3L9 9M9 3L3 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── empty state ──────────────────────────────────────── */

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center pt-12 pb-8 text-center animate-fade-in">
      <div className="relative">
        <span className="absolute inset-0 -m-2 animate-pulse-ring rounded-full bg-haggle-500/30" />
        <div className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-haggle-500 ring-4 ring-white">
          <span className="font-display text-2xl font-black text-white">H</span>
        </div>
      </div>
      <h2
        className="mt-5 font-display text-[26px] font-black leading-tight tracking-[-0.02em]"
        style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
      >
        What can we haggle for you?
      </h2>
      <p className="mt-2 max-w-[28ch] text-[14px] leading-relaxed text-ink-500 text-pretty">
        Tell us what you need and a budget. We&apos;ll call providers in parallel
        and book the best one.
      </p>

      <ul
        role="list"
        className="mt-8 grid w-full max-w-md gap-2 sm:grid-cols-2"
      >
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="group relative flex w-full items-center justify-between gap-2 rounded-xl bg-white p-3 text-left text-[13px] text-ink-700 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-px hover:text-ink-900 hover:shadow-md hover:ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              <span className="font-mono text-[12px] leading-snug">{s}</span>
              <ArrowRight className="size-3.5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-haggle-500" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── message list with date dividers & smart timestamps ─ */

function MessageList({
  messages,
  showTyping,
}: {
  messages: Msg[];
  showTyping: boolean;
}) {
  const items = useMemo(() => groupMessages(messages), [messages]);
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        if (item.type === "day") {
          return <DayDivider key={`d-${i}`} ts={item.ts} />;
        }
        if (item.type === "time") {
          return <TimeMark key={`t-${i}`} ts={item.ts} />;
        }
        return (
          <Bubble
            key={`m-${item.msg.created_at}-${i}`}
            msg={item.msg}
            showTail={item.showTail}
          />
        );
      })}
      {showTyping && <TypingBubble />}
    </div>
  );
}

type Item =
  | { type: "day"; ts: number }
  | { type: "time"; ts: number }
  | { type: "msg"; msg: Msg; showTail: boolean };

function groupMessages(messages: Msg[]): Item[] {
  const out: Item[] = [];
  let prev: Msg | undefined;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!prev || !sameDay(prev.created_at, m.created_at)) {
      out.push({ type: "day", ts: m.created_at });
    } else if (m.created_at - prev.created_at > 5 * 60 * 1000) {
      out.push({ type: "time", ts: m.created_at });
    }
    const next = messages[i + 1];
    const showTail =
      !next ||
      next.direction !== m.direction ||
      next.created_at - m.created_at > 60 * 1000;
    out.push({ type: "msg", msg: m, showTail });
    prev = m;
  }
  return out;
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function DayDivider({ ts }: { ts: number }) {
  return (
    <div className="flex items-center justify-center py-3">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
        {formatDay(ts)}
      </span>
    </div>
  );
}

function TimeMark({ ts }: { ts: number }) {
  return (
    <div className="flex items-center justify-center py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
        {formatTime(ts)}
      </span>
    </div>
  );
}

/* ─── bubble ───────────────────────────────────────────── */

function Bubble({ msg, showTail }: { msg: Msg; showTail: boolean }) {
  const isMe = msg.direction === "inbound";
  return (
    <div
      className={`group flex animate-bubble-in flex-col ${
        isMe ? "items-end" : "items-start"
      }`}
    >
      <div
        className={[
          "relative max-w-[82%] whitespace-pre-wrap px-3.5 py-2 text-[15px] leading-snug shadow-sm",
          isMe
            ? showTail
              ? "bubble-me bg-[#2C7BF2] text-white"
              : "rounded-[22px] bg-[#2C7BF2] text-white"
            : showTail
              ? "bubble-them bg-ink-50 text-ink-900 ring-1 ring-black/5"
              : "rounded-[22px] bg-ink-50 text-ink-900 ring-1 ring-black/5",
        ].join(" ")}
      >
        {linkify(msg.body, isMe)}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex animate-fade-in items-start">
      <div className="bubble-them flex items-center gap-1 bg-ink-50 px-3.5 py-3 ring-1 ring-black/5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-ping-dot rounded-full bg-ink-300"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function linkify(text: string, onDark: boolean): React.ReactNode {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noreferrer"
        className={
          onDark
            ? "underline decoration-white/60 underline-offset-2 hover:decoration-white"
            : "text-haggle-600 underline decoration-haggle-500/40 underline-offset-2 hover:decoration-haggle-500"
        }
      >
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

/* ─── composer ─────────────────────────────────────────── */

type ComposerProps = {
  draft: string;
  onDraftChange: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  sending: boolean;
  suggestions: string[];
  onSuggest: (s: string) => void;
};

const Composer = function Composer({
  ref,
  draft,
  onDraftChange,
  onSubmit,
  onKeyDown,
  sending,
  suggestions,
  onSuggest,
}: ComposerProps & { ref: React.RefObject<HTMLTextAreaElement | null> }) {
  const canSend = draft.trim().length > 0 && !sending;
  return (
    <div className="sticky bottom-0 z-10 border-t border-black/5 bg-paper/85 backdrop-blur-xl composer-safe">
      <div className="mx-auto w-full max-w-2xl px-4 pt-2.5 pb-3 sm:px-6">
        {suggestions.length > 0 && (
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggest(s)}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 font-mono text-[11px] text-ink-600 shadow-sm ring-1 ring-black/5 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="flex items-end gap-2 rounded-3xl bg-white p-1.5 shadow-sm ring-1 ring-black/10 transition focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.06)] focus-within:ring-ink-900/40"
        >
          <label htmlFor="composer" className="sr-only">
            Message
          </label>
          <textarea
            id="composer"
            name="composer"
            ref={ref}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="iMessage"
            className="block min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-ink-900 outline-none placeholder:text-ink-300 max-sm:text-base"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={[
              "relative flex size-9 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900",
              canSend
                ? "bg-[#2C7BF2] text-white shadow-sm hover:bg-[#1f6ad6] active:scale-95"
                : "bg-ink-100 text-ink-300",
            ].join(" ")}
          >
            {sending ? (
              <Spinner className="size-4" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </form>
        <p className="mt-1.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
          enter to send · shift + enter for new line
        </p>
      </div>
    </div>
  );
};

/* ─── icons & utils ────────────────────────────────────── */

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 3L5 8L10 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilSquare({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 13.5H6L13 6.5L9.5 3L2.5 10V13.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 4L12 7.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={`${className ?? ""} animate-spin`}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (target.getTime() === today.getTime()) {
    return `Today · ${formatTime(ts)}`;
  }
  if (target.getTime() === yesterday.getTime()) {
    return `Yesterday · ${formatTime(ts)}`;
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPhoneCompact(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}–${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}–${digits.slice(6)}`;
  }
  return phone;
}
