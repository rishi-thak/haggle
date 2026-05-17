"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD (interface-craft)
 *
 *    0ms   mounted; stage 0 — empty canvas
 *   80ms   stage 1 — H stamp drops in with overshoot, settles at +6° tilt
 *  280ms   stage 2 — "HAGGLE" wordmark rises + fades
 *  460ms   stage 3 — eyebrow + paragraph fade in
 *  620ms   stage 4 — phone form fades in
 *  820ms   stage 5 — marquee turns on, ticker begins crawl
 * 1000ms   stage 6 — iMessage thread cascades in (260ms stagger per bubble)
 *
 * Each stage gates the next via setTimeout. Tailwind animations defined in
 * tailwind.config.ts; CSS keyframes live there too.
 * ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import Image from "next/image";

const TIMING = {
  stamp: 80,
  wordmark: 280,
  copy: 460,
  form: 620,
  marquee: 820,
  thread: 1000,
  bubbleStagger: 260,
};

const TICKER = [
  "CAR DETAIL · SF · $85",
  "DOG GROOMER · OAK · $45",
  "LOCKSMITH · MISSION · $120",
  "MOVER · 2BR · $310",
  "DEEP CLEAN · 1500FT · $180",
  "ELECTRICIAN · 1HR · $90",
  "HAIRCUT · HOUSE CALL · $60",
  "BIKE TUNE-UP · $40",
];

type Bubble = { role: "me" | "them"; text: string; meta?: string };

const SAMPLE_THREAD: Bubble[] = [
  { role: "me", text: "get my car detailed in SF for under $100", meta: "Sat 9:42" },
  { role: "them", text: "Got it. Searching now." },
  { role: "them", text: "Found 7 detailers nearby. Calling the top 4." },
  { role: "them", text: "Sparkle Detail SF said yes — $85 for Sat 11am at your spot." },
  { role: "me", text: "pay them", meta: "Sat 9:51" },
  { role: "them", text: "Done. $85 USDC sent. Booking confirmed for 11am." },
];

