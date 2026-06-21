import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "ShopHero - The AI growth team for your Shopify store" },
  {
    name: "description",
    content:
      "ShopHero is the AI growth team for your Shopify store. It diagnoses your store like a business, shows you a Revenue Leak Map, and fixes what's costing you sales - every day. The operating system for Shopify growth.",
  },
  { property: "og:title", content: "ShopHero - The AI growth team for your Shopify store" },
  {
    property: "og:description",
    content:
      "Your store, diagnosed like a business. A Revenue Leak Map of what's costing you sales - fixed automatically, every day. The operating system for Shopify growth.",
  },
  { property: "og:type", content: "website" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Shopify install / embedded entry - hand off to the app.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const BRAINS = [
  { icon: "🎯", name: "Conversion (CRO)", desc: "Studies how shoppers really move through your store, then rebuilds layout, offers, trust and checkout to erase hesitation and lift every conversion." },
  { icon: "🛍️", name: "Product Pages", desc: "Engineers each page around proven buying psychology - hero, benefits, proof, objection-busting, CTA - so far more visitors hit add-to-cart." },
  { icon: "✍️", name: "Content", desc: "Plans and writes search-winning articles that pull in ready-to-buy traffic and route it straight to the products that make you money." },
  { icon: "🔍", name: "SEO", desc: "Maps the exact terms your buyers search, then fixes on-page and technical SEO so you rank where the purchases actually happen." },
  { icon: "✉️", name: "Email", desc: "Builds the flows top brands live on - welcome, abandoned cart, win-back - to recover lost sales and turn one-time buyers into regulars." },
  { icon: "🤖", name: "AI Visibility (AEO)", desc: "Structures your store so ChatGPT, Claude, Gemini and Perplexity understand it - and recommend you when shoppers ask them what to buy." },
  { icon: "⚡", name: "Speed", desc: "Hunts down every drag - heavy images, app bloat, render-blocking code - and tunes Core Web Vitals so pages load fast and sell." },
];

const MOMENTS = [
  {
    n: "1",
    icon: "👁️",
    title: "It sees your store like a senior expert",
    desc: "Not just pages - it understands your entire business. In minutes it finds what's quietly killing your conversions, SEO and revenue.",
    tone: "find" as const,
    examples: [
      "Conversion 1.8% vs ~3% benchmark",
      "Mobile loads in 4.2s - too slow",
      "Only 22% of pages SEO-ready",
      "9 product pages with weak copy",
    ],
  },
  {
    n: "2",
    icon: "💸",
    title: "It tells you exactly what's wrong - in money terms",
    desc: "Not advice. Not theory. Real numbers and a hit-list ranked by impact, so you always fix what matters first.",
    tone: "loss" as const,
    examples: [
      "Product page: ~18% lost conversions",
      "Slow images: ~11% mobile drop-off",
      "No cart recovery: ~9% revenue left",
      "Thin SEO: ~14% fewer clicks",
    ],
  },
  {
    n: "3",
    icon: "⚡",
    title: "It fixes it instantly",
    desc: "Click once. Your store updates like a senior dev + CRO team just shipped a whole sprint overnight. Every change is reversible.",
    tone: "gain" as const,
    examples: [
      "+23% add-to-cart",
      "+14% conversion rate",
      "+31% organic clicks",
      "−1.4s load time",
    ],
  },
];

const FIRST_5 = [
  {
    icon: "🧠",
    title: "It scans your entire store",
    desc: "Theme, product pages, SEO, speed and conversion leaks - read end to end, the way a senior consultant would.",
  },
  {
    icon: "📊",
    title: "It shows you a Revenue Leak Map",
    desc: "Exactly what's losing you money - and how much each issue is costing, ranked so the biggest leaks surface first.",
  },
  {
    icon: "⚡",
    title: "It builds your first upgrade plan",
    desc: "Every fix ordered by revenue impact and ready to execute - no blank page, no “where do I start?”.",
  },
  {
    icon: "🛠️",
    title: "You hit “Fix All” - or approve what you want",
    desc: "Changes are staged and fully reversible. Nothing goes live without your OK, and any change rolls back in one click.",
  },
];

const LEAK_MAP = [
  { issue: "Slow product images", detail: "LCP ~2.1s on mobile", sev: "High", impact: "~$420/mo" },
  { issue: "Weak product descriptions", detail: "12 pages, manufacturer copy", sev: "High", impact: "~$310/mo" },
  { issue: "No abandoned-cart flow", detail: "recoverable revenue leaking", sev: "Medium", impact: "~$180/mo" },
  { issue: "Missing trust signals", detail: "no reviews / guarantees above fold", sev: "Medium", impact: "~$140/mo" },
  { issue: "Thin meta titles", detail: "8 pages under-optimized", sev: "Low", impact: "~$60/mo" },
];

const BADGES = [
  { lines: ["Powered by", "Claude AI"], sub: "ANTHROPIC ENGINE", c1: "#5fb024", c2: "#34e0a1" },
  { lines: ["Agentic-AI", "Ready"], sub: "OPTIMIZED FOR AI SEARCH", c1: "#7b6cf6", c2: "#9d7bff" },
  { lines: ["Replaces", "5–10 Apps"], sub: "ALL-IN-ONE VALUE", c1: "#1ca7c4", c2: "#34e0a1" },
  { lines: ["7 Specialist", "AI Brains"], sub: "CRO · SEO · CONTENT", c1: "#e8941a", c2: "#ffce54" },
  { lines: ["One-Click", "Rollback"], sub: "100% REVERSIBLE", c1: "#e0457f", c2: "#f472b6" },
  { lines: ["Approval", "First"], sub: "YOU APPROVE EVERYTHING", c1: "#2f74e0", c2: "#60a5fa" },
  { lines: ["30-Second", "Setup"], sub: "INSTALL & GO", c1: "#cf6242", c2: "#f0a07c" },
];

const FEATURES = [
  {
    icon: "🧠",
    title: "AI Store Manager",
    desc: "Hit “Improve My Store” → it ranks every fix by revenue impact, then executes the ones you approve. Audit → plan → ship.",
  },
  {
    icon: "🛍️",
    title: "Product pages that sell more",
    desc: "It rebuilds the page around how people actually buy - structure, copy, trust and CTA - using conversion patterns from high-performing Shopify stores. (Rewriting is just the mechanism.)",
  },
  {
    icon: "🕓",
    title: "Version history & rollback",
    desc: "Every edit is versioned. Hate a change? Roll the entire store back in one click. Zero risk, infinite undo.",
  },
  {
    icon: "🎨",
    title: "Brand Kit & memory",
    desc: "It learns your voice, your audience and your rules once - then never goes off-brand again. No re-explaining yourself.",
  },
  {
    icon: "📅",
    title: "Daily content plan",
    desc: "It drafts on-brand articles every day. You tap approve. Agency-level output without the agency invoice.",
  },
  {
    icon: "📡",
    title: "Store radar",
    desc: "A daily report quietly surfaces what's costing you sales - so problems get caught before they cost you a month.",
  },
];

const COMPARE_ROWS: [string, string][] = [
  ["Hire a Shopify developer", "Build features, sections & theme changes with a prompt"],
  ["Pay for SEO experts", "One-click SEO optimization across your entire store"],
  ["Hire a CRO consultant", "Instant conversion audits & optimization recommendations"],
  ["Hire a content writer", "Generate product descriptions, blogs, landing pages & FAQs"],
  ["Pay an email marketer", "Create campaigns, abandoned-cart flows & newsletters"],
  ["Hire a UX designer", "Improve layouts, navigation & customer experience instantly"],
  ["Pay for speed optimization", "One-click store speed improvements & diagnostics"],
  ["Hire a data analyst", "Ask questions in plain English, get answers instantly"],
  ["Hire a merchandising expert", "Discover winning products, bundles & upsell opportunities"],
  ["Pay for store audits", "Full AI-powered store health checks, anytime"],
  ["Spend hours researching competitors", "Instant competitor analysis & insights"],
  ["Hire a marketing consultant", "AI-generated growth & campaign recommendations"],
  ["Hire a landing-page builder", "Create landing pages in minutes"],
  ["Learn Shopify Liquid code", "Describe what you want and let ShopHero build it"],
  ["Wait days or weeks for changes", "Get results in minutes"],
  ["Pay agency retainers", "Your AI ecommerce team, available 24/7"],
  ["Juggle 10 different apps", "One platform that does it all"],
  ["Guess what’s hurting sales", "Know exactly what to fix and why"],
  ["Spend thousands on specialists", "One AI that works across every part of your store"],
  ["Manage developers, marketers & consultants", "Manage everything from one dashboard"],
];

function ShopifyMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="#95BF47"
        d="M15.3 4.3c-.1 0-.3 0-.5.1-.3-.9-.9-1.7-1.9-1.7h-.1C12.5 2.3 12.1 2 11.7 2 8.7 2 7.3 5.7 6.8 7.6l-2 .6c-.6.2-.7.2-.7.8L2.5 21.3 14 23l6.3-1.4S15.4 4.3 15.3 4.3zM12.4 5.2l-1.1.3c0-.2 0-.4 0-.6 0-.6-.1-1.1-.2-1.5.6.1 1 .8 1.3 1.8zm-2-1.6c.2.4.3 1 .3 1.7v.2l-2.3.7c.4-1.5 1.2-2.3 2-2.6zM9.7 3c.1 0 .3 0 .4.1-1 .5-2 1.6-2.5 3.9l-1.8.6c.5-1.7 1.7-4.6 3.9-4.6z"
      />
      <path
        fill="#5E8E3E"
        d="M15.3 4.3c-.1 0-.3 0-.5.1l-.8 12.6 6.3-1.4S15.4 4.3 15.3 4.3z"
      />
      <path
        fill="#fff"
        d="M11.9 9.1l-.7 2.1s-.6-.3-1.4-.3c-1.1 0-1.2.7-1.2.9 0 1 2.6 1.4 2.6 3.7 0 1.8-1.2 3-2.7 3-1.9 0-2.8-1.2-2.8-1.2l.5-1.6s1 .8 1.8.8c.5 0 .7-.4.7-.7 0-1.3-2.1-1.4-2.1-3.5 0-1.8 1.3-3.5 3.9-3.5 1 0 1.5.3 1.5.3z"
      />
    </svg>
  );
}

