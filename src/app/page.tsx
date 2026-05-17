"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * Haggle landing — white + black + red.
 *
 * One job: get the visitor to drop a phone number. Everything else is in
 * service of that decision. Layout follows cursor.com's restraint:
 *   - minimal nav
 *   - massive headline
 *   - one input + one button
 *   - a thread mockup as proof
 *   - a short three-step row
 *   - footer
 *
 * Motion is implemented with `motion/react` springs (no easing curves).
 * No boxes, no bordered grids, no glow blurs.
 * ───────────────────────────────────────────────────────── */

import { useState } from "react";
import Image from "next/image";
import { motion, type Variants } from "motion/react";

const SPRING = { type: "spring" as const, stiffness: 260, damping: 28 };

const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: SPRING },
};

const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
};

const stagger = (gap = 0.07): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: 0.05 } },
});

type Bubble = { role: "me" | "them"; text: string; meta?: string };
const THREAD: Bubble[] = [
  { role: "me", text: "get my car detailed in SF for under $100", meta: "Sat 9:42 AM" },
  { role: "them", text: "Got it. Searching now." },
  { role: "them", text: "Found 7 detailers nearby. Calling the top 4 in parallel." },
  { role: "them", text: "Sparkle Detail SF said yes — $85 for Sat 11am at your spot." },
  { role: "me", text: "pay them", meta: "Sat 9:51 AM" },
  { role: "them", text: "Done. $85 USDC sent. Booking confirmed for 11 AM." },
];

export default function Home() {
  return (
    <main className="relative min-h-screen bg-paper text-ink-900">
      <Nav />
      <Hero />
      <ThreadProof />
      <Steps />
      <Footer />
    </main>
  );
}

/* ─── nav ───────────────────────────────────────────────── */

function Nav() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="relative z-10"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="#" className="flex items-center gap-2.5">
          <div className="relative size-7 overflow-hidden">
            <Image src="/Haggle2.png" alt="" fill className="object-contain" />
          </div>
          <span className="font-display text-[19px] font-bold tracking-tight">haggle</span>
        </a>
        <div className="hidden items-center gap-7 text-[14px] text-ink-500 sm:flex">
          <a href="#thread" className="transition hover:text-ink-900">How it works</a>
          <a href="#faq" className="transition hover:text-ink-900">FAQ</a>
          <a href="https://github.com/" target="_blank" rel="noreferrer" className="transition hover:text-ink-900">
            GitHub
          </a>
        </div>
      </div>
    </motion.nav>
  );
}

/* ─── hero ──────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative">
      <motion.div
        variants={stagger(0.08)}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-12 text-center sm:pt-28"
      >
        <motion.div
          variants={rise}
          className="inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1 text-[12px] font-medium text-ink-500"
        >
          <span className="size-1.5 animate-ping-dot rounded-full bg-haggle-500" />
          iMessage-native concierge
        </motion.div>

        <motion.h1
          variants={rise}
          className="mt-7 font-display text-[clamp(2.75rem,7vw,5.5rem)] font-black leading-[0.98] tracking-[-0.02em]"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 50" }}
        >
          We call. We <span className="text-haggle-500">haggle</span>.
          <br className="hidden sm:block" /> You save.
        </motion.h1>

        <motion.p
          variants={rise}
          className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-500"
        >
          Text one number for any local service — car detail, locksmith, mover,
          dog groomer. We dial providers in parallel, negotiate against your
          budget, and book it. You never leave iMessage.
        </motion.p>

        <motion.div variants={rise} className="mt-10 w-full max-w-md">
          <OnboardForm />
        </motion.div>

        <motion.p
          variants={fade}
          className="mt-4 text-[12px] text-ink-400"
        >
          Free to start. No credit card. Cancel anytime by saying so.
        </motion.p>
      </motion.div>
    </section>
  );
}

/* ─── form ──────────────────────────────────────────────── */

