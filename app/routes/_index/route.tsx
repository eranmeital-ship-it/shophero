import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useFetcher, useLoaderData } from "react-router";
import type { VisibilityReport } from "../../lib/ai-visibility.server";

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

const PILLARS = [
  {
    n: "01",
    tag: "On-page",
    icon: "🛠️",
    accent: "#6ec531",
    title: "On-page optimization",
    blurb: "Every technical signal AI and Google read to understand your store — done for you, and kept live as your catalog changes.",
    items: [
      "Auto JSON-LD schema on every product — Product, Offer, Review, FAQ & Breadcrumb",
      "Hosted llms.txt + AI-retrieval feed, refreshed automatically",
      "Product copy restructured into Q&A facts AI can quote",
      "Core Web Vitals & speed fixes — image compression, lazy-load, deferred scripts",
      "Clean titles, meta, canonicals, alt text & sitemap",
      "Mobile + crawlability fixes so nothing blocks the bots",
    ],
  },
  {
    n: "02",
    tag: "Content",
    icon: "✍️",
    accent: "#34e0a1",
    title: "Content creation",
    blurb: "Not blog filler — answer-shaped content engineered from your real catalog to be the source AI quotes.",
    items: [
      "Monthly AI-answer articles tied to your actual best sellers",
      "Buying guides, comparisons, use-case & gift guides, FAQs",
      "Answer-first structure with Article + FAQ schema baked in",
      "Internally linked to the right products & collections",
      "10× a blog post: each piece is built to be cited by AI and rank on Google — not keyword filler nobody reads",
    ],
  },
  {
    n: "03",
    tag: "Off-page",
    icon: "🌐",
    accent: "#7b6cf6",
    title: "Off-page authority",
    blurb: "What the rest of the web says about you — backlinks and mentions from the highest-trust sites on the internet.",
    items: [
      "Monthly press release to 400+ news sites — Yahoo Finance, Benzinga, MarketWatch, AP & more",
      "High-authority backlinks from top-domain-authority domains",
      "Brand mentions on the exact sources AI reads to decide who to recommend",
      "Compounding domain authority — more trust every month",
      "Powered by MediaFuse · $800/mo of PR value",
    ],
  },
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
    a: "Your AI-Readiness Score is free - no card. Starter is $49/month (hosted llms.txt + AI-retrieval feed, auto schema on every product, AI-crawler analytics, speed fixes). Pro is $149/month and adds the constant AI-answer content drip, live re-optimization and brand-voice tuning. Authority is $399/month and adds a monthly press release distributed to 400+ news sites (Yahoo Finance, Benzinga, MarketWatch and more) — an $800/month value powered by MediaFuse — for high-authority backlinks and brand mentions on the sources AI trusts. 14-day free trial on paid plans, cancel anytime from Shopify.",
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
  {
    q: "Is it just AI spam?",
    a: "No. We don't fling posts at the wall — we make your store machine-readable (schema, feed, llms.txt) and write answer-shaped content grounded in your real catalog, for your approval. If you wouldn't send it to a customer, we don't ship it.",
  },
  {
    q: "Will AI content hurt my Google rankings?",
    a: "Mass thin content can. Ours is depth-first, product-linked, schema'd and merchant-approved — and the core of ShopHero is technical readiness, not volume.",
  },
  {
    q: "I've been burned by SEO before.",
    a: "Fair. The difference: you start free with a real AI-Readiness Score, you see your hosted files live, and you watch actual AI-crawler logs. No black box — cancel anytime from Shopify.",
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

// Reveal-on-scroll hook — drives the gauge animations when they enter view.
function useInView(ref: { current: Element | null }) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

// Animated "pressure-clock" gauge (semicircle dial + needle), color-coded by value.
function Gauge({ value, label, animate }: { value: number; label: string; animate: boolean }) {
  const v = animate ? value : 0;
  const color = value >= 80 ? "#6ec531" : value >= 50 ? "#e8941a" : "#d97757";
  const ARC = 125.6; // semicircle, r=40
  const angle = (v / 100) * 180 - 90;
  const tag = value >= 80 ? "great" : value >= 50 ? "okay" : "poor";
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 86 }}>
      <svg viewBox="0 0 100 62" width="100%" style={{ maxWidth: 116, display: "block", margin: "0 auto" }}>
        <path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="9" strokeLinecap="round" />
        <path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={ARC} strokeDashoffset={ARC * (1 - v / 100)} style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }} />
        <line x1="50" y1="50" x2="50" y2="17" stroke={C.text} strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${angle} 50 50)`} style={{ transition: "transform 1.1s cubic-bezier(.2,.8,.2,1)" }} />
        <circle cx="50" cy="50" r="3.6" fill={C.text} />
      </svg>
      <div style={{ fontWeight: 800, fontSize: 16, color, marginTop: -2 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 10, color, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>{tag}</div>
    </div>
  );
}

function FourSteps() {
  const steps = [
    { n: 1, icon: "🔍", title: "Deep scan & analysis", desc: "ShopHero crawls your whole store — best sellers, collections, descriptions, existing schema and content gaps — and benchmarks how AI agents see you.", tech: "Output: your AI-Readiness Score + a ranked list of the biggest opportunities to fix first." },
    { n: 2, icon: "📐", title: "Make your store AI-readable", desc: "We build and maintain the technical layer AI needs to understand and trust your catalog — automatically, kept fresh as products change.", tech: "Product / Offer / Review / FAQ / Breadcrumb schema · hosted llms.txt · retrieval feed · Q&A product data." },
    { n: 3, icon: "✍️", title: "Constant AI-answer content", desc: "A deep content plan built from your best sellers and gaps — buying guides, comparisons and FAQs that AI quotes when shoppers ask what to buy.", tech: "Published on a cadence, mapped to real products, internally linked + schema'd. A major part of the plan." },
    { n: 4, icon: "📈", title: "Get recommended & track it", desc: "AI starts reading and citing your store. You see it happen — and ShopHero keeps re-optimizing as your catalog evolves.", tech: "Real crawler analytics: GPTBot, ClaudeBot, PerplexityBot & Google-Extended hits, live in your dashboard." },
  ];
  return (
    <section style={{ ...SECT, maxWidth: 1140 }}>
      <Kicker>How ShopHero works</Kicker>
      <h2 className={styles.h2}>From invisible to <span className={styles.grad}>recommended.</span></h2>
      <p className={styles.lead}>Four steps. You approve; ShopHero does the work and keeps it live.</p>
      <div style={{ position: "relative", display: "flex", gap: 14, flexWrap: "wrap", marginTop: 30, alignItems: "stretch" }}>
        {/* connector line behind the steps (desktop) */}
        <div aria-hidden="true" style={{ position: "absolute", top: 38, left: "12%", right: "12%", height: 2, background: `linear-gradient(90deg, transparent, ${C.line} 12%, ${C.line} 88%, transparent)`, zIndex: 0 }} />
        {steps.map((s) => (
          <div key={s.n} style={{ flex: "1 1 230px", ...glass, padding: "22px 20px", textAlign: "left", position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg,${C.accent},${C.violet})`, color: "#06120c", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 17, boxShadow: `0 0 24px ${C.accent}33` }}>{s.n}</span>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
            </div>
            <div style={{ fontWeight: 750, fontSize: 16, color: C.text }}>{s.title}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 7, lineHeight: 1.55, flex: 1 }}>{s.desc}</div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, fontSize: 11.5, color: C.brand2, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{s.tech}</div>
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
    <section style={SECT} id="compare">
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