function ClaudeMark() {
  // Anthropic-style sunburst spark
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true" focusable="false">
      <g stroke="#D97757" strokeWidth="3" strokeLinecap="round">
        <line x1="16" y1="3" x2="16" y2="29" />
        <line x1="3" y1="16" x2="29" y2="16" />
        <line x1="6.6" y1="6.6" x2="25.4" y2="25.4" />
        <line x1="25.4" y1="6.6" x2="6.6" y2="25.4" />
      </g>
    </svg>
  );
}

function AwardBadge({
  lines,
  sub,
  c1,
  c2,
  idx,
}: {
  lines: string[];
  sub: string;
  c1: string;
  c2: string;
  idx: number;
}) {
  const rg = `rg${idx}`;
  const sh = `sh${idx}`;
  return (
    <svg
      className={styles.badgeSvg}
      viewBox="0 0 200 250"
      role="img"
      aria-label={`${lines.join(" ")} - ${sub}`}
    >
      <defs>
        <linearGradient id={rg} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <filter id={sh} x="-25%" y="-10%" width="150%" height="140%">
          <feDropShadow dx="0" dy="9" stdDeviation="9" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* back shield = colored bottom ribbon + point */}
      <g filter={`url(#${sh})`}>
        <path
          d="M22 16 a12 12 0 0 1 12 -12 H166 a12 12 0 0 1 12 12 V198 L100 240 L22 198 Z"
          fill={`url(#${rg})`}
        />
      </g>

      {/* white body on top (shorter point → reveals colored ribbon below) */}
      <path
        d="M22 16 a12 12 0 0 1 12 -12 H166 a12 12 0 0 1 12 12 V176 L100 214 L22 176 Z"
        fill="#ffffff"
      />

      {/* header row */}
      <text x="34" y="26" fontSize="11" fontWeight="800" fill="#16181c" letterSpacing="0.5">
        SHOPHERO
      </text>
      <text x="34" y="41" fontSize="11" fontWeight="700" fill="#8a8a96" letterSpacing="0.5">
        2026
      </text>
      <rect x="138" y="6" width="38" height="38" rx="5" fill={c1} />
      <text x="157" y="32" textAnchor="middle" fontSize="20" fontWeight="800" fill="#ffffff">
        ✦
      </text>
      <line x1="22" y1="54" x2="178" y2="54" stroke="#e9e9ee" strokeWidth="1.5" />

      {/* big bold title */}
      <text
        x="100"
        y={lines.length > 1 ? 104 : 120}
        textAnchor="middle"
        fontSize="24"
        fontWeight="800"
        fill="#15171c"
      >
        {lines[0]}
      </text>
      {lines[1] && (
        <text x="100" y="132" textAnchor="middle" fontSize="24" fontWeight="800" fill="#15171c">
          {lines[1]}
        </text>
      )}

      {/* subtitle */}
      <text x="100" y="162" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#9a9aa6" letterSpacing="0.8">
        {sub}
      </text>
    </svg>
  );
}

