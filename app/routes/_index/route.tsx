import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "ShopHero — Be the Shopify store AI agents recommend" },
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
  { icon: "🤖", name: "Agent-Ready (the hero)", desc: "A hosted llms.txt, a retrieval-tuned product feed, and conversation-friendly Q&A descriptions — the exact things ChatGPT, Claude, Gemini & Perplexity read before they recommend a store. Served from ShopHero and kept live as your catalog changes." },
  { icon: "📐", name: "Structured Data", desc: "Auto-adds and maintains Product, Offer, Review, FAQ & Breadcrumb schema on every page — so AI and Google can actually parse what you sell, and you win rich results." },
  { icon: "✍️", name: "AI-Answer Content", desc: "An ongoing drip of answer-shaped buying guides and product Q&A — schema'd and linked to your products — the depth AI engines pull from when shoppers ask what to buy." },
  { icon: "📈", name: "AI-Crawler Analytics", desc: "See exactly which AI bots (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are fetching your store — real logs, not vanity metrics — and watch your readiness score climb." },
  { icon: "⚡", name: "Speed & Foundations", desc: "Core Web Vitals audit, image and lazy-load fixes, and a clean technical base — because slow, broken stores get demoted by both Google and AI." },
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
    a: "Your AI-Readiness Score is free - no card. Pro is $99/month and includes your hosted llms.txt + AI-retrieval feed, auto schema on every product, monthly AI-answer content, AI-crawler analytics, speed fixes, and live re-optimization. 14-day free trial, cancel anytime from Shopify.",
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
          <span className={styles.badge}>✦ Built for the AI shopping era</span>
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
            <span className={styles.nowrap}>Be the store</span>{" "}
            <span className={styles.grad}>AI agents recommend.</span>
          </h1>
          <p className={styles.sub}>
            Shoppers are starting to ask <strong>ChatGPT, Claude &amp; Perplexity</strong> what to buy.
            ShopHero makes your store <strong>fast, structured, and readable by AI</strong> — so when an
            agent answers, <strong>it picks you</strong>, not your competitor.
          </p>
          <div className={styles.brainsLine}>
            <span className={styles.brainsCount}>🤖 Agent-ready in minutes</span>
            <span>see your free AI-Readiness Score first</span>
          </div>
          <div id="start" className={styles.startBlock}>
            <StartForm />
            <p className={styles.micro}>Free AI-Readiness Score · Installs in 30 seconds · You approve every change</p>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <span className={styles.statIcon}>📊</span>
              <strong className={styles.statBig}>0–100</strong>
              <span className={styles.statLabel}>your AI-Readiness Score</span>
              <span className={styles.statVs}>free, in 30 seconds</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statIcon}>🤖</span>
              <strong className={styles.statBig}>Auto</strong>
              <span className={styles.statLabel}>schema · retrieval feed · llms.txt</span>
              <span className={styles.statVs}>vs <s>invisible to AI</s></span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statIcon}>📈</span>
              <strong className={styles.statBig}>Live</strong>
              <span className={styles.statLabel}>AI-crawler tracking</span>
              <span className={styles.statVs}>see who reads your store</span>
            </div>
          </div>
        </div>
      </section>

      {/* CREDIBILITY */}
      <section className={styles.strip}>
        <p className={styles.stripLead}>
          The new search box is <span className={styles.grad}>AI.</span>
        </p>
        <p className={styles.stripSub}>
          More shoppers start with <strong>ChatGPT, Claude, Perplexity and Google's AI</strong> instead of a search bar —
          and those agents only recommend stores they can <strong>read and trust</strong>. Most Shopify stores are
          invisible to them. ShopHero fixes that: <strong>structured data, a retrieval-tuned product feed, and an
          llms.txt</strong> AI crawlers actually use — kept live as your catalog changes, and tracked so you can see
          which AI bots are reading your store.
        </p>
      </section>

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
        <h2 className={styles.h2}>Your <span className={styles.grad}>Agent-Ready stack</span></h2>
        <p className={styles.lead}>
          Everything that makes AI shopping agents read, trust, and recommend your store -
          built, hosted, and kept live for you.
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

      {/* PRICING */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="pricing">
        <h2 className={styles.h2}>One subscription. <span className={styles.grad}>Always-on AI discoverability.</span></h2>
        <p className={styles.lead}>Start free with your AI-Readiness Score. Upgrade when you want ShopHero keeping you agent-ready every day.</p>
        <div className={styles.priceCard}>
          <div className={styles.priceHead}>
            <span className={styles.priceName}>Pro</span>
            <div className={styles.price}><span className={styles.priceAmt}>$99</span><span className={styles.pricePer}>/month</span></div>
          </div>
          <ul className={styles.priceList}>
            <li>Hosted <strong>llms.txt + AI-retrieval product feed</strong></li>
            <li>Auto <strong>schema on every PDP</strong> (Product, Offer, Review, FAQ, Breadcrumb)</li>
            <li><strong>AI-answer content</strong> — guides &amp; product Q&amp;A every month</li>
            <li><strong>AI-crawler analytics</strong> — see GPTBot, ClaudeBot &amp; Perplexity read you</li>
            <li>Live re-optimization as your catalog changes</li>
            <li>Speed audit + safe fixes · approval-first · one-click rollback</li>
            <li className={styles.priceNote}>Free AI-Readiness Score to start - no card. 14-day trial on Pro.</li>
          </ul>
          <a href="#start" className={styles.btnPrimary}>Get my free AI-Readiness Score →</a>
          <p className={styles.micro}>Start free. Cancel anytime, right from Shopify.</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={styles.finalCta}>
        <span className={styles.kicker}>Get discoverable in the AI era</span>
        <h2 className={styles.h2}>Be the store AI recommends - before your <span className={styles.grad}>competitor</span> is.</h2>
        <p className={styles.lead}>When a shopper asks an AI what to buy, one store gets named. Make it yours.</p>
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
