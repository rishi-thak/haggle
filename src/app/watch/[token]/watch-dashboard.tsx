"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * /watch/[token] — the live "mission control" dashboard.
 *
 * Focal point: the multi-browser mosaic. Everything else collapses into a
 * compact right rail with tabs (best / leads / activity), so the user can
 * sort through info without scrolling forever.
 *
 * Click any browser tile to enter "focus mode" — that tile expands to fill
 * the stage and the others shrink to a thumbnail strip alongside.
 *
 * Palette matches the chat page: paper bg, ink type, chunky black sticker
 * shadows, red H sticker. Live tiles get a breathing red shadow.
 * ───────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type {
  BrowserSessionRow,
  CallRow,
  Lead,
  MessageRow,
  WatchSnapshot,
} from "@/lib/types";
import { computeBestLead } from "@/lib/leadSelection";
import { withLivePreviewParams } from "@/lib/watch";

type ApiState =
  | { status: "loading"; snapshot: null; error: null }
  | { status: "ready"; snapshot: WatchSnapshot; error: null }
  | { status: "error"; snapshot: WatchSnapshot | null; error: string };

type FeedItem = {
  id: string;
  kind: string;
  text: string;
  createdAt: number;
  tone: "browser" | "voice" | "imessage" | "email" | "system";
};

type RailTab = "best" | "leads" | "activity";

const JOB_STATUS_LABELS: Record<string, string> = {
  new: "new",
  researching: "researching",
  gathering_info: "gathering info",
  searching: "searching",
  ranked: "ranked",
  awaiting_approval: "awaiting approval",
  calling: "calling",
  negotiating: "negotiating",
  awaiting_callback: "awaiting callback",
  email_fallback: "email fallback",
  awaiting_confirm: "awaiting confirm",
  paying: "paying",
  complete: "complete",
  failed: "failed",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  pending: "queued",
  calling: "on call",
  negotiating: "negotiating",
  agreed: "agreed",
  declined: "declined",
  no_answer: "no answer",
  callback: "callback",
  ambiguous: "unclear",
  emailed: "emailed",
};

const ACTIVE_JOB_STATUSES = new Set([
  "researching",
  "gathering_info",
  "searching",
  "ranked",
  "calling",
  "negotiating",
  "awaiting_callback",
  "email_fallback",
  "paying",
]);

const TERMINAL_JOB_STATUSES = new Set(["complete", "failed"]);
const DEAD_SESSION_STATUSES = new Set([
  "complete",
  "done",
  "succeeded",
  "finished",
  "error",
  "failed",
  "stopped",
]);

/* ─── utils ────────────────────────────────────────────── */

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatRelative(value: number, now: number): string {
  const diff = Math.max(0, now - value);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const dollars = cents / 100;
  return dollars >= 1000
    ? `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${dollars.toFixed(0)}`;
}

function feedTone(kind: string): FeedItem["tone"] {
  if (kind === "voice") return "voice";
  if (kind === "imessage") return "imessage";
  if (kind === "email") return "email";
  if (kind === "system") return "system";
  return "browser";
}

function toneClasses(tone: FeedItem["tone"]): string {
  switch (tone) {
    case "voice":
      return "text-amber-600";
    case "imessage":
      return "text-sky-600";
    case "email":
      return "text-violet-600";
    case "system":
      return "text-ink-400";
    default:
      return "text-haggle-600";
  }
}

function leadStatusTone(status: string): { dot: string; text: string } {
  if (status === "agreed") return { dot: "bg-emerald-500", text: "text-emerald-700" };
  if (["declined", "no_answer", "ambiguous"].includes(status))
    return { dot: "bg-ink-200", text: "text-ink-400" };
  if (["calling", "negotiating", "callback", "emailed"].includes(status))
    return { dot: "bg-haggle-500", text: "text-haggle-600" };
  return { dot: "bg-ink-300", text: "text-ink-500" };
}

function sessionIsLive(session: BrowserSessionRow): boolean {
  return !DEAD_SESSION_STATUSES.has(session.status.toLowerCase());
}

function leadContact(lead: Lead): string {
  return lead.phone ?? lead.email ?? "no contact";
}