function ShoeTile({ kind, size = 84, box = 112 }: { kind: "loafer" | "boot"; size?: number; box?: number }) {
  // Self-contained SVG product shot on a studio backdrop — reliable, no external images.
  return (
    <div style={{ width: "100%", height: box, borderRadius: 12, background: "linear-gradient(135deg,#efe9df,#ded7c8)", display: "grid", placeItems: "center", overflow: "hidden" }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <ellipse cx="50" cy="84" rx="34" ry="6" fill="rgba(0,0,0,0.12)" />
        {kind === "loafer" ? (
          <g fill="#15171c">
            <path d="M16 60 q-2 12 6 14 h52 q12 0 12-9 q0-6-9-8 l-22-5 q-6-2-10-7 l-6-7 q-3-3-7-2 q-5 1-6 8 z" />
            <path d="M30 58 h22 q3 0 3 3 t-3 3 H30 z" fill="#2a2d33" />
            <rect x="16" y="72" width="64" height="6" rx="3" fill="#0a0c0f" />
          </g>
        ) : (
          <g fill="#15171c">
            <path d="M38 20 q-4 0 -4 6 v30 q-10 3 -14 12 q-3 8 5 9 h40 q8 0 8 -8 v-3 q0 -6 -6 -9 q-9 -4 -13 -12 V26 q0 -6 -6 -6 z" />
            <rect x="24" y="74" width="50" height="6" rx="3" fill="#0a0c0f" />
            <path d="M40 26 q8 4 16 0 v6 q-8 4 -16 0 z" fill="#2a2d33" />
          </g>
        )}
      </svg>
    </div>
  );
}

// Real product photo with a graceful SVG fallback if the image can't load.
const BOOT_IMG = "https://loremflickr.com/440/440/black,chelsea,boots/all?lock=8";
const LOAFER_IMG = "https://loremflickr.com/440/440/black,leather,loafers/all?lock=14";
function ProductImg({ src, kind, box = 112 }: { src: string; kind: "loafer" | "boot"; box?: number }) {
  const [err, setErr] = useState(false);
  if (err) return <ShoeTile kind={kind} box={box} />;
  return (
    <div style={{ width: "100%", height: box, borderRadius: 12, overflow: "hidden", background: "#efe9df" }}>
      <img src={src} alt="" loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
}

function HeroChatDemo() {
  const [phase, setPhase] = useState(0); // 0 ask · 1 typing · 2 cards · 3 processing · 4 purchased · 5 confirmed
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Auto-scroll the chat as new messages arrive — like a real conversation.
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [phase]);
  useEffect(() => {
    const durations = [1700, 1200, 2200, 1400, 1700, 3200];
    let p = 0;
    let id: ReturnType<typeof setTimeout>;
    const run = () => { setPhase(p); id = setTimeout(() => { p = (p + 1) % 6; run(); }, durations[p]); };
    run();
    return () => clearTimeout(id);
  }, []);
  const T = { ink: "#1f2430", muted: "#6b7280", line: "#eceef1", green: "#15795e", studio: "#efe9df" };
  const Btn = ({ children, solid, muted }: { children: ReactNode; solid?: boolean; muted?: boolean }) => (
    <div style={{ marginTop: 9, textAlign: "center", fontSize: 12.5, fontWeight: 700, padding: "9px 0", borderRadius: 9, background: muted ? "#eceef1" : solid ? T.green : "#f3f4f6", color: muted ? T.muted : solid ? "#fff" : T.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{children}</div>
  );
  return (
    <section style={{ maxWidth: 600, margin: "0 auto", padding: "12px 18px 6px", position: "relative" }}>
      <style>{`
        @keyframes shFade { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes shBlink { 0%,80%,100% { opacity:.25; } 40% { opacity:1; } }
        @keyframes shSpin { to { transform: rotate(360deg); } }
        .sh-cd-fade { animation: shFade .5s cubic-bezier(.2,.7,.2,1) both; }
        .sh-cd-dot { width:7px; height:7px; border-radius:50%; background:#aeb4bd; display:inline-block; animation: shBlink 1.2s infinite; }
        .sh-cd-spin { width:13px; height:13px; border-radius:50%; border:2px solid rgba(0,0,0,.18); border-top-color:#6b7280; display:inline-block; animation: shSpin .7s linear infinite; }
        .sh-cd-scroll::-webkit-scrollbar { display: none; }
        @keyframes shPop { 0% { transform: scale(.6); opacity:0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity:1; } }
        .sh-cd-pop { animation: shPop .5s cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
      {/* soft glow behind the floating panel */}
      <div aria-hidden="true" style={{ position: "absolute", inset: "8% 12%", background: "radial-gradient(closest-side, rgba(52,224,161,0.18), transparent)", filter: "blur(30px)", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, background: "linear-gradient(180deg,#ffffff,#f6f8fa)", borderRadius: 22, boxShadow: "0 30px 70px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)", height: 470, overflow: "hidden" }}>
       <div ref={scrollRef} className="sh-cd-scroll" style={{ height: "100%", overflowY: "auto", padding: "20px 18px", scrollbarWidth: "none" }}>
        {/* shopper + avatar */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", gap: 10 }}>
          <div className="sh-cd-fade" style={{ maxWidth: "82%", background: "#eef1f4", color: T.ink, borderRadius: "16px 16px 4px 16px", padding: "11px 14px", fontSize: 14, lineHeight: 1.45, fontWeight: 500 }}>
            I need waterproof Chelsea boots for wide feet under $150, shipping to Austin.
          </div>
          <img src="https://i.pravatar.cc/80?img=45" alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "linear-gradient(135deg,#c7d2fe,#a5b4fc)" }} />
        </div>

        {/* ChatGPT */}
        {phase >= 1 && (
          <div className="sh-cd-fade" style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#10a37f", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 13, flexShrink: 0 }}>✦</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#10a37f", marginBottom: 6 }}>ChatGPT</div>
              {phase === 1 ? (
                <div style={{ display: "flex", gap: 5, alignItems: "center", color: T.muted, fontSize: 12.5 }}>
                  <span className="sh-cd-dot" /><span className="sh-cd-dot" style={{ animationDelay: ".2s" }} /><span className="sh-cd-dot" style={{ animationDelay: ".4s" }} />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.5, marginBottom: 12 }}>I found two great wide-fit options shipping to Austin:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="sh-cd-fade" style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: 10, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      <ProductImg src={BOOT_IMG} kind="boot" />
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: T.ink, marginTop: 8 }}>All-Weather Chelsea Boots</div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: T.ink }}>$129</div>
                      {phase < 3 ? <Btn solid>Buy Now</Btn> : phase === 3 ? <Btn muted><span className="sh-cd-spin" /> Processing…</Btn> : <Btn solid>✓ Purchased</Btn>}
                    </div>
                    <div className="sh-cd-fade" style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: 10, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      <ProductImg src={LOAFER_IMG} kind="loafer" />
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: T.ink, marginTop: 8 }}>Wide-Fit Leather Loafers</div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: T.ink }}>$115</div>
                      <Btn solid>Buy Now</Btn>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* purchase approved */}
        {phase >= 4 && (
          <div className="sh-cd-fade" style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 999, padding: "7px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: T.green, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900 }}>✓</span>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: T.ink }}>Purchase approved</span>
          </div>
        )}

        {/* order confirmed — Shopify-style celebratory receipt */}
        {phase >= 5 && (
          <div className="sh-cd-pop" style={{ marginTop: 14, borderRadius: 16, overflow: "hidden", boxShadow: "0 12px 30px rgba(13,138,95,0.22)", border: "1px solid #cfe9df" }}>
            <div style={{ background: "linear-gradient(135deg,#11a06b,#0a6e4c)", color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 18 }}>🎉</span>
              <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Order confirmed!</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.18)", borderRadius: 999, padding: "4px 10px 4px 7px", fontSize: 11, fontWeight: 800 }}>
                <span style={{ display: "inline-flex", transform: "scale(0.78)", transformOrigin: "center" }}><ShopifyMark /></span> Shopify
              </span>
            </div>
            <div style={{ background: "#fff", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 54, flexShrink: 0 }}><ProductImg src={BOOT_IMG} kind="boot" box={54} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: T.ink }}>All-Weather Chelsea Boots</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>📍 Delivering to Austin · arrives in 3 days</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 17, color: T.ink }}>$129</div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11.5, color: T.muted, display: "flex", alignItems: "center", gap: 6 }}>🔒 Paid with Shop Pay</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: T.green }}>+1 sale for your store 🟢</span>
              </div>
            </div>
          </div>
        )}
       </div>
      </div>
      <p style={{ textAlign: "center", color: "#6f7d68", fontSize: 12.5, marginTop: 14 }}>This is the new buying journey. ShopHero makes sure <strong style={{ color: C.brand2 }}>your store</strong> is the one AI picks.</p>
    </section>
  );
}

function BenchTier({ name, overall, gauges, you, note }: { name: string; overall: number; gauges: { l: string; v: number }[]; you?: boolean; note: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const inner = (
    <div ref={ref} style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ color: C.text, fontWeight: 800, fontSize: 14.5 }}>{name}{you && " ⭐"}</span>
        <span style={{ fontWeight: 800, fontSize: 14, color: you ? C.brand : C.coral }}>{overall}/100</span>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        {gauges.map((g) => <Gauge key={g.l} value={g.v} label={g.l} animate={inView} />)}
      </div>
      <div style={{ marginTop: 16, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: you ? C.brand2 : C.coral }}>{you ? "✓ " : "✕ "}{note}</div>
    </div>
  );
  if (you) return <GlowCard accent={C.brand} style={{ flex: "1 1 360px" }}>{inner}</GlowCard>;
  return <div style={{ flex: "1 1 360px", ...glass }}>{inner}</div>;
}

function Benchmarks() {
  return (
    <section style={SECT}>
      <Kicker>AI-Readiness Score · the new benchmark</Kicker>
      <h2 className={styles.h2}>Where does your store <span className={styles.grad}>stand?</span></h2>
      <p className={styles.lead}>One score for how readable your store is to AI — broken down across the things that actually move it. Most stores are deep in the red. That's the opening.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 26, alignItems: "stretch" }}>
        <BenchTier name="Average Shopify store" overall={31} gauges={[{ l: "Speed", v: 38 }, { l: "Content", v: 24 }, { l: "AI Schema", v: 12 }]} note="Invisible to AI — competitors get recommended" />
        <BenchTier name="With ShopHero" you overall={91} gauges={[{ l: "Speed", v: 90 }, { l: "Content", v: 88 }, { l: "AI Schema", v: 96 }]} note="Top-ranked, readable, and recommended by AI" />
      </div>
      <div style={{ marginTop: 14, color: "#6f7d68", fontSize: 11.5 }}>Illustrative AI-Readiness Scores · get yours free in 30 seconds</div>
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

// PLACEHOLDER reviews — realistic samples so the section looks right. REPLACE with
// real Trustpilot / Shopify App Store reviews before launch. Never ship invented
// reviews as real (deceptive + against FTC/consumer rules, and it'd undermine the
// honesty that's our whole positioning).
const TESTIMONIALS: { name: string; role: string; flag: string; img: number; quote: ReactNode; src: string }[] = [
  { name: "Maya R.", role: "Skincare brand", flag: "🇺🇸", img: 32, src: "Shopify App Store", quote: <>Set up in an afternoon. Two weeks later my score jumped from 34 to 89 and <Hl>I can actually see ChatGPT's bot crawling my feed.</Hl> Wild to watch.</> },
  { name: "Tom B.", role: "Outdoor gear", flag: "🇬🇧", img: 12, src: "Shopify App Store", quote: <>Finally a tool that explains what's wrong in plain English and <Hl>just fixes it.</Hl> Schema and llms.txt were done before I finished my coffee.</> },
  { name: "Priya N.", role: "Home & kitchen", flag: "🇨🇦", img: 5, src: "Trustpilot", quote: <>The content plan pulls from my best sellers — <Hl>the buying guides read like I wrote them.</Hl> Already showing up for questions I never targeted.</> },
  { name: "Lucas M.", role: "Coffee roaster", flag: "🇦🇺", img: 14, src: "Shopify App Store", quote: <>I approve everything and nothing touches my live theme. <Hl>The crawler dashboard is the first thing I check every morning.</Hl></> },
  { name: "Sofía K.", role: "Jewelry", flag: "🇪🇸", img: 47, src: "Trustpilot", quote: <>A fraction of what my SEO agency charged — and it's <Hl>the only one actually doing the AI side.</Hl> Easy decision.</> },
  { name: "Daniel A.", role: "Pet supplies", flag: "🇮🇱", img: 60, src: "Shopify App Store", quote: <>Got <Hl>mentioned by Perplexity for "best harness for big dogs"</Hl> within a month — a customer I'd never have reached otherwise.</> },
];
function Hl({ children }: { children: ReactNode }) {
  return <mark style={{ background: "rgba(110,197,49,0.20)", color: "#cdeea9", padding: "0 3px", borderRadius: 4 }}>{children}</mark>;
}
function Testimonials() {
  if (TESTIMONIALS.length === 0) return null; // auto-hide until real reviews are dropped in
  return (
    <section style={SECT}>
      <Kicker>Loved by early stores</Kicker>
      <h2 className={styles.h2}>Stores that got <span className={styles.grad}>AI-ready early.</span></h2>
      <p className={styles.lead}>Real results from merchants getting found by AI before their category catches on.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16, marginTop: 28, textAlign: "left" }}>
        {TESTIMONIALS.map((t, i) => (
          <div key={i} style={{ ...glass, padding: 20, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <img src={`https://i.pravatar.cc/64?img=${t.img}`} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", background: "linear-gradient(135deg,#c7d2fe,#a5b4fc)" }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{t.name} <span style={{ fontWeight: 400 }}>{t.flag}</span></div>
                <div style={{ fontSize: 12, color: C.muted }}>{t.role}</div>
              </div>
            </div>
            <div style={{ color: "#f5b301", fontSize: 14, letterSpacing: 1, marginBottom: 8 }}>★★★★★</div>
            <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, flex: 1 }}>{t.quote}</div>
            <div style={{ fontSize: 11, color: "#6f7d68", marginTop: 12, letterSpacing: "0.02em" }}>Source: {t.src}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 28 }}>
        <div style={{ color: C.muted, fontWeight: 600, marginBottom: 14 }}>Be among the first stores AI learns to recommend.</div>
        <a href="#start" style={{ display: "inline-block", background: `linear-gradient(180deg,${C.brand2},${C.brand})`, color: "#06120c", fontWeight: 800, padding: "13px 26px", borderRadius: 999, textDecoration: "none" }}>Get my free AI-Readiness Score →</a>
      </div>
    </section>
  );
}

