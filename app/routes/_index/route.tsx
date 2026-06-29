import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "ShopHero — Get your Shopify store recommended by ChatGPT" },
  {
    name: "description",
    content:
      "Shoppers are starting to ask ChatGPT, Claude & Perplexity what to buy. ShopHero makes your Shopify store fast, structured, and readable by AI shopping agents — so you're the one they recommend, not your competitor. Get your free AI-Readiness Score.",
  },
  { property: "og:title", content: "ShopHero — Be the Shopify store AI agents recommend" },
  {
    property: "og:description",
    content:
      "Make your Shopify store machine-readable for AI: structured data, a retrieval feed, and an llms.txt AI crawlers actually use. Free AI-Readiness Score in 30 seconds.",
  },
  { property: "og:type", content: "website" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

const BADGES = [
  { lines: ["AI-Readiness", "Score"], sub: "KNOW WHERE YOU STAND", c1: "#5fb024", c2: "#34e0a1" },
  { lines: ["llms.txt +", "Product Feed"], sub: "BUILT FOR AI CRAWLERS", c1: "#7b6cf6", c2: "#9d7bff" },
  { lines: ["Auto", "Schema"], sub: "RICH RESULTS ON EVERY PDP", c1: "#1ca7c4", c2: "#34e0a1" },
  { lines: ["AI-Crawler", "Analytics"], sub: "SEE WHO'S READING YOU", c1: "#e8941a", c2: "#ffce54" },
  { lines: ["Stays", "Live"], sub: "RE-OPTIMIZES AS YOU CHANGE", c1: "#e0457f", c2: "#f472b6" },
  { lines: ["Approval", "First"], sub: "YOU APPROVE EVERYTHING", c1: "#2f74e0", c2: "#60a5fa" },
  { lines: ["30-Second", "Setup"], sub: "INSTALL & GO", c1: "#cf6242", c2: "#f0a07c" },
];

const SCENARIOS = [
  {
    prompt: "Make my store readable by AI agents",
    thinking: ["Scanning your catalog & policies…", "Checking schema coverage…", "Building your retrieval feed…"],
    steps: ["Generated a hosted llms.txt for your shop", "Built an AI-retrieval product feed", "Added Product/Offer schema to 128 PDPs", "Rewrote descriptions in Q&A form for agents"],
    metric: "AI-Readiness: 41 → 92",
  },
  {
    prompt: "Why don't AI agents recommend me?",
    thinking: ["Testing how AI sees your store…", "Looking for llms.txt & a feed…", "Auditing structured data…"],
    steps: ["No llms.txt — agents can't read your shop", "Schema missing on 41 product pages", "Descriptions read as ads, not facts", "Ranked every gap by impact"],
    metric: "7 gaps blocking AI recommendations",
  },
  {
    prompt: "Add structured data to every product",
    thinking: ["Reading your product templates…", "Mapping price, stock & reviews…"],
    steps: ["Added Product, Offer & Review schema", "Added Breadcrumb & FAQ schema", "Validated against rich-result rules", "Kept it live as prices change"],
    metric: "128 PDPs now rich-result eligible",
  },
  {
    prompt: "Write 4 AI-answer buying guides",
    thinking: ["Studying your niche & top products…", "Shaping answers AI engines cite…"],
    steps: ["Drafted 4 answer-shaped guides", "Linked each to the right products", "Emitted Article & FAQ schema", "Staged them for your approval"],
    metric: "4 guides AI engines can cite",
  },
  {
    prompt: "Track which AI bots read my store",
    thinking: ["Enabling crawler logging…", "Watching for AI user-agents…"],
    steps: ["Detected GPTBot fetching your feed", "Detected ClaudeBot & PerplexityBot", "Logged Google-Extended crawls", "Charted reads over time"],
    metric: "312 AI-crawler fetches this month",
  },
  {
    prompt: "Speed up my store",
    thinking: ["Running a Core Web Vitals audit…", "Finding heavy images & app bloat…"],
    steps: ["Compressed 24 oversized images", "Lazy-loaded offscreen media", "Deferred non-critical scripts", "Tuned for a faster LCP"],
    metric: "Est. LCP: 3.6s → 1.8s",
  },
];

const STEPS = [
  {
    icon: "📊",
    title: "A real score, not a vibe",
    desc: "One AI-Readiness Score (0–100) for how well ChatGPT, Claude & Perplexity can read and recommend your store — with the exact gaps listed.",
  },
  {
    icon: "🤖",
    title: "Fixed where it counts",
    desc: "Schema, a retrieval feed and an llms.txt — served from ShopHero so agents always get a fresh, machine-readable view of your catalog.",
  },
  {
    icon: "🔁",
    title: "Stays AI-ready",
    desc: "New products, price changes and reviews are re-optimized automatically - so your store never decays back to invisible.",
  },
];

const LEAK_MAP = [
  { issue: "No llms.txt", detail: "AI crawlers have no map of your shop", sev: "High", impact: "−22 pts" },
  { issue: "Missing product schema", detail: "41 PDPs with no structured data", sev: "High", impact: "−18 pts" },
  { issue: "No retrieval feed", detail: "agents can't answer product questions", sev: "High", impact: "−15 pts" },
  { issue: "Marketing-only descriptions", detail: "no Q&A facts agents can quote", sev: "Medium", impact: "−9 pts" },
  { issue: "Slow mobile LCP", detail: "2.1s - demoted by Google & AI", sev: "Low", impact: "−4 pts" },
];

const COMPARE_ROWS: [string, string][] = [
  ["Pump out blog posts and hope AI notices", "Make your store directly machine-readable for AI"],
  ["No idea if AI can even see your products", "See exactly which AI bots fetch your store"],
  ["Schema hand-coded in your theme (or missing)", "Auto schema on every PDP, kept live"],
  ["A static feed that goes stale in a week", "A retrieval feed that updates as your catalog changes"],
  ["Generic descriptions agents can't quote", "Q&A descriptions written for how agents read"],
  ["A one-time audit you can't act on", "A live AI-Readiness Score with one-tap fixes"],
  ["Optimized once, invisible again in a month", "Re-optimizes automatically as you change"],
  ["Guess whether any of it is working", "Watch AI-crawler reads climb in your dashboard"],
];

const BRAINS = [
  { icon: "🤖", name: "Get recommended by AI", desc: "We give ChatGPT, Claude, Gemini & Perplexity everything they need to understand, trust, and recommend your store — and keep it updated automatically as your catalog changes. (Under the hood: a hosted llms.txt + retrieval feed.)" },
  { icon: "📐", name: "Make your products understandable to AI", desc: "AI can finally tell what each product is, what it costs, and whether it's in stock — so it answers shopper questions with your products, and you win rich results on Google too." },
  { icon: "✍️", name: "Give AI better answers about your products", desc: "A steady stream of buying guides and product Q&A, tied to your real best sellers, that AI quotes when shoppers ask what to buy." },
  { icon: "📈", name: "Proof AI is actually reading you", desc: "See exactly which AI assistants are fetching your store — real logs, not vanity metrics — so you know it's working and watch your score climb." },
  { icon: "⚡", name: "A fast, clean foundation", desc: "Speed and technical fixes, because slow, broken stores get ignored by both Google and AI." },
];

const SAFETY = [
  { icon: "✅", title: "Approval-first", desc: "Nothing goes live until you say so. Every change is staged for your review." },
  { icon: "↩️", title: "One-click rollback", desc: "Don't like a change? Restore any previous version instantly, with full history." },
  { icon: "🗂️", title: "Auto-backup", desc: "Your theme is duplicated before any edit - your live store is never at risk." },
  { icon: "🔒", title: "Your store, your data", desc: "ShopHero acts through Shopify's official API, using only the permissions you grant." },
];

const FAQ = [
  {
    q: "Will it break my theme?",
    a: "No. ShopHero duplicates your theme before any edit and stages every change for your approval. Nothing goes live until you publish, and you can roll back any change in one click.",
  },
  {
    q: "Do I need to know how to code?",
    a: "Not at all. You describe what you want in plain English - “make my homepage faster,” “rewrite my product descriptions” - and ShopHero does the technical work.",
  },
  {
    q: "Will this actually get me recommended by ChatGPT and Perplexity?",
    a: "We make your store genuinely readable by AI agents - structured data, a retrieval feed, an llms.txt and answer-shaped content - which is exactly what those engines look for, and we show you real logs of which AI bots fetch your store. No tool can guarantee a specific AI will name you, and anyone who promises that is selling hype. What we do is stop you being invisible to them - and prove it with crawler data.",
  },
  {
    q: "What does it cost?",
    a: "Your AI-Readiness Score is free - no card. Starter is $49/month (hosted llms.txt + AI-retrieval feed, auto schema on every product, AI-crawler analytics, speed fixes). Pro is $149/month and adds the constant AI-answer content drip, live re-optimization and brand-voice tuning. 14-day free trial on paid plans, cancel anytime from Shopify.",
  },
  {
    q: "Which AI powers it?",
    a: "ShopHero runs on Claude, Anthropic's frontier AI. We match the model to the task - fast models for routine work, stronger ones only when a job truly needs it - so you get top-tier quality without overpaying.",
  },
  {
    q: "Is my data safe?",
    a: "ShopHero works through Shopify's official Admin API, using only the permissions you grant, and acts on your store on your behalf - with your approval on every change.",
  },
  {
    q: "What about privacy and my data?",
    a: "ShopHero only accesses what you authorize through Shopify's official API, and we don't sell your data. Store content is sent to Anthropic's Claude API to generate edits and recommendations - and Anthropic does not use API data to train its models. You can read our Privacy Policy and Terms in the footer, and delete your data anytime by uninstalling or emailing us.",
  },
  {
    q: "What if I don't like what it does?",
    a: "Every change is reversible in one click through full version history. You're always in control.",
  },
];

function ShopifyMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#95BF47" d="M15.3 4.3c-.1 0-.3 0-.5.1-.3-.9-.9-1.7-1.9-1.7h-.1C12.5 2.3 12.1 2 11.7 2 8.7 2 7.3 5.7 6.8 7.6l-2 .6c-.6.2-.7.2-.7.8L2.5 21.3 14 23l6.3-1.4S15.4 4.3 15.3 4.3zM12.4 5.2l-1.1.3c0-.2 0-.4 0-.6 0-.6-.1-1.1-.2-1.5.6.1 1 .8 1.3 1.8zm-2-1.6c.2.4.3 1 .3 1.7v.2l-2.3.7c.4-1.5 1.2-2.3 2-2.6zM9.7 3c.1 0 .3 0 .4.1-1 .5-2 1.6-2.5 3.9l-1.8.6c.5-1.7 1.7-4.6 3.9-4.6z" />
      <path fill="#5E8E3E" d="M15.3 4.3c-.1 0-.3 0-.5.1l-.8 12.6 6.3-1.4S15.4 4.3 15.3 4.3z" />
      <path fill="#fff" d="M11.9 9.1l-.7 2.1s-.6-.3-1.4-.3c-1.1 0-1.2.7-1.2.9 0 1 2.6 1.4 2.6 3.7 0 1.8-1.2 3-2.7 3-1.9 0-2.8-1.2-2.8-1.2l.5-1.6s1 .8 1.8.8c.5 0 .7-.4.7-.7 0-1.3-2.1-1.4-2.1-3.5 0-1.8 1.3-3.5 3.9-3.5 1 0 1.5.3 1.5.3z" />
    </svg>
  );
}