/* ─── hooks ────────────────────────────────────────────── */

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function useWatchSnapshot(token: string): ApiState {
  const [state, setState] = useState<ApiState>({
    status: "loading",
    snapshot: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      let shouldRetry = true;
      try {
        const res = await fetch(`/api/watch/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok || !json.ok) {
          if (res.status === 404) shouldRetry = false;
          throw new Error(json.error || "Failed to load watch snapshot");
        }
        if (!cancelled) {
          setState({
            status: "ready",
            snapshot: json.snapshot as WatchSnapshot,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            status: "error",
            snapshot: prev.snapshot,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      } finally {
        if (!cancelled && shouldRetry) timer = setTimeout(load, 2_000);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  return state;
}

function buildFeed(snapshot: WatchSnapshot): FeedItem[] {
  const browser = snapshot.browserEvents.map((event) => ({
    id: `browser-${event.id}`,
    kind: event.type.replace(/_/g, " "),
    text: event.summary,
    createdAt: event.created_at,
    tone: "browser" as const,
  }));
  const messages = snapshot.messages.map((message: MessageRow) => ({
    id: `message-${message.id}`,
    kind: message.channel,
    text: message.body,
    createdAt: message.created_at,
    tone: feedTone(message.channel),
  }));
  return [...browser, ...messages]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 80);
}

/* ─── root ─────────────────────────────────────────────── */

export default function WatchDashboard({ token }: { token: string }) {
  const state = useWatchSnapshot(token);
  const snapshot = state.snapshot;
  const now = useNow(1000);

  const [focusedSessionId, setFocusedSessionId] = useState<number | null>(null);
  const [tab, setTab] = useState<RailTab>("best");

  const sessions = snapshot?.browserSessions ?? [];

  useEffect(() => {
    if (focusedSessionId && !sessions.some((s) => s.id === focusedSessionId)) {
      setFocusedSessionId(null);
    }
  }, [sessions, focusedSessionId]);

  const feed = useMemo(() => (snapshot ? buildFeed(snapshot) : []), [snapshot]);
  const bestLead = useMemo(
    () => (snapshot ? computeBestLead(snapshot.leads) : null),
    [snapshot]
  );

  const elapsedMs = snapshot ? now - snapshot.job.created_at : 0;
  const jobStatus = snapshot?.job.status ?? "";
  const isLive = !!snapshot && ACTIVE_JOB_STATUSES.has(jobStatus);
  const isTerminal = !!snapshot && TERMINAL_JOB_STATUSES.has(jobStatus);

  const liveCalls = (snapshot?.calls ?? []).filter((c) => c.ended_at === null);
  const activeAgentCount = sessions.filter(sessionIsLive).length;

  return (
    <main
      className="chat-canvas grain relative isolate min-h-dvh text-ink-900 antialiased"
      style={{ fontFeatureSettings: "'ss01', 'cv11', 'cv02'" }}
    >
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1760px] flex-col">
        <TopBar
          job={snapshot?.job ?? null}
          elapsedMs={elapsedMs}
          isLive={isLive}
          isTerminal={isTerminal}
          loading={state.status === "loading"}
          error={state.status === "error" ? state.error : null}
          agentCount={sessions.length}
          activeAgentCount={activeAgentCount}
          leadCount={snapshot?.leads.length ?? 0}
          quoteCount={(snapshot?.leads ?? []).filter((l) => l.quoted_price_cents !== null).length}
          liveCallCount={liveCalls.length}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* MAIN STAGE — multi-browser mosaic (focal point) */}
          <section className="flex min-h-0 flex-col border-b border-black/[0.06] lg:border-b-0 lg:border-r">
            <BrowserMosaic
              sessions={sessions}
              focusedSessionId={focusedSessionId}
              onFocus={setFocusedSessionId}
              loading={state.status === "loading"}
            />
          </section>

          {/* RIGHT RAIL — tabbed */}
          <aside className="flex min-h-0 flex-col">
            <RailTabs current={tab} onChange={setTab} />
            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
              {tab === "best" && (
                <BestTab
                  bestLead={bestLead}
                  budgetCents={snapshot?.job.budget_cents ?? null}
                  isTerminal={isTerminal}
                />
              )}
              {tab === "leads" && (
                <LeadsTab
                  leads={snapshot?.leads ?? []}
                  bestLeadId={bestLead?.id ?? null}
                />
              )}
              {tab === "activity" && <ActivityTab feed={feed} now={now} />}
            </div>
          </aside>
        </div>

        {/* live call ticker — only when calls are open */}
        {liveCalls.length > 0 && (
          <CallTicker calls={liveCalls} leads={snapshot?.leads ?? []} now={now} />
        )}

        <Footer
          now={now}
          error={state.status === "error" ? state.error : null}
        />
      </div>
    </main>
  );
}

/* ─── top bar ──────────────────────────────────────────── */

function TopBar({
  job,
  elapsedMs,
  isLive,
  isTerminal,
  loading,
  error,
  agentCount,
  activeAgentCount,
  leadCount,
  quoteCount,
  liveCallCount,
}: {
  job: WatchSnapshot["job"] | null;
  elapsedMs: number;
  isLive: boolean;
  isTerminal: boolean;
  loading: boolean;
  error: string | null;
  agentCount: number;
  activeAgentCount: number;
  leadCount: number;
  quoteCount: number;
  liveCallCount: number;
}) {
  const liveLabel = isLive
    ? "live"
    : isTerminal
      ? "ended"
      : loading
        ? "tuning in"
        : "standby";

  return (
    <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-paper/85 backdrop-blur-xl">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6">
        {/* left: home logo + live pill */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            aria-label="back to home"
            className="group inline-flex shrink-0 items-center gap-2.5"
          >
            <div className="relative size-8 transition-transform group-hover:-rotate-6">
              <Image src="/Haggle2.png" alt="" fill className="object-contain" />
            </div>
            <span className="hidden font-display text-[15px] font-bold tracking-tight sm:block">
              haggle
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400 sm:block">
              live desk
            </span>
          </a>
          <div className="hidden h-5 w-px bg-black/[0.08] lg:block" />
          <LivePill label={liveLabel} active={isLive} />
        </div>

        {/* middle: the request */}
        <div className="min-w-0 flex-1 lg:text-center">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 lg:justify-center">
            <h1
              className="truncate font-display text-[22px] font-black tracking-tight text-balance sm:text-[26px]"
              style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
            >
              {job?.service ?? (loading ? "tuning in…" : "waiting for request")}
            </h1>
            {job?.location && (
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
                in {job.location}
              </span>
            )}
          </div>
          {(job?.timeframe || job?.budget_cents !== null) && (
            <p className="truncate text-[12px] text-ink-500 lg:text-center">
              {job?.timeframe}
              {job?.timeframe && job?.budget_cents !== null && (
                <span className="mx-1.5 text-ink-300">·</span>
              )}
              {job?.budget_cents !== null && (
                <>budget {formatMoney(job?.budget_cents)}</>
              )}
            </p>
          )}
        </div>

        {/* right: vitals inline */}
        <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap">
          <Stat label="elapsed" value={job ? formatElapsed(elapsedMs) : "00:00"} tabular />
          <Stat
            label="agents"
            value={String(agentCount)}
            accent={activeAgentCount > 0}
            sub={activeAgentCount > 0 ? `${activeAgentCount} live` : undefined}
          />
          <Stat
            label="leads"
            value={String(leadCount)}
            sub={quoteCount > 0 ? `${quoteCount} quoted` : undefined}
          />
          {liveCallCount > 0 && (
            <Stat label="on line" value={String(liveCallCount)} accent />
          )}
          {error && (
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-amber-700 lg:inline">
              reconnecting
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function LivePill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 sticker-2">
      <span className="relative inline-flex size-2 items-center justify-center">
        {active && (
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-haggle-500/70" />
        )}
        <span
          className={`size-2 rounded-full ${active ? "bg-haggle-500" : "bg-ink-300"}`}
        />
      </span>
      <span
        className={`font-mono text-[10px] font-semibold uppercase tracking-[0.2em] ${
          active ? "text-haggle-600" : "text-ink-500"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  tabular,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tabular?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-baseline gap-1.5 rounded-md px-2.5 py-1 ring-1 ring-inset",
        accent
          ? "bg-haggle-500/10 ring-haggle-500/30"
          : "bg-white ring-black/[0.06]",
      ].join(" ")}
    >
      <span
        className={[
          "font-mono text-[9px] uppercase tracking-[0.16em]",
          accent ? "text-haggle-600" : "text-ink-400",
        ].join(" ")}
      >
        {label}
      </span>
      <span
        className={[
          "text-[13px] font-semibold",
          tabular ? "tabular-nums" : "",
          accent ? "text-haggle-700" : "text-ink-900",
        ].join(" ")}
      >
        {value}
      </span>
      {sub && (
        <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-ink-400 sm:inline">
          · {sub}
        </span>
      )}
    </div>
  );
}

/* ─── browser mosaic ──────────────────────────────────── */

function BrowserMosaic({
  sessions,
  focusedSessionId,
  onFocus,
  loading,
}: {
  sessions: BrowserSessionRow[];
  focusedSessionId: number | null;
  onFocus: (id: number | null) => void;
  loading: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyMosaic loading={loading} />
      </div>
    );
  }

  const focused = focusedSessionId
    ? sessions.find((s) => s.id === focusedSessionId)
    : null;

  // Browser Use's cloud live preview throttles when multiple iframes are open at
  // once — only render the LIVE iframe for ONE session at a time (the focused
  // one, or the most-recently-updated by default). Other tiles show the latest
  // screenshot from the session's progress events.
  const activeId =
    focused?.id ??
    [...sessions].sort((a, b) => b.updated_at - a.updated_at)[0]?.id ??
    null;

  if (focused) {
    const others = sessions.filter((s) => s.id !== focused.id);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MosaicHeader
          count={sessions.length}
          focused={focused}
          onExit={() => onFocus(null)}
        />
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-4 p-4 sm:p-5">
          <BrowserTile
            session={focused}
            variant="hero"
            isActive
            onClick={() => onFocus(null)}
          />
          {others.length > 0 && (
            <div className="chat-scroll flex gap-3 overflow-x-auto pb-2 pt-1">
              {others.map((s) => (
                <BrowserTile
                  key={s.id}
                  session={s}
                  variant="strip"
                  isActive={false}
                  onClick={() => onFocus(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // grid layout, adaptive by count
  const gridCols =
    sessions.length === 1
      ? "grid-cols-1"
      : sessions.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MosaicHeader count={sessions.length} />
      <div className={`grid min-h-0 flex-1 gap-4 p-4 sm:p-5 ${gridCols}`}>
        {sessions.map((s) => (
          <BrowserTile
            key={s.id}
            session={s}
            variant="grid"
            isActive={s.id === activeId}
            onClick={() => onFocus(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MosaicHeader({
  count,
  focused,
  onExit,
}: {
  count: number;
  focused?: BrowserSessionRow;
  onExit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] bg-paper/60 px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
          · browser swarm
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-300 tabular-nums">
          {count} {count === 1 ? "agent" : "agents"}
        </span>
        {focused && (
          <span className="hidden truncate text-[12px] text-ink-500 sm:inline">
            <span className="text-ink-300">focused on</span> {focused.label || `agent ${focused.id}`}
          </span>
        )}
      </div>
      {focused && onExit && (
        <button
          type="button"
          onClick={onExit}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-700 sticker-2 transition hover:text-ink-900"
        >
          <BackIcon className="size-3" />
          back to grid
        </button>
      )}
    </div>
  );
}

function BrowserTile({
  session,
  variant,
  isActive,
  onClick,
}: {
  session: BrowserSessionRow;
  variant: "hero" | "grid" | "strip";
  // Only the active tile streams the live iframe — Browser Use's cloud preview
  // is flaky with multiple concurrent viewers. Inactive tiles show a snapshot.
  isActive: boolean;
  onClick: () => void;
}) {
  const live = sessionIsLive(session);
  const embedSource = session.share_url ?? session.live_url;
  const liveUrl = embedSource
    ? withLivePreviewParams(embedSource, { theme: "light" })
    : null;
  const openUrl = session.share_url ?? session.live_url;
  const showIframe = isActive && !!liveUrl;
  const snapshot = session.screenshot_url;

  if (variant === "strip") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          "group relative aspect-video h-28 shrink-0 overflow-hidden rounded-lg bg-ink-100 text-left",
          live ? "live-tile" : "sticker-2",
        ].join(" ")}
        aria-label={`focus ${session.label || `agent ${session.id}`}`}
      >
        {snapshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshot}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-100">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              {live ? "warming…" : session.status}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <SessionDot live={live} onDark />
            <span className="truncate text-[10px] font-medium text-white">
              {session.label || `agent ${session.id}`}
            </span>
          </div>
        </div>
      </button>
    );
  }

  const isHero = variant === "hero";
  return (
    <div
      className={[
        "relative flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white",
        live ? "live-tile" : "sticker-3",
      ].join(" ")}
    >
      {/* tile chrome */}
      <div className="flex items-center gap-3 border-b border-black/[0.06] bg-white px-3 py-2">
        <div className="flex items-center gap-1.5">
          <SessionDot live={live} />
          <span className="truncate text-[12px] font-semibold text-ink-900">
            {session.label || `agent ${session.id}`}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-ink-50 px-2.5 py-1 ring-1 ring-inset ring-black/[0.04]">
          <span className="truncate font-mono text-[10px] tracking-wide text-ink-500">
            browser-use://{session.phase || "standby"}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400 tabular-nums">
          step {session.step_count}
        </span>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-md bg-ink-50 p-1.5 text-ink-500 transition hover:bg-haggle-500/10 hover:text-haggle-600"
            aria-label="open in new tab"
            title="open in new tab"
          >
            <NewTabIcon className="size-3.5" />
          </a>
        )}
        {!isHero && (
          <button
            type="button"
            onClick={onClick}
            className="shrink-0 rounded-md bg-ink-50 p-1.5 text-ink-500 transition hover:bg-haggle-500/10 hover:text-haggle-600"
            aria-label="focus this agent"
            title="focus this agent"
          >
            <ExpandIcon className="size-3.5" />
          </button>
        )}
      </div>

      {/* viewport */}
      <div className={`relative ${isHero ? "flex-1" : "aspect-video"} bg-ink-100`}>
        {showIframe ? (
          <>
            <iframe
              key={liveUrl}
              title={`${session.label} live preview`}
              src={liveUrl!}
              allow="autoplay"
              className="absolute inset-0 h-full w-full animate-fade-in border-0"
            />
            {/* click-shield for grid mode so the iframe doesn't steal clicks meant for focusing */}
            {!isHero && (
              <button
                type="button"
                onClick={onClick}
                className="absolute inset-0 bg-transparent transition hover:bg-haggle-500/5"
                aria-label={`focus ${session.label}`}
              />
            )}
          </>
        ) : snapshot ? (
          <button
            type="button"
            onClick={onClick}
            className="absolute inset-0 block bg-ink-100 transition hover:bg-haggle-500/5"
            aria-label={`focus ${session.label} for live view`}
            title="click for live view"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={snapshot}
              alt=""
              className="h-full w-full object-cover"
            />
            {live && (
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-700 shadow-sm">
                <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />
                click for live
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-100 text-center"
          >
            <div className="relative inline-flex size-10 items-center justify-center">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-haggle-500/40" />
              <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              {live ? "warming up" : session.status}
            </span>
          </button>
        )}
      </div>

      {/* bottom strip: last step */}
      <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-white px-3 py-2">
        <p className="min-w-0 truncate text-[12px] text-ink-600 text-pretty">
          {session.error ?? session.last_step_summary ?? "awaiting next step…"}
        </p>
        {session.error && (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-700 ring-1 ring-inset ring-amber-500/30">
            error
          </span>
        )}
      </div>
    </div>
  );
}

function SessionDot({ live, onDark }: { live: boolean; onDark?: boolean }) {
  return (
    <span className="relative inline-flex size-2 shrink-0 items-center justify-center">
      {live && (
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-haggle-500/60" />
      )}
      <span
        className={`size-1.5 rounded-full ${
          live ? "bg-haggle-500" : onDark ? "bg-white/50" : "bg-ink-300"
        }`}
      />
    </span>
  );
}

function EmptyMosaic({ loading }: { loading: boolean }) {
  return (
    <div className="max-w-sm text-center animate-fade-in">
      <div className="relative mx-auto size-24 animate-tilt-in">
        <Image
          src="/Haggle2.png"
          alt="haggle"
          fill
          priority
          className="object-contain drop-shadow-[5px_5px_0_rgba(10,10,10,0.18)]"
        />
      </div>
      <h2
        className="mt-6 font-display text-[22px] font-black tracking-tight text-balance"
        style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
      >
        {loading ? "opening live desk" : "waiting for the first agent"}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-500 text-pretty">
        agents are negotiating their way to the right provider. their browsers
        stream here in real time.
      </p>
    </div>
  );
}

/* ─── right rail: tabs ─────────────────────────────────── */

function RailTabs({
  current,
  onChange,
}: {
  current: RailTab;
  onChange: (t: RailTab) => void;
}) {
  const tabs: { id: RailTab; label: string }[] = [
    { id: "best", label: "best quote" },
    { id: "leads", label: "leads" },
    { id: "activity", label: "activity" },
  ];
  return (
    <div className="flex shrink-0 items-stretch border-b border-black/[0.06] bg-paper/60">
      {tabs.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              "relative flex-1 px-3 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition",
              active
                ? "text-ink-900"
                : "text-ink-400 hover:bg-white/40 hover:text-ink-700",
            ].join(" ")}
          >
            {t.label}
            {active && (
              <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-haggle-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── tab: best quote ──────────────────────────────────── */

function BestTab({
  bestLead,
  budgetCents,
  isTerminal,
}: {
  bestLead: Lead | null;
  budgetCents: number | null;
  isTerminal: boolean;
}) {
  const hasQuote = bestLead && bestLead.quoted_price_cents !== null;
  const savings =
    hasQuote && budgetCents !== null && budgetCents > (bestLead!.quoted_price_cents ?? 0)
      ? budgetCents - (bestLead!.quoted_price_cents ?? 0)
      : null;
  const agreed = bestLead?.status === "agreed";

  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
          · best quote
        </span>
        {agreed ? (
          <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-inset ring-emerald-500/30">
            agreed
          </span>
        ) : hasQuote ? (
          <span className="rounded-full bg-haggle-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haggle-600 ring-1 ring-inset ring-haggle-500/30">
            live
          </span>
        ) : null}
      </div>

      {hasQuote ? (
        <>
          <div className="mt-4 flex items-baseline gap-3">
            <div
              className="font-display text-[3rem] font-black leading-none tracking-tight tabular-nums"
              style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 30" }}
            >
              {formatMoney(bestLead.quoted_price_cents)}
            </div>
            {budgetCents !== null && (
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400 tabular-nums">
                / {formatMoney(budgetCents)} budget
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-white p-3 sticker-2">
            <div className="truncate text-[14px] font-semibold text-ink-900">
              {bestLead.name}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
              <span className="tabular-nums">
                {bestLead.rating ? `${bestLead.rating.toFixed(1)} ★` : "unrated"}
              </span>
              <span className="text-ink-300">·</span>
              <span className="truncate font-mono">{leadContact(bestLead)}</span>
            </div>
          </div>

          {savings !== null && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-1.5 ring-1 ring-inset ring-emerald-500/25">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-700 tabular-nums">
                saving {formatMoney(savings)}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4">
          <div
            className="font-display text-[2.5rem] font-black leading-none tracking-tight text-ink-200 tabular-nums"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 30" }}
          >
            —
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-500 text-pretty">
            {isTerminal
              ? "no quotes landed before this job ended."
              : "listening for the first quote. agents are dialing now."}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── tab: leads pipeline ──────────────────────────────── */

function LeadsTab({
  leads,
  bestLeadId,
}: {
  leads: Lead[];
  bestLeadId: number | null;
}) {
  const sorted = useMemo(() => {
    return [...leads].sort((a, b) => {
      const aQ = a.quoted_price_cents ?? Number.POSITIVE_INFINITY;
      const bQ = b.quoted_price_cents ?? Number.POSITIVE_INFINITY;
      if (aQ !== bQ) return aQ - bQ;
      return (b.rating ?? 0) - (a.rating ?? 0);
    });
  }, [leads]);

  if (sorted.length === 0) {
    return (
      <div className="px-5 py-5">
        <EmptyLine text="lead search has not returned results yet." />
      </div>
    );
  }

  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between gap-3 pb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
          · pipeline
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-300 tabular-nums">
          {sorted.length} leads
        </span>
      </div>
      <ol role="list" className="space-y-1.5">
        {sorted.map((lead) => {
          const tone = leadStatusTone(lead.status);
          const isBest = lead.id === bestLeadId;
          return (
            <li
              key={lead.id}
              className={[
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 ring-1 ring-inset transition",
                isBest
                  ? "bg-haggle-500/8 ring-haggle-500/30"
                  : "bg-white ring-black/[0.06] hover:bg-ink-50",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
                  <span className="truncate text-[13px] font-medium text-ink-900">
                    {lead.name}
                  </span>
                  {isBest && (
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-haggle-600">
                      best
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
                  <span className={`font-mono uppercase tracking-[0.12em] ${tone.text}`}>
                    {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                  {lead.rating !== null && (
                    <>
                      <span className="text-ink-300">·</span>
                      <span className="tabular-nums">{lead.rating.toFixed(1)}★</span>
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[13px] font-medium text-ink-900 tabular-nums">
                  {formatMoney(lead.quoted_price_cents)}
                </div>
                {lead.quoted_price_cents === null && (
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-300">
                    no quote
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ─── tab: activity (events + messages combined) ───────── */

function ActivityTab({ feed, now }: { feed: FeedItem[]; now: number }) {
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const item of feed) seenRef.current.add(item.id);
  }, [feed]);

  if (feed.length === 0) {
    return (
      <div className="px-5 py-5">
        <EmptyLine text="events appear here as agents work." />
      </div>
    );
  }

  return (
    <ol role="list" className="divide-y divide-black/[0.04]">
      {feed.map((item) => {
        const isNew = !seenRef.current.has(item.id);
        return (
          <li
            key={item.id}
            className={`grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-5 py-3 ${
              isNew ? "animate-fade-in" : ""
            }`}
          >
            <div className="pt-px font-mono text-[10px] uppercase tracking-[0.14em] text-ink-300 tabular-nums">
              {formatRelative(item.createdAt, now)}
            </div>
            <div className="min-w-0">
              <div
                className={`font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${toneClasses(item.tone)}`}
              >
                {item.kind}
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-700 text-pretty">
                {item.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ─── live call ticker (bottom strip) ──────────────────── */

function CallTicker({
  calls,
  leads,
  now,
}: {
  calls: CallRow[];
  leads: Lead[];
  now: number;
}) {
  const leadById = useMemo(() => {
    const m = new Map<number, Lead>();
    for (const l of leads) m.set(l.id, l);
    return m;
  }, [leads]);

  return (
    <div className="border-t border-black/[0.06] bg-haggle-500/[0.06] px-4 py-2 sm:px-6">
      <div className="chat-scroll flex items-center gap-3 overflow-x-auto">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-haggle-600">
            on the line
          </span>
        </div>
        <ul role="list" className="flex shrink-0 items-center gap-2">
          {calls.map((call) => {
            const lead = leadById.get(call.lead_id);
            const duration = formatElapsed(now - call.created_at);
            return (
              <li
                key={call.id}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 ring-1 ring-inset ring-haggle-500/30"
              >
                <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />
                <span className="truncate text-[12px] font-medium text-ink-900">
                  {lead?.name ?? `lead #${call.lead_id}`}
                </span>
                <span className="font-mono text-[11px] text-ink-500 tabular-nums">
                  {duration}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ─── footer ───────────────────────────────────────────── */

function Footer({ now, error }: { now: number; error: string | null }) {
  return (
    <footer className="border-t border-black/[0.06] px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
        <span>haggle · live desk</span>
        <span className="tabular-nums">
          {error ? `reconnecting · ${error}` : `auto-refresh · 2s · ${formatTime(now)}`}
        </span>
      </div>
    </footer>
  );
}

/* ─── shared ───────────────────────────────────────────── */

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-black/[0.08] px-3 py-4 text-[13px] text-ink-400 text-pretty">
      {text}
    </div>
  );
}

function NewTabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 3H13V7M13 3L7.5 8.5M11 9V12C11 12.5523 10.5523 13 10 13H4C3.44772 13 3 12.5523 3 12V6C3 5.44772 3.44772 5 4 5H7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 3H13V7M7 13H3V9M13 3L9 7M3 13L7 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
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