export default function Home() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), TIMING.stamp),
      setTimeout(() => setStage(2), TIMING.wordmark),
      setTimeout(() => setStage(3), TIMING.copy),
      setTimeout(() => setStage(4), TIMING.form),
      setTimeout(() => setStage(5), TIMING.marquee),
      setTimeout(() => setStage(6), TIMING.thread),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-ink-900 text-bone-50">
      {/* glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-haggle-500/20 blur-[140px]"
      />

      <TopNav />

      <Hero stage={stage} />

      <Ticker active={stage >= 5} />

      <Demo stage={stage} />

      <Footer />
    </main>
  );
}

/* ─── top nav ────────────────────────────────────────────────────────────── */

function TopNav() {
  return (
    <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 pt-6 sm:pt-8">
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl font-bold tracking-tight text-bone-50">
          haggle
        </span>
        <span className="rounded-full bg-haggle-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-haggle-400">
          beta
        </span>
      </div>
      <div className="hidden items-center gap-6 text-sm text-bone-50/60 sm:flex">
        <a href="#how" className="hover:text-bone-50 transition">How it works</a>
        <a href="https://github.com/" target="_blank" rel="noreferrer" className="hover:text-bone-50 transition">
          GitHub
        </a>
      </div>
    </div>
  );
}

/* ─── hero ───────────────────────────────────────────────────────────────── */

function Hero({ stage }: { stage: number }) {
  return (
    <section className="relative z-10 mx-auto flex max-w-6xl flex-col items-start px-6 pb-16 pt-20 sm:pt-28">
      {/* H stamp — sits next to the headline on large screens, fades behind on small */}
      <div
        className={[
          "pointer-events-none absolute",
          // mobile: push to the top-right corner, smaller, behind copy
          "-right-6 top-12 opacity-30",
          // tablet: bigger, still corner
          "sm:right-2 sm:top-14 sm:opacity-50",
          // desktop: full presence, alongside headline
          "lg:right-8 lg:top-16 lg:opacity-100",
          "xl:right-16",
        ].join(" ")}
      >
        {stage >= 1 && (
          <div className="animate-stamp-drop">
            <div
              className="relative"
              style={{ filter: "drop-shadow(0 24px 40px rgba(255,45,45,0.25))" }}
            >
              <Image
                src="/Haggle2.png"
                alt=""
                width={260}
                height={260}
                priority
                className="h-36 w-36 sm:h-52 sm:w-52 lg:h-72 lg:w-72"
              />
            </div>
          </div>
        )}
      </div>

      {/* eyebrow */}
      <div
        className={[
          "flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-bone-50/60",
          stage >= 3 ? "animate-fade" : "opacity-0",
        ].join(" ")}
      >
        <span className="size-1.5 animate-pulse-dot rounded-full bg-haggle-500" />
        iMessage-native concierge
      </div>

      {/* wordmark */}
      <h1
        className={[
          "relative mt-4 font-display text-[clamp(3rem,11vw,9rem)] font-black leading-[0.88] tracking-tight text-bone-50",
          stage >= 2 ? "animate-rise" : "opacity-0",
        ].join(" ")}
        style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
      >
        We call.
        <br />
        We <em className="not-italic text-haggle-500">haggle</em>.
        <br />
        You save.
      </h1>

      {/* paragraph */}
      <p
        className={[
          "mt-6 max-w-xl text-[17px] leading-relaxed text-bone-50/70",
          stage >= 3 ? "animate-fade" : "opacity-0",
        ].join(" ")}
      >
        Text one number with what you need — car detail, locksmith, mover, dog
        groomer. We research locals, place parallel calls, negotiate the price
        against your budget, and book it. You stay in iMessage.
      </p>

      {/* form */}
      <div className={["mt-10 w-full max-w-md", stage >= 4 ? "animate-fade" : "opacity-0"].join(" ")}>
        <OnboardForm />
      </div>
    </section>
  );
}

/* ─── ticker / marquee ───────────────────────────────────────────────────── */

function Ticker({ active }: { active: boolean }) {
  // Duplicate the list so the loop is seamless.
  const items = [...TICKER, ...TICKER];
  return (
    <div
      className={[
        "relative z-10 -mt-2 border-y border-haggle-700/40 bg-haggle-500 text-ink-900",
        "overflow-hidden",
        active ? "animate-fade" : "opacity-0",
      ].join(" ")}
    >
      <div className="flex w-[200%] animate-marquee whitespace-nowrap py-3 font-mono text-[12px] font-bold uppercase tracking-widest">
        {items.map((t, i) => (
          <span key={i} className="mx-6 flex items-center gap-6">
            {t}
            <span className="text-ink-900/60">●</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── demo / iMessage thread ─────────────────────────────────────────────── */

function Demo({ stage }: { stage: number }) {
  return (
    <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-haggle-500">
            Here&apos;s a real flow
          </div>
          <h2 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight text-bone-50 sm:text-5xl">
            One thread. <br /> Start to finish.
          </h2>
          <p className="mt-5 max-w-md text-bone-50/65">
            Every status — searching, calling, negotiated, paid — lands as a
            text. No app. No portal. No back-and-forth scheduling.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              ["01", "You text what you want and a budget."],
              ["02", "Browser Use scrapes 5–10 local options."],
              ["03", "Agentphone places parallel calls. Gemini negotiates live."],
              ["04", "Supermemory injects context from prior providers."],
              ["05", "Agentmail covers leads without a phone."],
              ["06", "You reply \"pay them\" — Sponge ships USDC instantly."],
            ].map(([n, t]) => (
              <li key={n} className="flex items-start gap-4">
                <span className="font-mono text-xs text-haggle-500">{n}</span>
                <span className="text-bone-50/80">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <Thread stage={stage} />
      </div>
    </section>
  );
}

function Thread({ stage }: { stage: number }) {
  // gate each bubble after stage 6 lands; stagger via inline delay
  const ready = stage >= 6;
  return (
    <div className="relative">
      {/* device frame */}
      <div className="relative mx-auto w-full max-w-[420px] rounded-[36px] border border-bone-50/10 bg-ink-800/70 p-3 shadow-2xl backdrop-blur">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-950">
          {/* header */}
          <div className="flex flex-col items-center border-b border-bone-50/5 px-5 py-4">
            <div className="size-10 rounded-full bg-haggle-500 flex items-center justify-center font-display text-xl font-black text-ink-900">
              H
            </div>
            <div className="mt-2 text-[13px] font-medium text-bone-50">Haggle</div>
            <div className="text-[11px] text-bone-50/40">+1 (415) 555-0100 · iMessage</div>
          </div>

          {/* bubbles */}
          <div className="flex flex-col gap-2 px-4 pb-6 pt-4">
            {SAMPLE_THREAD.map((b, i) => (
              <div
                key={i}
                className={[
                  "flex flex-col",
                  b.role === "me" ? "items-end" : "items-start",
                  ready ? "animate-bubble-in" : "opacity-0",
                ].join(" ")}
                style={{ animationDelay: ready ? `${i * TIMING.bubbleStagger}ms` : "0ms" }}
              >
                {b.meta && (
                  <span className="mb-1 text-[10px] uppercase tracking-widest text-bone-50/30">
                    {b.meta}
                  </span>
                )}
                <div
                  className={[
                    "max-w-[78%] px-4 py-2.5 text-[14.5px] leading-snug",
                    b.role === "me"
                      ? "bubble-me bg-[#2C7BF2] text-white"
                      : "bubble-them bg-ink-700 text-bone-50",
                  ].join(" ")}
                >
                  {b.text}
                </div>
              </div>
            ))}
            {/* typing indicator */}
            {ready && (
              <div
                className="flex animate-bubble-in items-center gap-1"
                style={{ animationDelay: `${SAMPLE_THREAD.length * TIMING.bubbleStagger}ms` }}
              >
                <span className="bubble-them flex items-center gap-1 bg-ink-700 px-3 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-pulse-dot rounded-full bg-bone-50/50"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* sticker accent */}
      <div className="pointer-events-none absolute -bottom-6 -right-4 rotate-[-8deg]">
        <span className="inline-block rounded-md bg-haggle-500 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-900">
          live demo
        </span>
      </div>
    </div>
  );
}

/* ─── footer ─────────────────────────────────────────────────────────────── */

function Footer() {
  const sponsors = ["Agentphone", "Browser Use", "Supermemory", "Agentmail", "Sponge", "Gemini"];
  return (
    <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
      <div className="hairline mb-8" />
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="text-xs text-bone-50/40">
          © {new Date().getFullYear()} Haggle Concierge. Built in a weekend.
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-widest text-bone-50/40">
          {sponsors.map((s, i) => (
            <span key={s} className="flex items-center gap-5">
              {s}
              {i < sponsors.length - 1 && <span className="text-bone-50/15">·</span>}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

/* ─── form ───────────────────────────────────────────────────────────────── */

function OnboardForm() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ iMessageNumber?: string | null; instructions?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "failed");
      setResult({ iMessageNumber: json.iMessageNumber, instructions: json.instructions });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-haggle-500/30 bg-ink-800/60 p-6 backdrop-blur">
        <div className="absolute inset-x-0 top-0 h-1 bg-haggle-500" />
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-haggle-500">
          You&apos;re in
        </div>
        {result.iMessageNumber ? (
          <>
            <p className="mt-2 font-display text-4xl font-bold tracking-tight text-bone-50">
              {result.iMessageNumber}
            </p>
            <p className="mt-3 text-sm text-bone-50/70">
              Text it with what you need. Try:{" "}
              <span className="font-mono text-haggle-400">
                &ldquo;detail my car in SF under $100&rdquo;
              </span>
            </p>
          </>
        ) : (
          <p className="mt-3 text-amber-300 text-sm">{result.instructions}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="relative">
        <label
          htmlFor="phone"
          className="absolute left-4 top-2 text-[10px] font-medium uppercase tracking-widest text-bone-50/40"
        >
          Your number
        </label>
        <input
          id="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="+1 415 555 0100"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="block w-full rounded-2xl border border-bone-50/10 bg-ink-800/60 px-4 pb-3 pt-7 font-mono text-base text-bone-50 outline-none transition placeholder:text-bone-50/25 focus:border-haggle-500/60 focus:bg-ink-800"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className={[
          "group relative w-full overflow-hidden rounded-2xl bg-haggle-500 py-4 font-display text-base font-bold uppercase tracking-widest text-ink-900",
          "transition hover:bg-haggle-400 disabled:opacity-60",
          "shadow-[0_18px_40px_-12px_rgba(255,45,45,0.45)]",
        ].join(" ")}
      >
        <span className="relative z-10">
          {loading ? "Setting up…" : "Get my iMessage number →"}
        </span>
      </button>
      {err && <p className="text-sm text-haggle-400">{err}</p>}
      <p className="pt-2 text-[11px] text-bone-50/40">
        You&apos;ll receive automated SMS/iMessage updates. Standard rates apply.
      </p>
    </form>
  );
}