function ClaudeMark() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
      <g stroke="#D97757" strokeWidth="3" strokeLinecap="round">
        <line x1="16" y1="3" x2="16" y2="29" />
        <line x1="3" y1="16" x2="29" y2="16" />
        <line x1="6.6" y1="6.6" x2="25.4" y2="25.4" />
        <line x1="25.4" y1="6.6" x2="6.6" y2="25.4" />
      </g>
    </svg>
  );
}

function AwardBadge({ lines, sub, c1, c2, idx }: { lines: string[]; sub: string; c1: string; c2: string; idx: number }) {
  const rg = `rg${idx}`;
  const sh = `sh${idx}`;
  return (
    <svg className={styles.badgeSvg} viewBox="0 0 200 250" role="img" aria-label={`${lines.join(" ")} - ${sub}`}>
      <defs>
        <linearGradient id={rg} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <filter id={sh} x="-25%" y="-10%" width="150%" height="140%">
          <feDropShadow dx="0" dy="9" stdDeviation="9" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter={`url(#${sh})`}>
        <path d="M22 16 a12 12 0 0 1 12 -12 H166 a12 12 0 0 1 12 12 V198 L100 240 L22 198 Z" fill={`url(#${rg})`} />
      </g>
      <path d="M22 16 a12 12 0 0 1 12 -12 H166 a12 12 0 0 1 12 12 V176 L100 214 L22 176 Z" fill="#ffffff" />
      <text x="34" y="26" fontSize="11" fontWeight="800" fill="#16181c" letterSpacing="0.5">SHOPHERO</text>
      <text x="34" y="41" fontSize="11" fontWeight="700" fill="#8a8a96" letterSpacing="0.5">2026</text>
      <rect x="138" y="6" width="38" height="38" rx="5" fill={c1} />
      <text x="157" y="32" textAnchor="middle" fontSize="20" fontWeight="800" fill="#ffffff">✦</text>
      <line x1="22" y1="54" x2="178" y2="54" stroke="#e9e9ee" strokeWidth="1.5" />
      <text x="100" y={lines.length > 1 ? 104 : 120} textAnchor="middle" fontSize="24" fontWeight="800" fill="#15171c">{lines[0]}</text>
      {lines[1] && <text x="100" y="132" textAnchor="middle" fontSize="24" fontWeight="800" fill="#15171c">{lines[1]}</text>}
      <text x="100" y="162" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#9a9aa6" letterSpacing="0.8">{sub}</text>
    </svg>
  );
}