export default function Landing() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      {/* NAV */}
      <header className={styles.nav}>
        <a href="#top" className={styles.brand}>
          <img src="/ShopHero.png" alt="" className={styles.navLogo} /> ShopHero
        </a>
        <nav className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#compare">Old way vs ShopHero</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <a href="#start" className={styles.navCta}>
          Add to Shopify
        </a>
      </header>

      {/* HERO */}
      <section className={styles.hero} id="top">
        <div className={styles.heroInner}>
          <span className={styles.badge}>✦ A new dawn for Shopify store owners</span>

          <div className={styles.lockup}>
            <span className={styles.logoChip}>
              <ShopifyMark />
              <span>Shopify</span>
            </span>
            <span className={styles.plus}>+</span>
            <span className={styles.logoChip}>
              <ClaudeMark />
              <span>Claude</span>
            </span>
            <span className={styles.lockupBreak} aria-hidden="true" />
            <span className={styles.plus}>=</span>
            <span className={styles.lockupBreak} aria-hidden="true" />
            <span className={`${styles.logoChip} ${styles.logoChipResult}`}>
              <img src="/ShopHero.png" alt="" className={styles.chipLogo} />
              <span>ShopHero</span>
            </span>
          </div>

          <h1 className={styles.h1}>
            <span className={styles.nowrap}>Unleash the power of Claude AI</span>
            <br />
            <span className={styles.grad}>inside your Shopify store.</span>
          </h1>
          <p className={styles.sub}>
            Turn <em>“I don't know what's broken”</em> into{" "}
            <strong>fixed, optimized, and selling more</strong> - in minutes. No
            developers. No agencies. No guessing. Just describe what you want, and
            ShopHero builds it.
          </p>
          <div className={styles.brainsLine}>
            <span className={styles.brainsCount}>🧠 7 expert brains</span>
            <span>trained on multi-million-figure shops</span>
          </div>

          <div id="start" className={styles.startBlock}>
            {showForm ? (
              <Form className={styles.form} method="post" action="/auth/login">
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  aria-label="Your Shopify store domain"
                />
                <button className={styles.btnPrimary} type="submit">
                  Upgrade my store →
                </button>
              </Form>
            ) : (
              <a href="https://apps.shopify.com" className={styles.btnPrimary}>
                Add to Shopify →
              </a>
            )}
            <p className={styles.micro}>
              Installs in 30 seconds · Every change needs your approval · One-click rollback
            </p>
          </div>

          <div className={styles.heroStats}>
            <div>
              <span className={styles.statIcon}>⚡</span>
              <strong>30 seconds</strong>
              <span>to ship a change - not a 3-week developer queue</span>
            </div>
            <div>
              <span className={styles.statIcon}>💸</span>
              <strong>~$0.3 per task</strong>
              <span>instead of $30/hour for a freelancer</span>
            </div>
            <div>
              <span className={styles.statIcon}>🧠</span>
              <strong>Always on, 24/7</strong>
              <span>like a 10-person team - with zero salaries</span>
            </div>
          </div>
        </div>
      </section>

      {/* CREDIBILITY */}
      <section className={styles.strip}>
        <p className={styles.stripLead}>
          The first Shopify app that does anything you can dream of.
          <br />
          <span className={styles.grad}>Agency-level growth, without the agency.</span>
        </p>
        <p className={styles.stripSub}>
          In a fraction of a second, at a fraction of the cost. Just say what you want, and
          watch the magic happen. It replicates the output of a{" "}
          <strong>$10K/month growth team</strong>, replaces the fragmented stack of{" "}
          <strong>5-10 apps and freelancers</strong> you're juggling today, and brings your store
          the design, optimization and analytics playbooks of{" "}
          <strong>multi-million-dollar stores</strong> - every task executed by models trained on
          what the <strong>industry's top shops</strong> actually do.
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

      {/* HOW IT WORKS - 3 MOMENTS */}
      <section className={styles.section} id="how">
        <h2 className={styles.h2}>How <span className={styles.grad}>ShopHero</span> works</h2>
        <p className={styles.lead}>
          Your store stops acting like a hobby - in three moments.
        </p>
        <div className={styles.moments}>
          {MOMENTS.map((m) => {
            const chipCls =
              m.tone === "loss"
                ? styles.chipLoss
                : m.tone === "gain"
                  ? styles.chipGain
                  : styles.chipFind;
            return (
              <div className={styles.moment} key={m.n}>
                <div className={styles.momentTop}>
                  <span className={styles.momentNum}>{m.n}</span>
                  <span className={styles.momentIcon}>{m.icon}</span>
                </div>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
                <div className={styles.momentStats}>
                  {m.examples.map((e) => (
                    <span className={`${styles.statChip} ${chipCls}`} key={e}>
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className={styles.illustrative}>Illustrative examples - your numbers depend on your store.</p>
      </section>

      {/* AFTER YOU INSTALL - FIRST 5 MINUTES */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="after-install">
        <h2 className={styles.h2}>After you install <span className={styles.grad}>ShopHero</span></h2>
        <p className={styles.lead}>Here's exactly what happens in the first 5 minutes.</p>
        <div className={styles.install}>
          {FIRST_5.map((s, i) => (
            <div className={styles.installStep} key={s.title}>
              <span className={styles.installNum}>{i + 1}</span>
              <span className={styles.installIcon}>{s.icon}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.installResult}>
          👉 Your store is already improving <strong>before you finish setup.</strong>
        </div>
      </section>

      {/* REVENUE LEAK MAP - BREAKTHROUGH */}
      <section className={styles.section} id="leak-map">
        <div className={styles.centerRow}>
          <span className={styles.kicker}>📊 The breakthrough</span>
        </div>
        <h2 className={styles.h2}>
          Where most apps only diagnose,{" "}
          <span className={styles.grad}>ShopHero fixes - in one click.</span>
        </h2>
        <div className={styles.leakMapWrap}>
          <div className={styles.leakMapText}>
            <p className={styles.leakMapLead}>
              Most apps tell you what they did. ShopHero shows you what's{" "}
              <strong>wrong, why, and what it's costing you</strong> - a live{" "}
              <strong>Revenue Leak Map</strong> that ranks every issue by the money
              it's quietly draining, so you always know the next most profitable move.
            </p>
            <ul className={styles.leakMapPoints}>
              <li>Every issue ranked by revenue impact</li>
              <li>Real money attached - not a vague “score”</li>
              <li>One tap turns any leak into a fix</li>
            </ul>
          </div>

          {/* MOCK MAP */}
          <div className={styles.mapCard}>
            <div className={styles.mapHead}>
              <span>Revenue Leak Map</span>
              <span className={styles.mapTag}>Example</span>
            </div>
            {LEAK_MAP.map((l) => (
              <div className={styles.mapRow} key={l.issue}>
                <span
                  className={`${styles.sevDot} ${
                    l.sev === "High" ? styles.sevHigh : l.sev === "Medium" ? styles.sevMed : styles.sevLow
                  }`}
                />
                <div className={styles.mapInfo}>
                  <strong>{l.issue}</strong>
                  <span>{l.detail}</span>
                </div>
                <span className={styles.mapImpact}>{l.impact}</span>
              </div>
            ))}
            <div className={styles.mapFoot}>
              <span>Est. recoverable</span>
              <strong>~$1,110/mo</strong>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="compare">
        <h2 className={styles.h2}>One app replaces your <span className={styles.grad}>entire payroll.</span></h2>
        <p className={styles.lead}>
          Every line below used to be a hire, a retainer, or another app. Now it’s a prompt.
        </p>
        <div className={styles.compareTable}>
          <div className={styles.compareHead}>
            <div className={styles.headCell}>
              <span className={styles.tagOld}>✕ Without ShopHero</span>
            </div>
            <div className={`${styles.headCell} ${styles.headCellNew}`}>
              <span className={styles.tagNew}>✓ With ShopHero</span>
            </div>
          </div>
          {COMPARE_ROWS.map(([without, withSh]) => (
            <div className={styles.compareRow} key={without}>
              <span className={styles.cellOld}>
                <span className={styles.x}>✕</span>
                {without}
              </span>
              <span className={styles.cellNew}>
                <span className={styles.check}>✓</span>
                {withSh}
              </span>
            </div>
          ))}
        </div>
        <p className={styles.compareMore}>…and endless more options.</p>
      </section>

      {/* FEATURES */}
      <section className={styles.section} id="features">
        <h2 className={styles.h2}>Everything a growth team does - <span className={styles.grad}>without the team.</span></h2>
        <div className={styles.grid}>
          {FEATURES.map((f) => (
            <div className={styles.card} key={f.title}>
              <div className={styles.cardIcon}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI GROWTH TEAM */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="brains">
        <h2 className={styles.h2}>Your <span className={styles.grad}>AI Growth Plan</span></h2>
        <p className={styles.lead}>
          Every part of your store gets a specialist-level AI, trained on the patterns
          behind high-performing ecommerce brands - each one delivering the smartest move
          for its job, and learnable with your own playbook.
        </p>
        <div className={styles.brainGrid}>
          {BRAINS.map((b) => (
            <div className={styles.brain} key={b.name}>
              <span className={styles.brainIcon}>{b.icon}</span>
              <div>
                <strong>{b.name}</strong>
                <p>{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AGENTIC AI SEARCH (AEO) */}
      <section className={styles.section} id="aeo">
        <div className={styles.centerRow}>
          <span className={styles.kicker}>🔥 New Feature - built for what's next</span>
        </div>
        <h2 className={styles.h2}>
          Ecommerce is changing
          <br />
          <span className={styles.grad}>optimize your store for Agentic AI search.</span>
        </h2>
        <p className={styles.lead}>
          The future of ecommerce isn't just Google - it's AI shopping agents. ShopHero
          makes your store the one they recommend.
        </p>
        <div className={styles.aeoCard}>
          <p className={styles.aeoLead}>
            In <strong>one click</strong>, ShopHero restructures your products, data and
            content so AI assistants - ChatGPT, Claude, Gemini, Perplexity and Shopify's
            own AI - can read, trust and <strong>recommend your store</strong> when
            shoppers ask them what to buy.
          </p>
          <div className={styles.aeoChips}>
            <span>Rich product attributes</span>
            <span>Structured data &amp; schema</span>
            <span>AI-readable FAQs</span>
            <span>Comparison content</span>
            <span>Recommendation keywords</span>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="pricing">
        <h2 className={styles.h2}>One subscription. <span className={styles.grad}>Your entire growth team.</span></h2>
        <p className={styles.lead}>
          One plan. No surprises. Cancel the second it stops paying for itself
          (spoiler: it won’t).
        </p>
        <div className={styles.priceCard}>
          <div className={styles.priceHead}>
            <span className={styles.priceName}>Managed AI</span>
            <div className={styles.price}>
              <span className={styles.priceAmt}>$49</span>
              <span className={styles.pricePer}>/month*</span>
            </div>
          </div>
          <ul className={styles.priceList}>
            <li>All 7 AI brains & every one-click tool</li>
            <li>AI Store Manager - audit, plan & execute</li>
            <li>Version history & one-click rollback</li>
            <li>Brand Kit, long-term memory & daily content plan</li>
            <li>
              <strong>$15 of AI usage included</strong> every month
            </li>
            <li>
              Heavy month? Usage tops up in $50 blocks - always on positive credit,
              capped so you’re never surprised <em>(a limit, not a charge)</em>
            </li>
          </ul>
          <a href="#start" className={styles.btnPrimary}>
            Claim my unfair advantage →
          </a>
          <p className={styles.micro}>No gimmicks. Cancel anytime, right from Shopify.</p>
          <p className={styles.priceFootnote}>
            * Plus additional AI usage - $15 included each month, then capped
            pay-as-you-go top-ups (you're always billed only for what you use).
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={styles.finalCta}>
        <span className={styles.kicker}>The operating system for Shopify growth</span>
        <h2 className={styles.h2}>Install this before your <span className={styles.grad}>competitors</span> do.</h2>
        <p className={styles.lead}>
          They're reading the same page. The only question is who clicks first.
        </p>
        {showForm ? (
          <Form className={styles.form} method="post" action="/auth/login">
            <input
              className={styles.input}
              type="text"
              name="shop"
              placeholder="your-store.myshopify.com"
              aria-label="Your Shopify store domain"
            />
            <button className={styles.btnPrimary} type="submit">
              Upgrade my store →
            </button>
          </Form>
        ) : (
          <a href="https://apps.shopify.com" className={styles.btnPrimary}>
            Add to Shopify →
          </a>
        )}
      </section>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footBrand}>
          <img src="/ShopHero.png" alt="ShopHero" className={styles.footLogo} />
          <span>ShopHero</span>
        </div>
        <nav className={styles.footLinks}>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
          <a href="/auth/login">Log in</a>
        </nav>
        <p className={styles.copy}>
          © {new Date().getFullYear()} ShopHero. All rights reserved. · shophero.io
        </p>
      </footer>
    </div>
  );
}