function OnboardForm() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ iMessageNumber?: string | null; instructions?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
        className="text-left"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-haggle-500">
          You&apos;re in · text this number
        </div>
        <p className="mt-2 font-display text-4xl font-black tracking-tight text-ink-900">
          {result.iMessageNumber ?? "—"}
        </p>
        <p className="mt-3 text-[14px] text-ink-500">
          Try:{" "}
          <span className="font-mono text-haggle-600">
            &ldquo;detail my car in SF under $100&rdquo;
          </span>
        </p>
        {!result.iMessageNumber && result.instructions && (
          <p className="mt-3 text-[13px] text-amber-700">{result.instructions}</p>
        )}
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative">
      <div className="group relative flex items-center gap-2 rounded-2xl border border-ink-200 bg-white p-1.5 transition focus-within:border-ink-900 focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <span className="pl-3 pr-1 font-mono text-[15px] text-ink-300">+1</span>
        <input
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          placeholder="415 555 0100"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[16px] text-ink-900 outline-none placeholder:text-ink-300"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-ink-900 px-5 py-3 text-[14px] font-medium text-white transition hover:bg-haggle-500 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? "…" : "Get number"}
          <span aria-hidden>→</span>
        </button>
      </div>
      {err && <p className="mt-3 text-[12px] text-haggle-600">{err}</p>}
    </form>
  );
}

/* ─── thread proof ──────────────────────────────────────── */

function ThreadProof() {
  return (
    <section id="thread" className="relative">
      <div className="mx-auto max-w-md px-6 pb-24">
        <motion.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="space-y-2"
        >
          {/* header */}
          <motion.div
            variants={rise}
            className="mb-6 flex flex-col items-center gap-1.5 text-center"
          >
            <div className="relative flex size-11 items-center justify-center overflow-hidden rounded-full bg-haggle-500">
              <span className="font-display text-xl font-black text-white">H</span>
            </div>
            <div className="text-[13px] font-medium text-ink-900">Haggle</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              +1 415 555 0100 · iMessage
            </div>
          </motion.div>

          {THREAD.map((b, i) => (
            <motion.div
              key={i}
              variants={rise}
              className={`flex flex-col ${b.role === "me" ? "items-end" : "items-start"}`}
            >
              {b.meta && (
                <span className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
                  {b.meta}
                </span>
              )}
              <div
                className={[
                  "max-w-[82%] px-4 py-2.5 text-[15px] leading-snug",
                  b.role === "me"
                    ? "bubble-me bg-[#2C7BF2] text-white"
                    : "bubble-them bg-ink-50 text-ink-900",
                ].join(" ")}
              >
                {b.text}
              </div>
            </motion.div>
          ))}

          <motion.div variants={rise} className="flex items-center">
            <span className="bubble-them flex items-center gap-1 bg-ink-50 px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-ping-dot rounded-full bg-ink-300"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── three-step row (no cards) ─────────────────────────── */

function Steps() {
  const items = [
    { k: "Search", v: "Browser Use crawls Maps and directories for nearby providers." },
    { k: "Haggle", v: "Agentphone dials up to four in parallel. Gemini negotiates live, against your budget." },
    { k: "Pay", v: "Reply \"pay them.\" Sponge ships USDC to the winning provider on Base." },
  ];
  return (
    <section id="faq" className="relative border-t border-ink-100 bg-white">
      <motion.div
        variants={stagger(0.07)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mx-auto max-w-5xl px-6 py-20"
      >
        <motion.div variants={rise} className="font-mono text-[11px] uppercase tracking-[0.18em] text-haggle-500">
          · How it works
        </motion.div>
        <motion.h2 variants={rise} className="mt-3 max-w-2xl font-display text-3xl font-black leading-tight tracking-tight sm:text-4xl">
          One thread, start to finish.
        </motion.h2>

        <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-3">
          {items.map((it, i) => (
            <motion.div key={it.k} variants={rise} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] font-bold text-haggle-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-xl font-bold tracking-tight">{it.k}</span>
              </div>
              <p className="text-[15px] leading-relaxed text-ink-500">{it.v}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ─── footer ────────────────────────────────────────────── */

function Footer() {
  const sponsors = ["Agentphone", "Browser Use", "Supermemory", "Agentmail", "Sponge", "Gemini"];
  return (
    <footer className="border-t border-ink-100">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="relative size-6 overflow-hidden">
            <Image src="/Haggle2.png" alt="" fill className="object-contain" />
          </div>
          <span className="font-display text-base font-bold">haggle</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
            © {new Date().getFullYear()}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
          {sponsors.map((s, i) => (
            <span key={s} className="flex items-center gap-4">
              {s}
              {i < sponsors.length - 1 && <span className="text-ink-200">·</span>}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
