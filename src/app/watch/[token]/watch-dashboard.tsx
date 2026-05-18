"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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

const JOB_STATUS_LABELS: Record<string, string> = {
  new: "New",
  researching: "Researching",
  gathering_info: "Gathering info",
  searching: "Searching",
  ranked: "Ranked",
  awaiting_approval: "Awaiting approval",
  calling: "Calling",
  negotiating: "Negotiating",
  awaiting_callback: "Awaiting callback",
  email_fallback: "Email fallback",
  awaiting_confirm: "Awaiting confirm",
  paying: "Paying",
  complete: "Complete",
  failed: "Failed",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  calling: "On call",
  negotiating: "Negotiating",
  agreed: "Agreed",
  declined: "Declined",
  no_answer: "No answer",
  callback: "Callback",
  ambiguous: "Unclear",
  emailed: "Emailed",
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
      return "text-amber-300";
    case "imessage":
      return "text-sky-300";
    case "email":
      return "text-violet-300";
    case "system":
      return "text-white/40";
    default:
      return "text-haggle-400";
  }
}

function jobStatusTone(status: string): {
  dot: string;
  ring: string;
  label: string;
} {
  if (TERMINAL_JOB_STATUSES.has(status)) {
    if (status === "complete")
      return { dot: "bg-emerald-400", ring: "ring-emerald-400/40", label: "text-emerald-300" };
    return { dot: "bg-haggle-500", ring: "ring-haggle-500/40", label: "text-haggle-400" };
  }
  if (ACTIVE_JOB_STATUSES.has(status))
    return { dot: "bg-haggle-500", ring: "ring-haggle-500/30", label: "text-haggle-400" };
  return { dot: "bg-white/30", ring: "ring-white/10", label: "text-white/55" };
}

function leadStatusTone(status: string): { dot: string; text: string } {
  if (status === "agreed") return { dot: "bg-emerald-400", text: "text-emerald-300" };
  if (["declined", "no_answer", "ambiguous"].includes(status))
    return { dot: "bg-white/25", text: "text-white/45" };
  if (["calling", "negotiating", "callback", "emailed"].includes(status))
    return { dot: "bg-haggle-500", text: "text-haggle-400" };
  return { dot: "bg-white/30", text: "text-white/55" };
}

function sessionStatusTone(status: string): { dot: string; text: string; pulse: boolean } {
  const s = status.toLowerCase();
  if (["complete", "done", "succeeded", "finished"].includes(s))
    return { dot: "bg-emerald-400", text: "text-emerald-300", pulse: false };
  if (["error", "failed", "stopped"].includes(s))
    return { dot: "bg-haggle-500", text: "text-haggle-400", pulse: false };
  if (["idle", "paused"].includes(s))
    return { dot: "bg-white/30", text: "text-white/55", pulse: false };
  return { dot: "bg-haggle-500", text: "text-haggle-400", pulse: true };
}