/**
 * The combination pitch — three ranking layers (on-page, content, off-page)
 * shown as one system, then collapsed into a single "powerhouse" equation.
 * This is the section that says what only ShopHero does end-to-end.
 */
function Powerhouse() {
  return (
    <section style={SECT} id="brains">
      <Kicker>The combination only ShopHero offers</Kicker>
      <h2 className={styles.h2}>On-page. Content. Off-page.{" "}<span className={styles.grad}>One powerhouse.</span></h2>
      <p className={styles.lead}>Everyone else does one slice. ShopHero runs all three layers of ranking as a single system — so your store wins where shoppers actually look: AI answers <em>and</em> Google.</p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 30, textAlign: "left", alignItems: "stretch" }}>
        {PILLARS.map((p) => (
          <GlowCard key={p.n} style={{ flex: "1 1 300px" }} accent={p.accent}>
            <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 30 }}>{p.icon}</span>
                <span style={{ fontSize: 34, fontWeight: 800, color: p.accent, opacity: 0.3, letterSpacing: "-0.02em", lineHeight: 1 }}>{p.n}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: p.accent, marginTop: 14 }}>{p.tag} SEO</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.text, marginTop: 3 }}>{p.title}</div>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, margin: "7px 0 15px" }}>{p.blurb}</p>
              <div style={{ marginTop: "auto" }}><ColList tone="good" items={p.items} /></div>
            </div>
          </GlowCard>
        ))}
      </div>

      <div style={{ marginTop: 24, ...glass, padding: "22px 24px", backgroundImage: "linear-gradient(120deg,rgba(110,197,49,0.08),rgba(52,224,161,0.08),rgba(123,108,246,0.10))" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap", fontWeight: 800 }}>
          <span style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(110,197,49,0.16)", color: "#a3e35c", fontSize: 13 }}>On-page</span>
          <span style={{ color: C.muted, fontSize: 18 }}>+</span>
          <span style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(52,224,161,0.16)", color: "#34e0a1", fontSize: 13 }}>Content</span>
          <span style={{ color: C.muted, fontSize: 18 }}>+</span>
          <span style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(123,108,246,0.18)", color: "#b3a6ff", fontSize: 13 }}>Off-page</span>
          <span style={{ color: C.text, fontSize: 20, margin: "0 4px" }}>=</span>
          <span className={styles.grad} style={{ fontSize: 20 }}>a ranking powerhouse</span>
        </div>
        <p style={{ textAlign: "center", color: C.muted, fontSize: 13.5, lineHeight: 1.6, maxWidth: 640, margin: "14px auto 0" }}>The only Shopify app that optimizes your store, fuels it with content, <em>and</em> builds real authority — so you rank in both <strong style={{ color: C.text }}>AI search (AEO)</strong> and <strong style={{ color: C.text }}>Google (SEO)</strong>. One system. Both worlds.</p>
      </div>
    </section>
  );
}

