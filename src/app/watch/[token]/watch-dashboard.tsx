"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Lead, MessageRow, WatchSnapshot } from "@/lib/types";
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
};

const JOB_STATUS_LABELS: Record<string, string> = {
  new: "New",
  searching: "Searching",
  ranked: "Ranked",
  calling: "Calling",
  negotiating: "Negotiating",
  awaiting_callback: "Awaiting callback",
  email_fallback: "Email fallback",
  awaiting_confirm: "Awaiting confirm",
  paying: "Paying",
  complete: "Complete",
  failed: "Failed",
};

const ACTIVE_STATUSES = new Set(["created", "running", "searching", "calling", "negotiating"]);

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatMoney(cents: number | null): string {
  if (cents === null) return "-";
  return `$${(cents / 100).toFixed(0)}`;
}

function statusTone(status: string): string {
  if (["complete", "agreed", "stopped", "idle"].includes(status)) return "bg-emerald-600";
  if (["failed", "declined", "error", "timed_out"].includes(status)) return "bg-haggle-500";
  if (ACTIVE_STATUSES.has(status)) return "bg-blue-600";
  return "bg-ink-300";
}

function statusLabel(status: string): string {
  return JOB_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function leadContact(lead: Lead): string {
  return lead.phone ?? lead.email ?? "No contact";
}

function useWatchSnapshot(token: string): ApiState {
  const [state, setState] = useState<ApiState>({ status: "loading", snapshot: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/watch/${encodeURIComponent(token)}`, { cache: "no-store" });
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load watch snapshot");
        if (!cancelled) {
          setState({ status: "ready", snapshot: json.snapshot as WatchSnapshot, error: null });
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
  }));
  const messages = snapshot.messages.map((message: MessageRow) => ({
    id: `message-${message.id}`,
    kind: message.channel,
    text: message.body,
    createdAt: message.created_at,
  }));
  return [...browser, ...messages].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80);
}

export default function WatchDashboard({ token }: { token: string }) {
  const state = useWatchSnapshot(token);
  const snapshot = state.snapshot;
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  useEffect(() => {
    if (!snapshot?.browserSessions.length) return;
    setSelectedSessionId((current) => {
      if (current && snapshot.browserSessions.some((session) => session.id === current)) return current;
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

  return (
    <main className="min-h-screen bg-[#111111] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col">
        <header className="border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-haggle-400">
                Haggle live desk
              </div>
              <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">
                {snapshot?.job.service ?? "Waiting for request"}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/58">
                <span>{snapshot?.job.location ?? "Location pending"}</span>
                <span>Budget {formatMoney(snapshot?.job.budget_cents ?? null)}</span>
                <span>{snapshot?.job.timeframe ?? "Timing pending"}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill label={statusLabel(snapshot?.job.status ?? "loading")} status={snapshot?.job.status ?? ""} />
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/42">
                {state.status === "error" ? state.error : "Auto-refreshing"}
              </div>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-h-[54vh] border-b border-white/10 lg:border-b-0 lg:border-r">
            <div className="flex h-full min-h-[54vh] flex-col">
              <div className="flex min-h-14 items-center justify-between border-b border-white/10 px-4 sm:px-6">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {selectedSession?.label ?? "Browser preview"}
                  </div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/42">
                    {selectedSession?.last_step_summary ?? "Waiting for Browser Use to open a session"}
                  </div>
                </div>
                {selectedSession && (
                  <StatusPill label={selectedSession.status} status={selectedSession.status} />
                )}
              </div>

              <div className="relative flex-1 bg-black">
                {liveUrl ? (
                  <iframe
                    title="Browser Use live preview"
                    src={liveUrl}
                    allow="autoplay"
                    className="h-full min-h-[54vh] w-full border-0"
                  />
                ) : (
                  <EmptyPreview loading={state.status === "loading"} />
                )}
              </div>
            </div>
          </section>

          <aside className="min-h-0 bg-[#171717]">
            <div className="grid grid-cols-1 border-b border-white/10 sm:grid-cols-3 lg:grid-cols-1">
              <Metric label="Browsers" value={String(snapshot?.browserSessions.length ?? 0)} />
              <Metric label="Leads" value={String(snapshot?.leads.length ?? 0)} />
              <Metric label="Calls" value={String(snapshot?.calls.length ?? 0)} />
            </div>

            <Panel title="Browser agents">
              <div className="space-y-2">
                {(snapshot?.browserSessions ?? []).map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={[
                      "w-full rounded-md border px-3 py-3 text-left transition",
                      selectedSession?.id === session.id
                        ? "border-haggle-500 bg-haggle-500/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/24",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{session.label}</span>
                      <StatusDot status={session.status} />
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/50">
                      {session.error ?? session.last_step_summary ?? `Step ${session.step_count}`}
                    </div>
                  </button>
                ))}
                {!snapshot?.browserSessions.length && <EmptyLine text="No browser sessions yet." />}
              </div>
            </Panel>

            <Panel title="Call queue">
              <div className="space-y-2">
                {(snapshot?.leads ?? []).slice(0, 8).map((lead) => (
                  <div key={lead.id} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{lead.name}</div>
                        <div className="mt-1 truncate font-mono text-[11px] text-white/42">
                          {leadContact(lead)}
                        </div>
                      </div>
                      <StatusPill label={lead.status} status={lead.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-white/48">
                      <span>{lead.rating ? `${lead.rating.toFixed(1)} stars` : "No rating"}</span>
                      <span>{formatMoney(lead.quoted_price_cents)}</span>
                    </div>
                  </div>
                ))}
                {!snapshot?.leads.length && <EmptyLine text="Lead search has not returned results yet." />}
              </div>
            </Panel>

            <Panel title="Activity">
              <div className="space-y-3">
                {feed.map((item) => (
                  <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 text-xs">
                    <div className="font-mono uppercase tracking-[0.08em] text-white/32">
                      {formatTime(item.createdAt)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono uppercase tracking-[0.1em] text-haggle-400/80">
                        {item.kind}
                      </div>
                      <div className="mt-1 leading-relaxed text-white/66">{item.text}</div>
                    </div>
                  </div>
                ))}
                {!feed.length && <EmptyLine text="Events will appear here as agents work." />}
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </main>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className={`size-2 shrink-0 rounded-full ${statusTone(status)}`} />;
}

function StatusPill({ label, status }: { label: string; status: string }) {
  return (
    <span className="inline-flex max-w-[180px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70">
      <StatusDot status={status} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-white/10 px-4 py-4 last:border-r-0 lg:border-b lg:border-r-0 lg:last:border-b-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">{label}</div>
      <div className="mt-1 font-display text-3xl font-black">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/10 p-4">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/38">{title}</h2>
      {children}
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-white/38">{text}</div>;
}

function EmptyPreview({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full min-h-[54vh] items-center justify-center px-6 text-center">
      <div>
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-white/12">
          <span className="size-2 animate-ping-dot rounded-full bg-haggle-500" />
        </div>
        <div className="font-display text-2xl font-black">
          {loading ? "Opening live desk" : "Waiting for Browser Use"}
        </div>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/45">
          The preview iframe appears as soon as Browser Use returns a live URL for this job.
        </p>
      </div>
    </div>
  );
}