function leadContact(lead: Lead): string {
  return lead.phone ?? lead.email ?? "No contact";
}

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
      try {
        const res = await fetch(`/api/watch/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok || !json.ok)
          throw new Error(json.error || "Failed to load watch snapshot");
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
        if (!cancelled) timer = setTimeout(load, 2_000);
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

export default function WatchDashboard({ token }: { token: string }) {
  const state = useWatchSnapshot(token);
  const snapshot = state.snapshot;
  const now = useNow(1000);

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  useEffect(() => {
    if (!snapshot?.browserSessions.length) return;
    setSelectedSessionId((current) => {
      if (
        current &&
        snapshot.browserSessions.some((session) => session.id === current)
      )
        return current;
      return snapshot.browserSessions[0].id;
    });
  }, [snapshot]);

  const selectedSession = useMemo(() => {
    if (!snapshot) return null;
    return (
      snapshot.browserSessions.find((session) => session.id === selectedSessionId) ??
      snapshot.browserSessions[0] ??
      null
    );
  }, [selectedSessionId, snapshot]);

  const feed = useMemo(() => (snapshot ? buildFeed(snapshot) : []), [snapshot]);
  const liveUrl = selectedSession?.live_url
    ? withLivePreviewParams(selectedSession.live_url, { theme: "dark" })
    : null;

  const bestLead = useMemo(
    () => (snapshot ? computeBestLead(snapshot.leads) : null),
    [snapshot]
  );

  const elapsedMs = snapshot ? now - snapshot.job.created_at : 0;
  const jobTone = jobStatusTone(snapshot?.job.status ?? "");
  const isLive = !!snapshot && ACTIVE_JOB_STATUSES.has(snapshot.job.status);
  const isTerminal = !!snapshot && TERMINAL_JOB_STATUSES.has(snapshot.job.status);

  return (
    <main
      className="scheme-only-dark isolate min-h-dvh bg-[#0a0a0a] text-white antialiased"
      style={{ fontFeatureSettings: "'ss01', 'cv11', 'cv02'" }}
    >
      {/* Ambient backdrop — very subtle red wash at top, deep black canvas. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 [background:radial-gradient(900px_500px_at_50%_-200px,rgba(255,45,45,0.12),transparent_70%),radial-gradient(700px_400px_at_100%_100%,rgba(255,255,255,0.025),transparent_60%)]"
      />

      <div className="mx-auto flex min-h-dvh w-full max-w-[1760px] flex-col">
        <TopBar
          job={snapshot?.job ?? null}
          elapsedMs={elapsedMs}
          isLive={isLive}
          isTerminal={isTerminal}
          loading={state.status === "loading"}
          error={state.status === "error" ? state.error : null}
          jobTone={jobTone}
        />

        <VitalSigns
          snapshot={snapshot}
          elapsedMs={elapsedMs}
          isLive={isLive}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-white/[0.06] xl:grid-cols-[minmax(0,1fr)_420px]">
          {/* LEFT — preview + activity */}
          <section className="flex min-h-0 flex-col bg-[#0a0a0a]">
            <AgentSwitcher
              sessions={snapshot?.browserSessions ?? []}
              selectedId={selectedSession?.id ?? null}
              onSelect={setSelectedSessionId}
            />

            <PreviewStage
              session={selectedSession}
              liveUrl={liveUrl}
              loading={state.status === "loading"}
              isLive={isLive}
            />

            <ActivityTimeline feed={feed} now={now} />
          </section>

          {/* RIGHT — quotes + leads + comms */}
          <aside className="flex min-h-0 flex-col gap-px bg-white/[0.06] xl:bg-transparent">
            <BestQuoteCard
              bestLead={bestLead}
              budgetCents={snapshot?.job.budget_cents ?? null}
              isTerminal={isTerminal}
            />
            <LeadPipeline leads={snapshot?.leads ?? []} bestLeadId={bestLead?.id ?? null} />
            <CallStrip calls={snapshot?.calls ?? []} leads={snapshot?.leads ?? []} now={now} />
            <MessageStream messages={snapshot?.messages ?? []} />
          </aside>
        </div>

        <footer className="border-t border-white/8 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            <span>Haggle · Live Desk</span>
            <span className="tabular-nums">
              {state.status === "error"
                ? `Reconnecting · ${state.error}`
                : `Auto-refresh · 2s · ${formatTime(now)}`}
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* ─── TOP BAR ─────────────────────────────────────────────── */

function TopBar({
  job,
  elapsedMs,
  isLive,
  isTerminal,
  loading,
  error,
  jobTone,
}: {
  job: WatchSnapshot["job"] | null;
  elapsedMs: number;
  isLive: boolean;
  isTerminal: boolean;
  loading: boolean;
  error: string | null;
  jobTone: { dot: string; ring: string; label: string };
}) {
  const liveLabel = isLive ? "LIVE" : isTerminal ? "ENDED" : loading ? "TUNING IN" : "STANDBY";
  const liveColor = isLive
    ? "text-haggle-400"
    : isTerminal
    ? "text-white/45"
    : "text-white/55";

  return (
    <header className="sticky top-0 z-20 border-b border-white/8 bg-[#0a0a0a]/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2.5 items-center justify-center">
              {isLive && (
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-haggle-500/70" />
              )}
              <span className={`size-2.5 rounded-full ${isLive ? "bg-haggle-500" : "bg-white/30"}`} />
            </span>
            <span className={`font-mono text-[11px] font-medium uppercase tracking-[0.22em] ${liveColor}`}>
              {liveLabel}
            </span>
          </div>

          <div className="hidden h-5 w-px bg-white/10 lg:block" />

          <div className="flex items-center gap-2.5">
            <span className="font-display text-[15px] font-bold tracking-tight">haggle</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
              live desk
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 lg:items-center lg:text-center">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:justify-center">
            <h1
              className="truncate font-display text-2xl font-black tracking-tight text-balance sm:text-3xl"
              style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
            >
              {job?.service ?? (loading ? "Tuning in…" : "Waiting for request")}
            </h1>
            {job?.location && (
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
                in {job.location}
              </span>
            )}
          </div>
          {job?.timeframe && (
            <div className="truncate text-sm text-white/50 lg:text-center">
              {job.timeframe}
              {job.budget_cents !== null && (
                <>
                  <span className="mx-2 text-white/20">·</span>
                  budget {formatMoney(job.budget_cents)}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 ring-1 ring-inset ring-white/8">
            <span className={`size-2 rounded-full ${jobTone.dot} ${isLive ? "animate-ping-dot" : ""}`} />
            <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.16em] ${jobTone.label}`}>
              {JOB_STATUS_LABELS[job?.status ?? ""] ?? (loading ? "Loading" : "—")}
            </span>
          </div>
          <div className="rounded-full bg-white/[0.04] px-3 py-1.5 font-mono text-[12px] tabular-nums tracking-[0.08em] text-white/72 ring-1 ring-inset ring-white/8">
            {job ? formatElapsed(elapsedMs) : "00:00"}
          </div>
          {error && (
            <div className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300 lg:block">
              reconnecting
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ─── VITAL SIGNS ─────────────────────────────────────────── */

function VitalSigns({
  snapshot,
  elapsedMs,
  isLive,
}: {
  snapshot: WatchSnapshot | null;
  elapsedMs: number;
  isLive: boolean;
}) {
  const browsersActive = (snapshot?.browserSessions ?? []).filter(
    (s) => !["complete", "done", "succeeded", "finished", "error", "failed", "stopped"].includes(s.status.toLowerCase())
  ).length;
  const callsOpen = (snapshot?.calls ?? []).filter((c) => c.ended_at === null).length;
  const quotesIn = (snapshot?.leads ?? []).filter((l) => l.quoted_price_cents !== null).length;

  return (
    <div className="grid grid-cols-2 gap-px border-b border-white/8 bg-white/[0.06] sm:grid-cols-4">
      <Vital label="Elapsed" value={snapshot ? formatElapsed(elapsedMs) : "—"} tone="default" />
      <Vital
        label="Agents working"
        value={String(snapshot?.browserSessions.length ?? 0)}
        sub={browsersActive > 0 ? `${browsersActive} live` : "idle"}
        tone={browsersActive > 0 ? "live" : "default"}
      />
      <Vital
        label="Leads found"
        value={String(snapshot?.leads.length ?? 0)}
        sub={quotesIn > 0 ? `${quotesIn} quoted` : "searching"}
        tone="default"
      />
      <Vital
        label="Calls placed"
        value={String(snapshot?.calls.length ?? 0)}
        sub={callsOpen > 0 ? `${callsOpen} on line` : isLive ? "queued" : "—"}
        tone={callsOpen > 0 ? "live" : "default"}
      />
    </div>
  );
}

function Vital({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "live" | "default";
}) {
  return (
    <div className="relative flex flex-col gap-2 bg-[#0a0a0a] px-4 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
          {label}
        </span>
        {tone === "live" && <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />}
      </div>
      <div
        className="font-display text-[2.25rem] font-black leading-none tracking-tight tabular-nums sm:text-[2.75rem]"
        style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 30" }}
      >
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{sub}</div>
      )}
    </div>
  );
}

/* ─── AGENT SWITCHER ──────────────────────────────────────── */

function AgentSwitcher({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: BrowserSessionRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (!sessions.length) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-3 sm:px-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          Browser agents
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
          spinning up
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-px border-b border-white/8 bg-white/[0.06] overflow-x-auto">
      {sessions.map((session) => {
        const tone = sessionStatusTone(session.status);
        const active = session.id === selectedId;
        return (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelect(session.id)}
            className={[
              "group relative flex min-w-[220px] flex-col gap-1.5 px-4 py-3 text-left transition outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-haggle-500",
              active
                ? "bg-[#141414]"
                : "bg-[#0a0a0a] hover:bg-[#0f0f0f]",
            ].join(" ")}
          >
            {active && (
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-haggle-500" />
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${tone.dot} ${tone.pulse ? "animate-ping-dot" : ""}`}
                />
                <span
                  className={`truncate text-[13px] font-medium ${active ? "text-white" : "text-white/72"}`}
                >
                  {session.label || `Agent ${session.id}`}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35 tabular-nums">
                step {session.step_count}
              </span>
            </div>
            <div className="line-clamp-1 text-[11px] leading-relaxed text-white/45">
              {session.error ?? session.last_step_summary ?? session.phase ?? "waiting"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── PREVIEW STAGE ───────────────────────────────────────── */

function PreviewStage({
  session,
  liveUrl,
  loading,
  isLive,
}: {
  session: BrowserSessionRow | null;
  liveUrl: string | null;
  loading: boolean;
  isLive: boolean;
}) {
  return (
    <div className="relative flex min-h-[58vh] flex-1 flex-col bg-black">
      {/* Chrome bar — minimal, fake browser strip */}
      <div className="flex items-center gap-3 border-b border-white/8 bg-[#0a0a0a] px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white/[0.05] px-3 py-1 ring-1 ring-inset ring-white/8">
          {isLive && (
            <span className="size-1.5 shrink-0 animate-ping-dot rounded-full bg-haggle-500" />
          )}
          <span className="truncate font-mono text-[11px] tracking-wide text-white/55">
            {session?.phase
              ? `browser-use://${session.phase}`
              : "browser-use://standby"}
          </span>
        </div>
        {session && (
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 sm:block tabular-nums">
            session #{session.id}
          </span>
        )}
      </div>

      {/* Viewport */}
      <div className="relative flex-1 bg-black">
        {liveUrl ? (
          <>
            <iframe
              key={liveUrl}
              title="Browser Use live preview"
              src={liveUrl}
              allow="autoplay"
              className="absolute inset-0 h-full w-full animate-fade-in border-0"
            />
            {/* Subtle vignette — keeps eye on action */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]"
            />
          </>
        ) : (
          <EmptyPreview loading={loading} hasSession={!!session} />
        )}
      </div>

      {/* Bottom strip — session pulse */}
      {session && (
        <div className="flex items-center justify-between gap-4 border-t border-white/8 bg-[#0a0a0a] px-4 py-2.5 sm:px-6">
          <div className="min-w-0 truncate text-[12px] text-white/55 text-pretty">
            {session.last_step_summary ?? "Awaiting next step…"}
          </div>
          <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 tabular-nums">
            {session.step_count} steps
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyPreview({ loading, hasSession }: { loading: boolean; hasSession: boolean }) {
  return (
    <div className="flex h-full min-h-[58vh] items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <div className="relative mx-auto mb-6 flex size-16 items-center justify-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-haggle-500/40" />
          <span className="absolute inset-2 rounded-full bg-haggle-500/10 ring-1 ring-inset ring-haggle-500/30" />
          <span className="relative size-2 animate-ping-dot rounded-full bg-haggle-500" />
        </div>
        <h2
          className="font-display text-2xl font-black tracking-tight text-balance"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
        >
          {loading
            ? "Opening live desk"
            : hasSession
            ? "Browser warming up"
            : "Waiting for the first agent"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/45 text-pretty">
          {hasSession
            ? "The live preview appears as soon as Browser Use returns a URL for this session."
            : "Agents are negotiating their way to the right provider. Their browsers will stream here in real time."}
        </p>
      </div>
    </div>
  );
}

/* ─── ACTIVITY TIMELINE ───────────────────────────────────── */

function ActivityTimeline({ feed, now }: { feed: FeedItem[]; now: number }) {
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const item of feed) seenRef.current.add(item.id);
  }, [feed]);

  return (
    <section className="flex max-h-[40vh] min-h-[260px] flex-col border-t border-white/8 xl:max-h-[36vh]">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5 sm:px-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          Activity stream
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 tabular-nums">
          {feed.length} events
        </div>
      </div>
      <div className="chat-scroll relative flex-1 overflow-y-auto">
        {feed.length === 0 ? (
          <EmptyLine text="Events will appear here as agents work." />
        ) : (
          <ol role="list" className="divide-y divide-white/[0.04]">
            {feed.map((item) => {
              const isNew = !seenRef.current.has(item.id);
              return (
                <li
                  key={item.id}
                  className={`grid grid-cols-[80px_minmax(0,1fr)] gap-3 px-4 py-3 sm:px-6 ${isNew ? "animate-fade-in" : ""}`}
                >
                  <div className="pt-px font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 tabular-nums">
                    {formatRelative(item.createdAt, now)}
                  </div>
                  <div className="min-w-0">
                    <div className={`font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${toneClasses(item.tone)}`}>
                      {item.kind}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/75 text-pretty">
                      {item.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/* ─── BEST QUOTE ──────────────────────────────────────────── */

function BestQuoteCard({
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
    <section className="relative bg-[#0a0a0a] px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          Best quote
        </div>
        {agreed && (
          <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
            Agreed
          </span>
        )}
        {!agreed && hasQuote && (
          <span className="rounded-full bg-haggle-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haggle-400 ring-1 ring-inset ring-haggle-500/30">
            Live
          </span>
        )}
      </div>

      {hasQuote ? (
        <>
          <div className="mt-3 flex items-baseline gap-3">
            <div
              className="font-display text-[3.25rem] font-black leading-none tracking-tight tabular-nums"
              style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 30" }}
            >
              {formatMoney(bestLead.quoted_price_cents)}
            </div>
            {budgetCents !== null && (
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/35 tabular-nums">
                / {formatMoney(budgetCents)} budget
              </div>
            )}
          </div>
          <div className="mt-3 truncate text-[15px] font-medium text-white/85">
            {bestLead.name}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-white/45">
            <span>
              {bestLead.rating ? `${bestLead.rating.toFixed(1)} stars` : "Unrated"}
            </span>
            <span className="text-white/15">·</span>
            <span className="truncate font-mono text-[11px]">{leadContact(bestLead)}</span>
          </div>
          {savings !== null && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-1.5 ring-1 ring-inset ring-emerald-400/25">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-300 tabular-nums">
                Saving {formatMoney(savings)}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          <div
            className="font-display text-[3rem] font-black leading-none tracking-tight text-white/25 tabular-nums"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 30" }}
          >
            —
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/45 text-pretty">
            {isTerminal
              ? "No quotes landed before this job ended."
              : "Listening for the first quote. Agents are dialing now."}
          </p>
        </div>
      )}
    </section>
  );
}

/* ─── LEAD PIPELINE ───────────────────────────────────────── */

function LeadPipeline({
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

  return (
    <section className="bg-[#0a0a0a] px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          Pipeline
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 tabular-nums">
          {leads.length} leads
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-3">
          <EmptyLine text="Lead search has not returned results yet." />
        </div>
      ) : (
        <ol role="list" className="mt-3 space-y-1.5">
          {sorted.slice(0, 8).map((lead) => {
            const tone = leadStatusTone(lead.status);
            const isBest = lead.id === bestLeadId;
            return (
              <li
                key={lead.id}
                className={[
                  "group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 ring-1 ring-inset transition",
                  isBest
                    ? "bg-haggle-500/8 ring-haggle-500/30"
                    : "bg-white/[0.025] ring-white/8 hover:bg-white/[0.04]",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
                    <span className="truncate text-[13px] font-medium text-white/85">
                      {lead.name}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-white/45">
                    <span className={`font-mono uppercase tracking-[0.12em] ${tone.text}`}>
                      {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                    </span>
                    {lead.rating !== null && (
                      <>
                        <span className="text-white/15">·</span>
                        <span className="tabular-nums">{lead.rating.toFixed(1)}★</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[13px] font-medium text-white/85 tabular-nums">
                    {formatMoney(lead.quoted_price_cents)}
                  </div>
                  {lead.quoted_price_cents === null && (
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
                      no quote
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ─── CALL STRIP ──────────────────────────────────────────── */

function CallStrip({
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

  const liveCalls = calls.filter((c) => c.ended_at === null).slice(0, 3);

  if (liveCalls.length === 0) return null;

  return (
    <section className="bg-[#0a0a0a] px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-haggle-400">
            On the line
          </span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 tabular-nums">
          {liveCalls.length} live
        </div>
      </div>
      <ol role="list" className="mt-3 space-y-1.5">
        {liveCalls.map((call) => {
          const lead = leadById.get(call.lead_id);
          const duration = formatElapsed(now - call.created_at);
          return (
            <li
              key={call.id}
              className="relative overflow-hidden rounded-md bg-haggle-500/8 px-3 py-2.5 ring-1 ring-inset ring-haggle-500/25"
            >
              <span className="absolute left-0 top-0 h-full w-px bg-haggle-500/60" />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-white/85">
                    {lead?.name ?? `Lead #${call.lead_id}`}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-white/45">
                    {lead?.phone ?? call.agentphone_call_id ?? "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[13px] text-white/85 tabular-nums">
                    {duration}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-haggle-400">
                    talking
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ─── MESSAGE STREAM ──────────────────────────────────────── */

function MessageStream({ messages }: { messages: MessageRow[] }) {
  const recent = useMemo(
    () => [...messages].sort((a, b) => b.created_at - a.created_at).slice(0, 6),
    [messages]
  );

  return (
    <section className="bg-[#0a0a0a] px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          Concierge log
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 tabular-nums">
          {messages.length}
        </div>
      </div>

      {recent.length === 0 ? (
        <div className="mt-3">
          <EmptyLine text="Messages between you and the concierge land here." />
        </div>
      ) : (
        <ol role="list" className="mt-3 space-y-2.5">
          {recent.map((m) => {
            const outbound = m.direction === "outbound";
            return (
              <li
                key={m.id}
                className={[
                  "rounded-md px-3 py-2 ring-1 ring-inset",
                  outbound
                    ? "bg-white/[0.04] ring-white/8"
                    : "bg-haggle-500/8 ring-haggle-500/20",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-white/40">
                    {outbound ? "Haggle" : "You"} · {m.channel}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 tabular-nums">
                    {formatTime(m.created_at)}
                  </div>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/80 text-pretty">
                  {m.body}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ─── SHARED ──────────────────────────────────────────────── */

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/8 px-3 py-4 text-[13px] text-white/35 text-pretty">
      {text}
    </div>
  );
}
