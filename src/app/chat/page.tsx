"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * /chat — web edition of the haggle concierge.
 *
 * Mobile: single column iMessage-style.
 * Desktop (lg+): split layout — brand/status rail on the left, chat on the right.
 *
 * Visual language mirrors the Haggle H sticker: chunky red, hard black
 * drop-shadow ("sticker-*" classes). Tone stays playful + lowercase.
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
    <main className="chat-canvas grain relative isolate flex min-h-dvh flex-col text-ink-900 antialiased">
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
          <a href="/" className="group flex items-center gap-2.5">
            <div className="relative size-8 transition-transform group-hover:-rotate-6">
              <Image
                src="/Haggle2.png"
                alt=""
                fill
                priority
                className="object-contain"
              />
            </div>
            <span className="font-display text-[19px] font-bold tracking-tight">
              haggle
            </span>
          </a>
          <a
            href="/"
            className="text-[13px] text-ink-500 transition hover:text-ink-900"
          >
            ← home
          </a>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-ink-600 sticker-2">
              <span className="relative inline-flex size-1.5">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-haggle-500/70" />
                <span className="relative size-1.5 rounded-full bg-haggle-500" />
              </span>
              web concierge
            </span>
          </div>

          <div className="mt-8 flex justify-center">
            <div className="relative size-24 animate-tilt-in">
              <Image
                src="/Haggle2.png"
                alt="Haggle"
                fill
                priority
                className="object-contain drop-shadow-[4px_4px_0_rgba(10,10,10,0.18)]"
              />
            </div>
          </div>

          <h1
            className="mt-6 text-center font-display text-[clamp(2rem,5.5vw,3rem)] font-black leading-[1.02] tracking-[-0.025em] text-balance"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
          >
            chat with{" "}
            <span className="relative inline-block text-haggle-500">
              haggle
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 right-0 h-1 rounded-full bg-haggle-500/30"
              />
            </span>
          </h1>
          <p className="mt-4 text-center text-[15px] leading-relaxed text-ink-500 text-pretty">
            same concierge, web edition. we dial, haggle, and book — you just type.
          </p>

          <form onSubmit={submit} className="mt-8">
            <label
              htmlFor="phone"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400"
            >
              your number
            </label>
            <div className="mt-2 flex items-center gap-1 rounded-2xl bg-white p-1.5 sticker-3 transition focus-within:translate-x-[-1px] focus-within:translate-y-[-1px]">
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
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-haggle-500 px-4 py-2.5 text-[14px] font-bold text-white transition hover:bg-haggle-600 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-haggle-600"
              >
                start
                <ArrowRight className="size-3.5" />
              </button>
            </div>
            {err && (
              <p className="mt-3 text-[12px] text-haggle-600">{err}</p>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
              used as your account id. memory + past haggles carry over to your real
              iMessage thread later.
            </p>
          </form>

          <div className="mt-10">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              · try saying
            </div>
            <ul role="list" className="mt-3 space-y-2">
              {SUGGESTIONS.map((s, i) => (
                <li key={s}>
                  <div
                    className="rounded-xl bg-white px-3 py-2 text-[13px] text-ink-600 sticker-2"
                    style={{
                      transform: `rotate(${i % 2 === 0 ? "-0.4deg" : "0.4deg"})`,
                    }}
                  >
                    <span className="text-haggle-500">›</span>{" "}
                    <span className="font-mono">{s}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── chat screen (mobile + desktop split) ─────────────── */

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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("haggle.chat.sidebarOpen");
    if (saved !== null) setSidebarOpen(saved === "1");
  }, []);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("haggle.chat.sidebarOpen", next ? "1" : "0");
      return next;
    });
  }

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
    <div className="relative z-10 flex min-h-dvh flex-col lg:flex-row">
      {/* desktop sidebar — on the left, smoothly toggleable */}
      <DesktopSidebar
        phone={phone}
        connected={connected}
        status={agentStatus}
        onReset={onReset}
        onSuggest={applySuggestion}
        open={sidebarOpen}
      />

      {/* chat column (right side on desktop, flexes to fill) */}
      <div className="flex flex-1 flex-col">
        <ChatHeader
          phone={phone}
          connected={connected}
          status={agentStatus}
          onReset={onReset}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
        />

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
        />
      </div>
    </div>
  );
}

/* ─── desktop sidebar (lg+ only) ───────────────────────── */