const SCAN_TARGETS: [string, number, string][] = [
  ["Products", 128, "analyzed"],
  ["Pages", 42, "scanned"],
  ["Images", 310, "checked"],
  ["Leaks", 7, "found"],
];

function Demo() {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState(0); // 0 = scan, 1 = evaluate, 2 = result
  const [counts, setCounts] = useState([0, 0, 0, 0]);
  const sc = SCENARIOS[active];

  // drive the 3-phase sequence whenever the scenario changes
  useEffect(() => {
    setPhase(0);
    setCounts([0, 0, 0, 0]);
    const t1 = setTimeout(() => setPhase(1), 1700);
    const t2 = setTimeout(() => setPhase(2), 3100);
    const t3 = setTimeout(() => setActive((a) => (a + 1) % SCENARIOS.length), 6800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [active]);

  // animate the scan counters up during phase 0
  useEffect(() => {
    if (phase !== 0) return;
    const STEPS = 26;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const p = Math.min(i / STEPS, 1);
      setCounts(SCAN_TARGETS.map(([, target]) => Math.round(target * p)));
      if (i >= STEPS) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [phase, active]);

  const progress = phase === 0 ? 34 : phase === 1 ? 72 : 100;

  return (
    <>
      <div className={styles.browser}>
        <div className={styles.browserBar}>
          <span className={styles.dotR} />
          <span className={styles.dotY} />
          <span className={styles.dotG} />
          <div className={styles.addressBar}>
            <span className={styles.lock}>🔒</span> app.shophero.io
          </div>
          <span className={styles.demoLive}>● live</span>
        </div>
        <div className={styles.demoBody}>
          <div className={styles.progressTrack}>
            <span className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>

          <div className={styles.demoPrompt}>
            {sc.prompt}
            <span className={styles.caret} />
          </div>

          {phase === 0 && (
            <div className={styles.scan}>
              <p className={styles.phaseLabel}>
                <span className={styles.spinner} /> Reading your store…
              </p>
              <div className={styles.statGrid}>
                {SCAN_TARGETS.map(([label, , verb], i) => (
                  <div className={styles.statCell} key={label}>
                    <strong>
                      {counts[i]}
                      {label === "Leaks" ? "" : "+"}
                    </strong>
                    <span>
                      {label} {verb}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === 1 && (
            <div className={styles.demoThinking}>
              <span className={styles.spinner} />
              <div>
                <p className={styles.thinkingLabel}>Calculating &amp; evaluating…</p>
                <ul className={styles.thinkingList}>
                  {sc.thinking.map((t, i) => (
                    <li key={t} style={{ animationDelay: `${i * 0.22}s` }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {phase === 2 && (
            <>
              <div className={styles.demoResp}>
                <p className={styles.demoRespLead}>Done - here's what I changed:</p>
                <ul>
                  {sc.steps.map((s, i) => (
                    <li key={s} style={{ animationDelay: `${i * 0.1}s` }}>
                      {s}
                    </li>
                  ))}
                </ul>
                <div className={styles.demoMetric}>{sc.metric}</div>
              </div>
              <div className={styles.demoActions}>
                <span className={styles.demoApprove}>✓ Approve &amp; publish</span>
                <span className={styles.demoRollback}>↩ Roll back</span>
                <span className={styles.demoStaged}>Staged · not live yet</span>
              </div>
            </>
          )}
        </div>
      </div>

      <p className={styles.promptLabel}>Things you can just ask — tap any:</p>
      <div className={styles.promptChips}>
        {SCENARIOS.map((s, i) => (
          <button
            key={s.prompt}
            type="button"
            className={`${styles.promptChip} ${i === active ? styles.promptChipActive : ""}`}
            onClick={() => setActive(i)}
          >
            {s.prompt}
          </button>
        ))}
      </div>
      <p className={styles.demoNote}>Illustrative example - your store, your results.</p>
    </>
  );
}

// ── Premium dark section kit (matches the page's dark theme + elevates it) ──
const C = { line: "#243021", text: "#f2f6f0", muted: "#9fb098", brand: "#6ec531", brand2: "#a3e35c", accent: "#34e0a1", violet: "#7b6cf6", coral: "#d97757" };
const SECT: CSSProperties = { maxWidth: 1060, margin: "60px auto", padding: "0 18px", textAlign: "center" };
const glass: CSSProperties = { background: "linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.012))", border: `1px solid ${C.line}`, borderRadius: 18 };

function Kicker({ children }: { children: ReactNode }) {
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: C.brand2, background: "rgba(110,197,49,0.10)", border: "1px solid rgba(110,197,49,0.25)", padding: "6px 13px", borderRadius: 999, marginBottom: 16 }}>{children}</span>;
}
function GlowCard({ children, accent = C.accent, style }: { children: ReactNode; accent?: string; style?: CSSProperties }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${accent}, ${C.violet})`, borderRadius: 20, padding: 1.5, boxShadow: `0 0 60px ${accent}26`, ...style }}>
      <div style={{ background: "#0b0f0a", borderRadius: 18.5, height: "100%" }}>{children}</div>
    </div>
  );
}

function ChatCard({ tone, q, answers, verdict }: { tone: "bad" | "good"; q: string; answers: { name: string; note: string; you?: boolean }[]; verdict: string }) {
  const good = tone === "good";
  const accent = good ? C.accent : C.coral;
  const body = (
    <div style={{ overflow: "hidden", borderRadius: good ? 18.5 : 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5, fontWeight: 700, color: C.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        <span style={{ width: 19, height: 19, borderRadius: 6, background: `linear-gradient(135deg,${C.accent},${C.violet})`, display: "inline-grid", placeItems: "center", color: "#06120c", fontSize: 11, fontWeight: 900 }}>✦</span>
        AI Assistant
        <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", color: accent }}>{good ? "WITH SHOPHERO" : "WITHOUT SHOPHERO"}</span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 13px", fontSize: 13.5, fontWeight: 600, marginBottom: 12, color: C.text }}>{q}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 9 }}>Top options:</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {answers.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 9, padding: "9px 11px", borderRadius: 10, background: a.you ? "rgba(110,197,49,0.13)" : "rgba(255,255,255,0.03)", border: a.you ? "1px solid rgba(110,197,49,0.45)" : `1px solid ${C.line}` }}>
              <strong style={{ fontSize: 13, color: a.you ? C.brand2 : C.muted }}>{i + 1}.</strong>
              <div><div style={{ fontWeight: a.you ? 800 : 650, fontSize: 13, color: a.you ? C.brand2 : C.text }}>{a.name}</div><div style={{ fontSize: 11.5, color: C.muted }}>{a.note}</div></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 13, padding: "10px 12px", borderRadius: 10, background: good ? "rgba(52,224,161,0.10)" : "rgba(217,119,87,0.10)", color: accent, fontWeight: 650, fontSize: 12.5, lineHeight: 1.5 }}>{good ? "✓ " : "✕ "}{verdict}</div>
      </div>
    </div>
  );
  if (good) return <GlowCard style={{ flex: "1 1 330px" }}>{body}</GlowCard>;
  return <div style={{ flex: "1 1 330px", ...glass, border: "1px solid rgba(217,119,87,0.32)", boxShadow: "0 0 40px rgba(217,119,87,0.06)", overflow: "hidden" }}>{body}</div>;
}

function AIComparison() {
  const a = [{ name: "CompetitorBrand", note: "Well reviewed, great wide fit" }, { name: "RivalRun", note: "Popular local option" }, { name: "OtherStore", note: "Fast shipping" }];
  const b = [{ name: "YOUR STORE", note: "Top-rated wide-fit trail shoes + expert fit guide", you: true }, { name: "CompetitorBrand", note: "Also well reviewed" }, { name: "RivalRun", note: "Decent option" }];
  return (
    <section style={SECT}>
      <Kicker>The AI shopping shift · not 2016 SEO</Kicker>
      <h2 className={styles.h2}>Right now, AI is sending customers to your <span className={styles.grad}>competitors.</span></h2>
      <p className={styles.lead}>You probably don't even know it's happening. Ask ChatGPT what to buy and it names a few stores — today, not yours, because AI literally can't read your store. ShopHero changes the answer.</p>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 26, textAlign: "left", alignItems: "stretch" }}>
        <ChatCard tone="bad" q="What's the best trail-running shoe for wide feet?" answers={a} verdict="Your store isn't mentioned. The shopper clicks a competitor — and you never knew it happened." />
        <ChatCard tone="good" q="What's the best trail-running shoe for wide feet?" answers={b} verdict="Your store is the top pick — and you can see exactly which AI bots read you." />
      </div>
    </section>
  );
}

function StatsBand() {
  const stats: { big: string; label: string; src?: string }[] = [
    { big: "~25%", label: "of search shifts to AI assistants by 2026", src: "Gartner" },
    { big: "1–3", label: "stores named in a typical AI answer — be one" },
    { big: "1st", label: "movers get cited before competitors appear" },
  ];
  return (
    <section style={{ maxWidth: 980, margin: "8px auto", padding: "0 18px" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {stats.map((s, i) => (
          <div key={i} style={{ flex: "1 1 250px", ...glass, padding: "22px 18px", textAlign: "center" }}>
            <div className={styles.grad} style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em" }}>{s.big}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>{s.label}</div>
            {s.src && <div style={{ fontSize: 10.5, color: "#6f7d68", marginTop: 8, letterSpacing: "0.03em" }}>SOURCE: {s.src.toUpperCase()}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function FourSteps() {
  const steps = [
    { n: 1, icon: "🔍", title: "Scan", desc: "We deep-read your store — best sellers, catalog, content, schema — and score how readable it is to AI agents." },
    { n: 2, icon: "📐", title: "Structure", desc: "We add the structured data, retrieval feed and llms.txt that let ChatGPT, Claude & Perplexity actually parse what you sell." },
    { n: 3, icon: "✍️", title: "Drip", desc: "A constant plan of AI-answer content — buying guides, comparisons, FAQs — mapped to your real products, drafted for approval." },
    { n: 4, icon: "📈", title: "Get recommended", desc: "AI reads and cites you — and you watch real crawler reads climb in your dashboard. No ad spend." },
  ];
  return (
    <section style={SECT}>
      <Kicker>How it works</Kicker>
      <h2 className={styles.h2}>From invisible to <span className={styles.grad}>recommended</span> — in 4 steps.</h2>
      <p className={styles.lead}>You approve; ShopHero does the work and keeps it live.</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 26 }}>
        {steps.map((s) => (
          <div key={s.n} style={{ flex: "1 1 220px", ...glass, padding: "22px 20px", textAlign: "left", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${C.accent},${C.violet})`, color: "#06120c", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 15 }}>{s.n}</span>
              <span style={{ fontSize: 22 }}>{s.icon}</span>
            </div>
            <div style={{ fontWeight: 750, fontSize: 16, color: C.text }}>{s.title}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ColList({ items, tone }: { items: string[]; tone: "bad" | "good" }) {
  const c = tone === "good" ? C.brand : C.coral;
  return (
    <>{items.map((t, i) => (
      <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", fontSize: 13.5, color: tone === "good" ? C.text : C.muted, lineHeight: 1.45 }}>
        <span style={{ color: c, fontWeight: 800 }}>{tone === "good" ? "✓" : "✕"}</span>{t}
      </div>
    ))}</>
  );
}

function DiyVsShopHero() {
  return (
    <section style={SECT}>
      <Kicker>Advanced AI optimization · powered by Claude</Kicker>
      <h2 className={styles.h2}>ChatGPT writes blog posts. <span className={styles.grad}>ShopHero makes AI recommend you.</span></h2>
      <p className={styles.lead}>This isn't keyword stuffing or a content firehose. It's deep, Claude-powered optimization that makes your store readable to AI agents — something no one else is doing for Shopify.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 26, textAlign: "left", alignItems: "stretch" }}>
        <div style={{ flex: "1 1 330px", ...glass, border: "1px solid rgba(217,119,87,0.3)", padding: 22 }}>
          <div style={{ fontWeight: 800, color: C.coral, marginBottom: 8, fontSize: 14 }}>DIY with ChatGPT / blog tools</div>
          <ColList tone="bad" items={["Generic posts anyone can prompt — no real angle or voice", "Zero knowledge of your catalog, best sellers or customers", "No structured data, feed or llms.txt — AI still can't read you", "One article, then silence. The grind never ends", "No proof it works — you're guessing"]} />
        </div>
        <GlowCard style={{ flex: "1 1 330px" }}>
          <div style={{ padding: 22 }}>
            <div style={{ fontWeight: 800, color: C.brand2, marginBottom: 8, fontSize: 14 }}>ShopHero — advanced AI optimization</div>
            <ColList tone="good" items={["A deep, Claude-powered read of YOUR store before a word is written", "Schema + retrieval feed + llms.txt — AI can finally parse you", "AI-answer content mapped to your real products, on a cadence", "Re-optimizes as your catalog changes — never goes stale", "Real AI-crawler logs prove exactly who's reading you"]} />
          </div>
        </GlowCard>
      </div>
    </section>
  );
}

function CostCompare() {
  const ul: CSSProperties = { marginTop: 12, padding: 0, listStyle: "none", color: C.muted, fontSize: 13, lineHeight: 1.95 };
  const Tier = ({ name, price, per, items, sub }: { name: string; price: string; per: string; items: string[]; sub?: string }) => (
    <div style={{ flex: "1 1 260px", ...glass, padding: 22, textAlign: "left" }}>
      <div style={{ fontWeight: 800, marginBottom: 6, color: C.text }}>{name}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>{price}<span style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>{per}</span></div>
      {sub && <div style={{ fontSize: 11.5, color: C.coral, marginTop: 2 }}>{sub}</div>}
      <ul style={ul}>{items.map((t, i) => <li key={i}>✕ {t}</li>)}</ul>
    </div>
  );
  return (
    <section style={SECT}>
      <Kicker>Stop overpaying</Kicker>
      <h2 className={styles.h2}>Save thousands on SEO agencies that <span className={styles.grad}>can't even optimize for AI.</span></h2>
      <p className={styles.lead}>Most agencies are still running the 2016 playbook — backlinks and blog posts — with no idea how next-gen AI agent search actually picks stores. ShopHero does the new thing, at a fraction of the cost.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 26, alignItems: "stretch" }}>
        <Tier name="SEO / AEO agency" price="$3,000–8,000" per="/mo" items={["3-month minimums, black-box reports", "Still optimizing for 2016 Google, not AI agents", "A few articles — no technical AI readiness"]} />
        <Tier name="Blog-only AI-SEO tools" price="~$400" per="/mo" items={["A firehose of generic articles", "No schema, feed or llms.txt on your store", "Vanity metrics, not real crawler data"]} />
        <GlowCard style={{ flex: "1 1 260px" }}>
          <div style={{ padding: 22, textAlign: "left", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color: C.brand2 }}>ShopHero</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", color: "#06120c", background: C.accent, padding: "3px 8px", borderRadius: 999 }}>BEST VALUE</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>$49<span style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>/mo</span></div>
            <div style={{ fontSize: 11.5, color: C.brand2, marginTop: 2 }}>Pro $149/mo for extra powers</div>
            <ul style={{ ...ul, color: C.text }}>
              <li>✓ Hosted llms.txt + feed + auto schema</li>
              <li>✓ Built for how AI agents actually choose</li>
              <li>✓ Real AI-crawler analytics — proof it works</li>
            </ul>
          </div>
        </GlowCard>
      </div>
      <div style={{ marginTop: 18, display: "inline-block", ...glass, border: "1px solid rgba(110,197,49,0.3)", padding: "12px 20px", color: C.text, fontWeight: 700, fontSize: 14 }}>
        💰 Save <span className={styles.grad}>$35,000+ a year</span> vs a typical SEO agency — for a tool that's actually built for AI.
      </div>
    </section>
  );
}

function Objections() {
  const items = [
    { q: "Is it just AI spam?", a: "No. We don't fling posts at the wall — we make your store machine-readable (schema, feed, llms.txt) and write answer-shaped content grounded in your real catalog, for your approval. If you wouldn't send it to a customer, we don't ship it." },
    { q: "Will AI content hurt my Google rankings?", a: "Mass thin content can. Ours is depth-first, product-linked, schema'd and merchant-approved — and the core of ShopHero is technical readiness, not volume." },
    { q: "I've been burned by SEO before.", a: "Fair. The difference: you start free with a real AI-Readiness Score, you see your hosted files live, and you watch actual AI-crawler logs. No black box — cancel anytime from Shopify." },
    { q: "Will it work for my store?", a: "It's Shopify-only and built on your real catalog, so it adapts to any niche — and the score shows your gaps before you pay a cent." },
  ];
  return (
    <section style={{ ...SECT, maxWidth: 820 }}>
      <Kicker>No black boxes</Kicker>
      <h2 className={styles.h2}>Still on the <span className={styles.grad}>fence?</span></h2>
      <div style={{ marginTop: 20, textAlign: "left", display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ ...glass, padding: "16px 18px" }}>
            <div style={{ fontWeight: 750, marginBottom: 5, color: C.text }}>{it.q}</div>
            <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>{it.a}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FoundingStores() {
  return (
    <section style={{ ...SECT, maxWidth: 860 }}>
      <GlowCard accent={C.brand}>
        <div style={{ padding: "34px 26px" }}>
          <Kicker>Founding stores</Kicker>
          <h2 style={{ fontSize: 25, fontWeight: 800, margin: "4px 0 8px", color: C.text }}>Be one of the first stores AI learns to <span className={styles.grad}>recommend.</span></h2>
          <p style={{ color: C.muted, maxWidth: 580, margin: "0 auto 18px", lineHeight: 1.6 }}>We're onboarding a first group of Shopify stores and tracking real AI-crawler reads from day one. Early movers get cited before their category fills up — and help shape the product. We'd rather show you your own crawler data than a wall of testimonials.</p>
          <a href="#start" style={{ display: "inline-block", background: `linear-gradient(180deg,${C.brand2},${C.brand})`, color: "#06120c", fontWeight: 800, padding: "13px 24px", borderRadius: 999, textDecoration: "none" }}>Get my free AI-Readiness Score →</a>
        </div>
      </GlowCard>
    </section>
  );
}

function ChoiceClosing() {
  return (
    <section style={SECT}>
      <h2 className={styles.h2}>The choice is <span className={styles.grad}>yours.</span></h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 26, textAlign: "left", alignItems: "stretch" }}>
        <div style={{ flex: "1 1 330px", ...glass, border: "1px solid rgba(217,119,87,0.3)", padding: 22 }}>
          <div style={{ fontWeight: 800, color: C.coral, marginBottom: 8, fontSize: 14 }}>Keep waiting</div>
          <ColList tone="bad" items={["Stay invisible when shoppers ask AI what to buy", "Watch competitors get named instead of you", "Pay agencies $3k+/mo for the wrong playbook", "Hope it's working, with no real data"]} />
        </div>
        <GlowCard style={{ flex: "1 1 330px" }} accent={C.brand}>
          <div style={{ padding: 22 }}>
            <div style={{ fontWeight: 800, color: C.brand2, marginBottom: 8, fontSize: 14 }}>Start today</div>
            <ColList tone="good" items={["Be the store AI agents read and recommend", "Auto schema + feed + llms.txt, kept live", "Start free, then $49/mo — cancel anytime", "See real AI-crawler reads in your dashboard"]} />
          </div>
        </GlowCard>
      </div>
    </section>
  );
}

function Benchmarks() {
  const rows = [
    { label: "Average Shopify store", score: 31, color: C.coral, you: false },
    { label: "With ShopHero", score: 82, color: C.brand, you: true },
    { label: "Top 1% of stores", score: 95, color: C.accent, you: false },
  ];
  return (
    <section style={SECT}>
      <Kicker>AI-Readiness Score · the new benchmark</Kicker>
      <h2 className={styles.h2}>Where does your store <span className={styles.grad}>stand?</span></h2>
      <p className={styles.lead}>Every store gets one number for how readable it is to AI. Most are nowhere near ready — which is exactly the opening.</p>
      <div style={{ maxWidth: 640, margin: "26px auto 0", display: "flex", flexDirection: "column", gap: 13 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ ...glass, padding: "16px 18px", textAlign: "left", ...(r.you ? { border: "1px solid rgba(110,197,49,0.45)", boxShadow: "0 0 40px rgba(110,197,49,0.10)" } : {}) }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: C.text, fontWeight: r.you ? 800 : 650, fontSize: 14 }}>{r.label}{r.you && " ⭐"}</span>
              <span style={{ color: r.color, fontWeight: 800, fontSize: 15 }}>{r.score}/100</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${r.score}%`, borderRadius: 999, background: r.you ? `linear-gradient(90deg,${C.brand2},${C.accent})` : r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, color: "#6f7d68", fontSize: 11.5 }}>Illustrative AI-Readiness Scores · get yours free in 30 seconds</div>
    </section>
  );
}

function EarlyMover() {
  return (
    <section style={{ ...SECT, maxWidth: 900 }}>
      <GlowCard accent={C.violet}>
        <div style={{ padding: "34px 28px" }}>
          <Kicker>The window is open — right now</Kicker>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "4px 0 10px" }}>Be early. <span className={styles.grad}>That's the whole opportunity.</span></h2>
          <p style={{ color: C.muted, maxWidth: 620, margin: "0 auto", lineHeight: 1.65 }}>AI shopping is where SEO was 15 years ago. Today, AI names only a handful of stores per question — and most merchants haven't realized it yet. The stores that become readable and trusted by AI <em>now</em> build citations, authority and data <strong style={{ color: C.text }}>before the seats fill up.</strong></p>
          <p style={{ color: C.text, fontWeight: 800, margin: "16px 0 18px", fontSize: 17 }}>Start now. Thank yourself later.</p>
          <a href="#start" style={{ display: "inline-block", background: `linear-gradient(180deg,${C.brand2},${C.brand})`, color: "#06120c", fontWeight: 800, padding: "13px 24px", borderRadius: 999, textDecoration: "none" }}>Claim your seat — free score →</a>
        </div>
      </GlowCard>
    </section>
  );
}

export default function LandingV2() {
  const { showForm } = useLoaderData<typeof loader>();

  const StartForm = () =>
    showForm ? (
      <Form className={styles.form} method="post" action="/auth/login">
        <input className={styles.input} type="text" name="shop" placeholder="your-store.myshopify.com" aria-label="Your Shopify store domain" />
        <button className={styles.btnPrimary} type="submit">Upgrade my store →</button>
      </Form>
    ) : (
      <a href="https://apps.shopify.com" className={styles.btnPrimary}>Add to Shopify →</a>
    );

  return (
    <div className={styles.page}>
      {/* NAV */}
      <header className={styles.nav}>
        <a href="#top" className={styles.brand}>
          <img src="/ShopHero.png" alt="" className={styles.navLogo} /> ShopHero
        </a>
        <nav className={styles.navLinks}>
          <a href="#demo">See it work</a>
          <a href="#how">How it works</a>
          <a href="#compare">vs the old way</a>
          <a href="/ai-check">Free AI check</a>
          <a href="#faq">FAQ</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <a href="#start" className={styles.navCta}>Upgrade my store</a>
      </header>

      {/* HERO */}
      <section className={styles.hero} id="top">
        <div className={styles.heroInner}>
          <span className={styles.badge}>✦ The AI SEO app for Shopify</span>
          <div className={styles.lockup}>
            <span className={styles.logoChip}><ShopifyMark /><span>Shopify</span></span>
            <span className={styles.plus}>+</span>
            <span className={styles.logoChip}><ClaudeMark /><span>Claude</span></span>
            <span className={styles.lockupBreak} aria-hidden="true" />
            <span className={styles.plus}>=</span>
            <span className={styles.lockupBreak} aria-hidden="true" />
            <span className={`${styles.logoChip} ${styles.logoChipResult}`}>
              <img src="/ShopHero.png" alt="" className={styles.chipLogo} /><span>ShopHero</span>
            </span>
          </div>
          <h1 className={styles.h1}>
            <span className={styles.nowrap}>Get recommended</span>{" "}
            <span className={styles.grad}>by ChatGPT.</span>
          </h1>
          <p className={styles.sub}>
            Millions of shoppers now ask <strong>ChatGPT, Claude &amp; Perplexity</strong> what to buy — and AI
            recommends just a few stores. The good news? <strong>It's still early.</strong> Become one of the stores
            AI learns to trust and recommend, before your category gets crowded.
          </p>
          <div className={styles.brainsLine}>
            <span className={styles.brainsCount}>🟢 Early-mover advantage</span>
            <span>AI shopping is still in its first innings</span>
          </div>
          <div id="start" className={styles.startBlock}>
            <StartForm />
            <p className={styles.micro}>Get your free AI-Readiness Score · no card · installs in 30 seconds</p>
          </div>
          <p style={{ maxWidth: 560, margin: "16px auto 0", color: "#9fb098", fontSize: 14, lineHeight: 1.55 }}>
            You don't need to understand AI optimization — just whether AI can recommend your store. <strong style={{ color: "#f2f6f0" }}>ShopHero handles the rest.</strong>
          </p>
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <span className={styles.statIcon}>📊</span>
              <strong className={styles.statBig}>0–100</strong>
              <span className={styles.statLabel}>your AI-Readiness Score</span>
              <span className={styles.statVs}>free, in 30 seconds</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statIcon}>🤖</span>
              <strong className={styles.statBig}>Yes</strong>
              <span className={styles.statLabel}>AI can finally read your store</span>
              <span className={styles.statVs}>vs <s>invisible to AI</s></span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statIcon}>📈</span>
              <strong className={styles.statBig}>Proof</strong>
              <span className={styles.statLabel}>see AI actually reading you</span>
              <span className={styles.statVs}>real crawler logs</span>
            </div>
          </div>
        </div>
      </section>

      {/* CREDIBILITY */}
      <section className={styles.strip}>
        <p className={styles.stripLead}>
          Shopping has <span className={styles.grad}>changed.</span>
        </p>
        <p className={styles.stripSub}>
          Millions of shoppers now ask <strong>ChatGPT what to buy</strong> instead of searching Google.
          And AI usually recommends <strong>just a few stores</strong>. <strong>Is yours one of them?</strong>{" "}
          Most Shopify stores are invisible to AI — ShopHero gives AI everything it needs to understand,
          trust, and recommend yours, and shows you proof it's working.
        </p>
      </section>

      {/* AI RECOMMENDATION — before/after */}
      <AIComparison />
      <StatsBand />
      <Benchmarks />
      <FourSteps />

      {/* AUTHORITY BADGES */}
      <section className={styles.badgesBand}>
        <p className={styles.badgesTitle}>What ShopHero actually delivers</p>
        <div className={styles.badges}>
          {BADGES.map((b, i) => (
            <AwardBadge key={b.lines.join("-")} lines={b.lines} sub={b.sub} c1={b.c1} c2={b.c2} idx={i} />
          ))}
        </div>
      </section>

      {/* FREE AI CHECK PROMO */}
      <section className={styles.aiCheckBand}>
        <span className={styles.kicker}>🤖 Free · instant · no signup</span>
        <h2 className={styles.aiCheckTitle}>Can ChatGPT &amp; Claude find your store?</h2>
        <p className={styles.aiCheckSub}>
          Shoppers now ask AI what to buy. Run the free <strong>AI Visibility Check</strong> and see, in seconds,
          how readable your store is to AI agents — and the exact gaps stopping them from recommending you.
        </p>
        <a href="/ai-check" className={styles.btnPrimary}>Check my store free →</a>
      </section>

      {/* PRODUCT DEMO */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="demo">
        <h2 className={styles.h2}>See it <span className={styles.grad}>work.</span></h2>
        <p className={styles.lead}>Ask in plain English. Watch ShopHero make your store readable by AI - structured, fed, and tracked - with your approval on every change.</p>
        <Demo />
      </section>

      {/* HOW IT WORKS (merged, Leak Map centerpiece) */}
      <section className={styles.section} id="how">
        <h2 className={styles.h2}>Always know <span className={styles.grad}>how AI-ready you are.</span></h2>
        <p className={styles.lead}>
          ShopHero turns your store into a live AI-Readiness Map - every gap that's stopping
          agents from reading and recommending you, ranked by impact.
        </p>
        <div className={styles.steps}>
          {STEPS.map((s) => (
            <div className={styles.step} key={s.title}>
              <span className={styles.stepIcon}>{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>

        <div className={styles.mapShowcase}>
          <div className={styles.mapText}>
            <span className={styles.kicker}>📊 The breakthrough</span>
            <h3 className={styles.mapHeading}>Where other tools only diagnose, ShopHero fixes.</h3>
            <p>
              AutoSEO-style tools throw blog posts at the wall. ShopHero hands you an
              <strong> AI-Readiness Map</strong>: the exact gaps stopping agents from recommending you -
              each one a tap away from fixed, and kept fixed as your store changes.
            </p>
          </div>
          <div className={styles.mapCard}>
            <div className={styles.mapHead}><span>AI-Readiness Map</span><span className={styles.mapTag}>Example</span></div>
            {LEAK_MAP.map((l) => (
              <div className={styles.mapRow} key={l.issue}>
                <span className={`${styles.sevDot} ${l.sev === "High" ? styles.sevHigh : l.sev === "Medium" ? styles.sevMed : styles.sevLow}`} />
                <div className={styles.mapInfo}><strong>{l.issue}</strong><span>{l.detail}</span></div>
                <span className={styles.mapImpact}>{l.impact}</span>
              </div>
            ))}
            <div className={styles.mapFoot}><span>Your AI-Readiness Score</span><strong>41 / 100</strong></div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="compare">
        <h2 className={styles.h2}>Blog posts vs. <span className={styles.grad}>actually being readable by AI.</span></h2>
        <p className={styles.lead}>The 2010 SEO playbook in an AI coat of paint - vs. making your store something agents can truly read, trust, and recommend.</p>
        <div className={styles.compareTable}>
          <div className={styles.compareHead}>
            <div className={styles.headCell}><span className={styles.tagOld}>✕ Without ShopHero</span></div>
            <div className={`${styles.headCell} ${styles.headCellNew}`}><span className={styles.tagNew}>✓ With ShopHero</span></div>
          </div>
          {COMPARE_ROWS.map(([without, withSh]) => (
            <div className={styles.compareRow} key={without}>
              <span className={styles.cellOld}><span className={styles.x}>✕</span>{without}</span>
              <span className={styles.cellNew}><span className={styles.check}>✓</span>{withSh}</span>
            </div>
          ))}
        </div>
        <p className={styles.compareMore}>…and endless more options.</p>
      </section>

      {/* AI GROWTH PLAN */}
      <section className={styles.section} id="brains">
        <h2 className={styles.h2}>What ShopHero <span className={styles.grad}>does for you</span></h2>
        <p className={styles.lead}>
          You don't need to know how any of it works. You just get a store AI can recommend —
          built, kept live, and proven with real data.
        </p>
        <div className={styles.brainGrid}>
          {BRAINS.map((b) => (
            <div className={styles.brain} key={b.name}>
              <span className={styles.brainIcon}>{b.icon}</span>
              <div><strong>{b.name}</strong><p>{b.desc}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* DIY VS SHOPHERO */}
      <DiyVsShopHero />

      {/* SAFETY */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="safety">
        <h2 className={styles.h2}>AI on your store - <span className={styles.grad}>with the brakes on.</span></h2>
        <p className={styles.lead}>You stay in control of everything. Always.</p>
        <div className={styles.safetyGrid}>
          {SAFETY.map((s) => (
            <div className={styles.safetyCard} key={s.title}>
              <span className={styles.safetyIcon}>{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.section} id="faq">
        <h2 className={styles.h2}>Questions, <span className={styles.grad}>answered.</span></h2>
        <div className={styles.faq}>
          {FAQ.map((f) => (
            <details className={styles.faqItem} key={f.q}>
              <summary>
                <span>{f.q}</span>
                <span className={styles.faqPlus}>+</span>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* COST COMPARISON + OBJECTIONS + FOUNDING STORES */}
      <CostCompare />
      <EarlyMover />
      <Objections />
      <FoundingStores />

      {/* PRICING */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="pricing">
        <h2 className={styles.h2}>Start free. <span className={styles.grad}>Scale when it's working.</span></h2>
        <p className={styles.lead}>See your AI-Readiness Score free — no card. Then pick your power level.</p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center", alignItems: "stretch", marginTop: 26 }}>
          <div style={{ flex: "1 1 330px", maxWidth: 390, ...glass, padding: 26, textAlign: "left" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Starter</div>
            <div style={{ marginTop: 6 }}><span style={{ fontSize: 42, fontWeight: 800, color: C.text }}>$49</span><span style={{ color: C.muted }}>/month</span></div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Get your store readable by AI.</div>
            <div style={{ marginTop: 16 }}>
              <ColList tone="good" items={["AI-Readiness Score + ranked gaps", "Auto schema on every product (Product, Offer, Review, FAQ, Breadcrumb)", "Hosted llms.txt + AI-retrieval feed", "AI-crawler analytics — see who's reading you", "Speed audit + safe fixes", "Approval-first · one-click rollback"]} />
            </div>
            <a href="#start" style={{ display: "block", textAlign: "center", marginTop: 18, padding: "13px 20px", borderRadius: 999, border: `1px solid ${C.line}`, color: C.text, fontWeight: 700, textDecoration: "none", background: "rgba(255,255,255,0.04)" }}>Start free →</a>
          </div>
          <GlowCard style={{ flex: "1 1 330px", maxWidth: 390 }} accent={C.accent}>
            <div style={{ padding: 26, textAlign: "left", height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Pro</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", color: "#06120c", background: C.accent, padding: "3px 9px", borderRadius: 999 }}>MOST POWERFUL</span>
              </div>
              <div style={{ marginTop: 6 }}><span className={styles.grad} style={{ fontSize: 42, fontWeight: 800 }}>$149</span><span style={{ color: C.muted }}>/month</span></div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Extra powers — stay ahead, automatically.</div>
              <div style={{ fontSize: 12.5, color: C.brand2, marginTop: 16, fontWeight: 800 }}>Everything in Starter, plus:</div>
              <div style={{ marginTop: 6 }}>
                <ColList tone="good" items={["The constant AI-answer content drip — deep strategy + monthly articles on your best sellers", "Live re-optimization as your catalog changes", "Brand-voice tuning for on-brand content", "Priority support"]} />
              </div>
              <a href="#start" className={styles.btnPrimary} style={{ display: "block", textAlign: "center", marginTop: 18 }}>Get my free AI-Readiness Score →</a>
            </div>
          </GlowCard>
        </div>
        <p className={styles.micro} style={{ textAlign: "center", marginTop: 16 }}>Free AI-Readiness Score to start — no card. 14-day trial on paid plans. Cancel anytime, right from Shopify.</p>
      </section>

      {/* THE CHOICE */}
      <ChoiceClosing />

      {/* FINAL CTA */}
      <section className={styles.finalCta}>
        <span className={styles.kicker}>🚀 Get positioned before your category gets crowded</span>
        <h2 className={styles.h2}>Get recommended by AI - before your <span className={styles.grad}>competitor</span> is.</h2>
        <p className={styles.lead}>The best time to become AI-ready was yesterday. The second-best is today. When a shopper asks AI what to buy, one store gets named — make it yours.</p>
        <div className={styles.startBlock}><StartForm /></div>
      </section>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footBrand}>
          <img src="/ShopHero.png" alt="ShopHero" className={styles.footLogo} />
          <span>ShopHero</span>
        </div>
        <nav className={styles.footLinks}>
          <a href="#demo">See it work</a>
          <a href="/ai-check">Free AI check</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
          <a href="/auth/login">Log in</a>
        </nav>
        <p className={styles.copy}>© {new Date().getFullYear()} ShopHero. All rights reserved. · shophero.io</p>
      </footer>
    </div>
  );
}