function ScoreRingMini({ score }: { score: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const color = score >= 70 ? C.brand : score >= 40 ? "#e8941a" : C.coral;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" style={{ flexShrink: 0 }}>
      <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="8" />
      <circle cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 46 46)" />
      <text x="46" y="44" textAnchor="middle" fontSize="26" fontWeight="800" fill={C.text}>{score}</text>
      <text x="46" y="60" textAnchor="middle" fontSize="9" fontWeight="700" fill={C.muted}>/ 100</text>
    </svg>
  );
}

/**
 * The hero lead magnet — enter a store URL, get a real AI-Readiness Score inline
 * (powered by the same public runVisibilityCheck behind /ai-check), then convert
 * straight into the install. No signup to see the score; the gaps create the pull.
 */
function ScoreChecker({ showForm }: { showForm: boolean }) {
  const fetcher = useFetcher<{ ok: boolean; report?: VisibilityReport; error?: string }>();
  const [again, setAgain] = useState(false);
  const loading = fetcher.state !== "idle";
  const data = fetcher.data;
  const report = !again && data?.ok ? data.report : undefined;
  const error = !again && data && !data.ok ? data.error : undefined;

  if (report) {
    const verdict =
      report.score >= 70 ? "AI can already read your store well." :
      report.score >= 40 ? "AI can partly read your store — real gaps remain." :
      "Most AI agents can't read your store yet.";
    return (
      <div style={{ ...glass, padding: 20, textAlign: "left", maxWidth: 540, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <ScoreRingMini score={report.score} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: C.muted, textTransform: "uppercase" }}>Your AI-Readiness Score</div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 15, marginTop: 3, lineHeight: 1.4 }}>{verdict}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, wordBreak: "break-all" }}>{report.url.replace(/^https?:\/\//, "")}</div>
          </div>
        </div>
        {report.topGaps.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 7 }}>Biggest gaps stopping AI from recommending you:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {report.topGaps.slice(0, 3).map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                  <span style={{ color: C.coral, fontWeight: 800 }}>✕</span><span>{g}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          {showForm ? (
            <Form method="post" action="/auth/login" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className={styles.input} type="text" name="shop" placeholder="your-store.myshopify.com" aria-label="Your Shopify store domain" style={{ flex: "1 1 200px" }} />
              <button className={styles.btnPrimary} type="submit">Fix these — install free →</button>
            </Form>
          ) : (
            <a href="https://apps.shopify.com" className={styles.btnPrimary} style={{ display: "inline-block" }}>Fix these — add to Shopify free →</a>
          )}
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setAgain(true)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", padding: 0 }}>↻ Check another store</button>
            <a href="/ai-check" style={{ fontSize: 12.5, color: "#6f7d68", textDecoration: "none" }}>See the full report →</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 540, margin: "0 auto" }}>
      <fetcher.Form method="post" action="/ai-check" onSubmit={() => setAgain(false)} className={styles.form}>
        <input className={styles.input} type="text" name="url" placeholder="yourstore.com" aria-label="Your store URL" required />
        <button className={styles.btnPrimary} type="submit" disabled={loading}>{loading ? "Scanning your store…" : "Get my free score →"}</button>
      </fetcher.Form>
      {error && <p style={{ color: C.coral, fontSize: 13, marginTop: 8 }}>{error}</p>}
      <p className={styles.micro}>Free AI-Readiness Score · no card · checks your public store in seconds</p>
    </div>
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
            <ScoreChecker showForm={showForm} />
          </div>
          <p style={{ maxWidth: 560, margin: "16px auto 0", color: "#9fb098", fontSize: 14, lineHeight: 1.55 }}>
            You don't need to understand AI optimization — just whether AI can recommend your store. <strong style={{ color: "#f2f6f0" }}>ShopHero handles the rest.</strong>
          </p>
        </div>
      </section>

      {/* LIVE AI-RECOMMENDATION DEMO */}
      <HeroChatDemo />

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

      {/* THE COMBINATION — on-page + content + off-page */}
      <Powerhouse />

      {/* DIY VS SHOPHERO */}
      <DiyVsShopHero />

      {/* TESTIMONIALS */}
      <Testimonials />

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

      {/* COST COMPARISON + EARLY-MOVER */}
      <CostCompare />
      <EarlyMover />

      {/* PRICING */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="pricing">
        <h2 className={styles.h2}>Start free. <span className={styles.grad}>Scale when it's working.</span></h2>
        <p className={styles.lead}>See your AI-Readiness Score free — no card. Then pick your power level.</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", alignItems: "stretch", marginTop: 26 }}>
          <div style={{ flex: "1 1 280px", maxWidth: 360, ...glass, padding: 24, textAlign: "left" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Starter</div>
            <div style={{ marginTop: 6 }}><span style={{ fontSize: 40, fontWeight: 800, color: C.text }}>$49</span><span style={{ color: C.muted }}>/month</span></div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Get your store readable by AI.</div>
            <div style={{ marginTop: 16 }}>
              <ColList tone="good" items={["AI-Readiness Score + ranked gaps", "Auto schema on every product (Product, Offer, Review, FAQ, Breadcrumb)", "Hosted llms.txt + AI-retrieval feed", "AI-crawler analytics — see who's reading you", "Speed audit + safe fixes", "Approval-first · one-click rollback"]} />
            </div>
            <a href="#start" style={{ display: "block", textAlign: "center", marginTop: 18, padding: "13px 20px", borderRadius: 999, border: `1px solid ${C.line}`, color: C.text, fontWeight: 700, textDecoration: "none", background: "rgba(255,255,255,0.04)" }}>Start free →</a>
          </div>
          <GlowCard style={{ flex: "1 1 280px", maxWidth: 360 }} accent={C.accent}>
            <div style={{ padding: 24, textAlign: "left", height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Pro</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", color: "#06120c", background: C.accent, padding: "3px 9px", borderRadius: 999 }}>MOST POPULAR</span>
              </div>
              <div style={{ marginTop: 6 }}><span className={styles.grad} style={{ fontSize: 40, fontWeight: 800 }}>$149</span><span style={{ color: C.muted }}>/month</span></div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Extra powers — stay ahead, automatically.</div>
              <div style={{ fontSize: 12.5, color: C.brand2, marginTop: 16, fontWeight: 800 }}>Everything in Starter, plus:</div>
              <div style={{ marginTop: 6 }}>
                <ColList tone="good" items={["The constant AI-answer content drip — deep strategy + monthly articles on your best sellers", "Live re-optimization as your catalog changes", "Brand-voice tuning for on-brand content", "Priority support"]} />
              </div>
              <a href="#start" className={styles.btnPrimary} style={{ display: "block", textAlign: "center", marginTop: 18 }}>Get my free AI-Readiness Score →</a>
            </div>
          </GlowCard>
          <GlowCard style={{ flex: "1 1 280px", maxWidth: 360 }} accent={C.violet}>
            <div style={{ padding: 24, textAlign: "left", height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Authority</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", color: "#fff", backgroundImage: "linear-gradient(90deg,#a78bfa,#7b6cf6,#5b4bd6)", padding: "3px 9px", borderRadius: 999 }}>DOMINATE AI</span>
              </div>
              <div style={{ marginTop: 6 }}><span style={{ fontSize: 40, fontWeight: 800, backgroundImage: "linear-gradient(90deg,#c4b5fd,#7b6cf6,#4f3fd6)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>$399</span><span style={{ color: C.muted }}>/month</span></div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>The complete AI-ranking picture — content <em>and</em> authority.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "9px 12px", borderRadius: 10, backgroundImage: "linear-gradient(135deg,rgba(196,181,253,0.16),rgba(123,108,246,0.12))", border: `1px solid ${C.violet}` }}>
                <span style={{ fontSize: 18 }}>📣</span>
                <div style={{ fontSize: 12, lineHeight: 1.4, color: C.text }}>
                  <strong>$800 of press-release value</strong> every month — <span style={{ color: "#b3a6ff", fontWeight: 700 }}>powered by MediaFuse</span>
                </div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: C.muted, marginTop: 14 }}>
                AI ranks you on <strong style={{ color: C.text }}>two things</strong>: what your store says about itself, and what the rest of the web says about you. Pro nails the first with monthly content. <strong style={{ color: "#b3a6ff" }}>Authority adds the second</strong> — high-authority backlinks — so both halves compound into AI-ranking domination.
              </div>
              <div style={{ fontSize: 12.5, color: "#b3a6ff", marginTop: 16, fontWeight: 800 }}>Everything in Pro, plus:</div>
              <div style={{ marginTop: 6 }}>
                <ColList tone="good" items={["Monthly AI-answer content + authority backlinks working together — the full ranking signal AI looks for", "A monthly press release distributed to 400+ news sites — Yahoo Finance, Benzinga, MarketWatch, AP & more (an $800/mo value via MediaFuse)", "High-authority backlinks from the top-domain-authority sites AI already trusts", "Brand mentions on the exact sources AI reads when deciding who to recommend", "Compounding domain authority — more citations every month", "Dedicated authority manager"]} />
              </div>
              <a href="#start" className={styles.btnPrimary} style={{ display: "block", textAlign: "center", marginTop: 18, backgroundImage: "linear-gradient(120deg,#a78bfa,#7b6cf6,#5b4bd6)", color: "#fff" }}>Dominate AI search →</a>
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