function DesktopSidebar({
  phone,
  connected,
  status,
  onReset,
  onSuggest,
  open,
}: {
  phone: string;
  connected: boolean;
  status: AgentStatus;
  onReset: () => void;
  onSuggest: (s: string) => void;
  open: boolean;
}) {
  return (
    <aside
      className={[
        "hidden shrink-0 overflow-hidden bg-paper/40 transition-[width,opacity] duration-300 ease-out lg:flex",
        open ? "w-[320px] opacity-100" : "w-0 opacity-0",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div
        className={[
          "flex h-full w-[320px] shrink-0 flex-col border-r border-black/[0.06] px-6 py-7 transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-4",
        ].join(" ")}
      >
        {/* single clickable H logo — back to landing */}
        <a
          href="/"
          aria-label="back to home"
          className="group relative mx-auto block size-40 animate-wobble"
        >
          <Image
            src="/Haggle2.png"
            alt="Haggle"
            fill
            priority
            className="object-contain drop-shadow-[6px_6px_0_rgba(10,10,10,0.16)] transition-transform group-hover:scale-[1.04]"
          />
        </a>
        <p className="mt-3 text-center font-display text-[15px] font-bold tracking-tight text-ink-900">
          haggle
        </p>
        <p className="mt-0.5 text-center text-[12px] text-ink-500">
          your web concierge
        </p>

        <div className="mt-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
            · status
          </div>
          <div className="mt-2 rounded-2xl bg-white p-3 sticker-2">
            <div className="flex items-center gap-2">
              <StatusDot kind={status.kind} />
              <span className="text-[13px] font-semibold text-ink-900">
                {statusHeadline(status.kind)}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-ink-500">{status.label}</p>
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em]">
              <span
                className={[
                  "inline-flex items-center gap-1",
                  connected ? "text-emerald-700" : "text-amber-700",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-1.5 rounded-full",
                    connected ? "animate-ping-dot bg-emerald-500" : "bg-amber-500",
                  ].join(" ")}
                />
                {connected ? "live" : "offline"}
              </span>
              <span className="text-ink-400">{formatPhoneCompact(phone)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
            · drop a line
          </div>
          <ul role="list" className="mt-3 space-y-2">
            {SUGGESTIONS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onSuggest(s)}
                  className="group sticker-pop block w-full rounded-xl bg-white px-3 py-2.5 text-left text-[12px] sticker-2"
                  style={{
                    transform: `rotate(${i % 2 === 0 ? "-0.5deg" : "0.5deg"})`,
                  }}
                >
                  <span className="text-haggle-500">›</span>{" "}
                  <span className="font-mono text-ink-700 group-hover:text-ink-900">
                    {s}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={() => {
              if (confirm("start a new conversation? this won't delete history")) {
                onReset();
              }
            }}
            className="sticker-pop inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2.5 text-[13px] font-bold text-white sticker-3"
          >
            <PencilSquare className="size-3.5" />
            new conversation
          </button>
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
            web concierge · v0.1
          </p>
        </div>
      </div>
    </aside>
  );
}

function statusHeadline(kind: AgentStatus["kind"]): string {
  if (kind === "thinking") return "thinking";
  if (kind === "busy") return "working on it";
  return "haggle is online";
}

function StatusDot({ kind }: { kind: AgentStatus["kind"] }) {
  const color =
    kind === "thinking"
      ? "bg-amber-400"
      : kind === "busy"
        ? "bg-haggle-500"
        : "bg-emerald-500";
  return (
    <span className="relative inline-flex size-2">
      <span
        className={[
          "absolute inset-0 rounded-full opacity-50",
          color,
          kind === "thinking" || kind === "busy" ? "animate-pulse-ring" : "",
        ].join(" ")}
      />
      <span className={["relative size-2 rounded-full", color].join(" ")} />
    </span>
  );
}

/* ─── chat header ──────────────────────────────────────── */

type AgentStatus =
  | { kind: "online"; label: string }
  | { kind: "thinking"; label: string }
  | { kind: "busy"; label: string };

function computeStatus(messages: Msg[], typing: boolean): AgentStatus {
  if (typing) return { kind: "thinking", label: "typing…" };
  const last = messages.at(-1);
  if (!last) return { kind: "online", label: "usually replies in seconds" };
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
  sidebarOpen,
  onToggleSidebar,
}: {
  phone: string;
  connected: boolean;
  status: AgentStatus;
  onReset: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6 lg:max-w-none lg:px-8">
        {/* left edge: mobile = back, desktop = sidebar toggle */}
        <a
          href="/"
          aria-label="back to home"
          className="relative -ml-1 inline-flex size-9 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 lg:hidden"
        >
          <ChevronLeft className="size-4" />
        </a>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="relative -ml-1 hidden size-9 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 lg:inline-flex"
          aria-label={sidebarOpen ? "hide sidebar" : "show sidebar"}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? "hide sidebar" : "show sidebar"}
        >
          <SidebarIcon className="size-4" open={sidebarOpen} />
        </button>

        {/* sticker H avatar */}
        <div className="relative shrink-0">
          <div className="relative size-10 rounded-xl bg-white p-1 sticker-2">
            <Image
              src="/Haggle2.png"
              alt=""
              fill
              className="rounded-lg object-contain p-0.5"
            />
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
            <p className="truncate text-[15px] font-semibold tracking-tight text-ink-900">
              haggle
            </p>
            <VerifiedBadge />
          </div>
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[12px] text-ink-500">{status.label}</p>
            {status.kind === "thinking" && <ThinkingDots />}
          </div>
        </div>

        {/* right chrome — mobile only (desktop sidebar has the live status) */}
        <div className="hidden items-center gap-2 sm:flex lg:hidden">
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
            {connected ? "live" : "offline"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-300">
            {formatPhoneCompact(phone)}
          </span>
        </div>

        {/* mobile new-conversation button */}
        <button
          type="button"
          onClick={() => {
            if (confirm("start a new conversation? this won't delete history")) {
              onReset();
            }
          }}
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 lg:hidden"
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
      title="verified concierge"
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

/* ─── empty state ──────────────────────────────────────── */

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center pt-10 pb-8 text-center animate-fade-in">
      <div className="relative animate-tilt-in">
        <div className="relative size-20 sm:size-24 lg:hidden">
          <Image
            src="/Haggle2.png"
            alt="Haggle"
            fill
            priority
            className="object-contain drop-shadow-[5px_5px_0_rgba(10,10,10,0.18)]"
          />
        </div>
        {/* desktop hides the empty-state logo because the sidebar already has the big H */}
        <div className="relative hidden lg:block">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-ink-600 sticker-2">
            <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />
            ready when you are
          </span>
        </div>
      </div>
      <h2
        className="mt-6 font-display text-[26px] font-black leading-tight tracking-[-0.02em]"
        style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
      >
        what can we haggle for you?
      </h2>
      <p className="mt-2 max-w-[32ch] text-[14px] leading-relaxed text-ink-500 text-pretty">
        tell us what you need and a budget. we&apos;ll call providers in parallel
        and book the best one.
      </p>

      <ul
        role="list"
        className="mt-8 grid w-full max-w-md gap-2 sm:grid-cols-2 lg:hidden"
      >
        {SUGGESTIONS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="group sticker-pop relative flex w-full items-center justify-between gap-2 rounded-xl bg-white p-3 text-left text-[13px] text-ink-700 sticker-2"
              style={{
                transform: `rotate(${i % 2 === 0 ? "-0.5deg" : "0.5deg"})`,
              }}
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

/* ─── message list with date dividers ──────────────────── */

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
          "relative max-w-[82%] whitespace-pre-wrap px-3.5 py-2 text-[15px] leading-snug",
          isMe
            ? showTail
              ? "bubble-me bubble-sticker-blue bg-[#2C7BF2] text-white"
              : "rounded-[22px] bubble-sticker-blue bg-[#2C7BF2] text-white"
            : showTail
              ? "bubble-them bubble-sticker-gray bg-white text-ink-900"
              : "rounded-[22px] bubble-sticker-gray bg-white text-ink-900",
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
      <div className="bubble-them bubble-sticker-gray flex items-center gap-1 bg-white px-3.5 py-3">
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
};

const Composer = function Composer({
  ref,
  draft,
  onDraftChange,
  onSubmit,
  onKeyDown,
  sending,
}: ComposerProps & { ref: React.RefObject<HTMLTextAreaElement | null> }) {
  const canSend = draft.trim().length > 0 && !sending;
  return (
    <div className="sticky bottom-0 z-10 composer-safe">
      <div className="mx-auto w-full max-w-2xl px-4 pt-3 pb-3 sm:px-6">
        <form
          onSubmit={onSubmit}
          className="flex items-end gap-2 rounded-3xl bg-white p-1.5 sticker-3 transition focus-within:translate-x-[-1px] focus-within:translate-y-[-1px]"
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
            placeholder="say what you need…"
            className="block min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-ink-900 outline-none placeholder:text-ink-300 max-sm:text-base"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={[
              "relative flex size-10 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-haggle-600",
              canSend
                ? "bg-haggle-500 text-white sticker-2 hover:bg-haggle-600 active:translate-x-px active:translate-y-px"
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
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
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

function SidebarIcon({ className, open }: { className?: string; open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="10.5"
        y1="3"
        x2="10.5"
        y2="13"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {open && (
        <rect x="11" y="4" width="2.5" height="8" rx="0.5" fill="currentColor" />
      )}
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
    return `today · ${formatTime(ts)}`;
  }
  if (target.getTime() === yesterday.getTime()) {
    return `yesterday · ${formatTime(ts)}`;
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
