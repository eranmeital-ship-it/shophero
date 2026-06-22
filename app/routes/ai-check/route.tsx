import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useActionData, useNavigation } from "react-router";

import { runVisibilityCheck, type VisibilityReport, type CheckStatus } from "../../lib/ai-visibility.server";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "Free AI Visibility Check — Can ChatGPT & Claude find your store? | ShopHero" },
  {
    name: "description",
    content:
      "Free instant check: see how well AI shopping agents — ChatGPT, Claude, Gemini, Perplexity — can read and recommend your Shopify store. Get your AI Visibility score and the exact gaps to fix.",
  },
  { property: "og:title", content: "Free AI Visibility Check — Can AI find your store?" },
  {
    property: "og:description",
    content: "Instant AI Visibility score for your store, with the exact gaps stopping ChatGPT and Claude from recommending you.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) throw redirect(`/app?${url.searchParams.toString()}`);
  return null;
};

type ActionResult =
  | { ok: true; report: VisibilityReport }
  | { ok: false; error: string };

// Best-effort per-IP throttle for this public, unauthenticated endpoint.
const rlHits = new Map<string, number[]>();
const RL_MAX = 8; // checks
const RL_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes
function rateLimited(request: Request): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const hits = (rlHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  rlHits.set(ip, hits);
  if (rlHits.size > 5000) for (const [k, v] of rlHits) if (!v.some((t) => now - t < RL_WINDOW_MS)) rlHits.delete(k);
  return hits.length > RL_MAX;
}

export async function action({ request }: ActionFunctionArgs): Promise<ActionResult> {
  if (rateLimited(request)) return { ok: false, error: "You've run a lot of checks — please wait a few minutes and try again." };
  const fd = await request.formData();
  const url = String(fd.get("url") || "").trim();
  if (!url) return { ok: false, error: "Enter your store URL to run the check." };
  return runVisibilityCheck(url);
}

const STATUS_ICON: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✗" };

function ScoreRing({ score, status }: { score: number; status: CheckStatus }) {
  const R = 78;
  const C = 2 * Math.PI * R;
  const color = status === "pass" ? "#34c759" : status === "warn" ? "#ff9500" : "#ff3b30";
  return (
    <svg className={styles.ring} viewBox="0 0 180 180" role="img" aria-label={`AI Visibility score ${score} of 100`}>
      <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="13" />
      <circle
        cx="90" cy="90" r={R} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * C} ${C}`} transform="rotate(-90 90 90)"
      />
      <text x="90" y="84" textAnchor="middle" className={styles.ringScore} fill="#fff">{score}</text>
      <text x="90" y="108" textAnchor="middle" className={styles.ringOf} fill="rgba(255,255,255,0.55)">/ 100</text>
    </svg>
  );
}

function Results({ report }: { report: VisibilityReport }) {
  const headline =
    report.status === "pass" ? "Strong — AI can find and recommend you."
    : report.status === "warn" ? "Partly visible — agents are missing key signals."
    : "At risk — AI agents can barely read your store.";

  return (
    <section className={styles.results} id="results">
      <div className={styles.scoreCard}>
        <ScoreRing score={report.score} status={report.status} />
        <div className={styles.scoreText}>
          <span className={styles.scoreKicker}>AI Visibility score · {report.host}</span>
          <h2 className={styles.scoreHeadline}>{headline}</h2>
          <p className={styles.scoreSub}>
            {report.passCount} of {report.total} checks passing.
            {report.topGaps.length > 0 && <> Biggest gaps: <strong>{report.topGaps.join(", ")}</strong>.</>}
          </p>
          <a href="#fix" className={styles.scoreCta}>Fix these automatically →</a>
        </div>
      </div>

      <div className={styles.checklist}>
        {report.checks.map((c) => (
          <div key={c.key} className={`${styles.check} ${styles[`check_${c.status}`]}`}>
            <div className={styles.checkIcon} data-s={c.status}>{STATUS_ICON[c.status]}</div>
            <div className={styles.checkBody}>
              <div className={styles.checkTop}>
                <span className={styles.checkLabel}>{c.label}</span>
                <span className={styles.checkPts}>{c.earned}/{c.weight} pts</span>
              </div>
              <p className={styles.checkDetail}>{c.detail}</p>
              <p className={styles.checkWhy}>{c.why}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CONVERSION */}
      <div className={styles.fix} id="fix">
        <span className={styles.fixKicker}>🤖 The new search box</span>
        <h2 className={styles.fixTitle}>ShopHero fixes every one of these — automatically.</h2>
        <p className={styles.fixSub}>
          Structured product data, AI-crawler access, schema, alt text, llms.txt and more — ShopHero's AI Visibility (AEO)
          brain builds them for you and stages every change for your approval. Re-run this check and watch the score climb.
        </p>
        <a href="https://apps.shopify.com" className={styles.fixBtn}>Install ShopHero free →</a>
        <p className={styles.fixMicro}>Installs in 30 seconds · You approve every change · One-click rollback</p>
      </div>
    </section>
  );
}

export default function AiCheck() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const running = nav.state === "submitting";

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <a href="/" className={styles.brand}>
          <img src="/ShopHero.png" alt="" className={styles.navLogo} /> ShopHero
        </a>
        <a href="/" className={styles.navCta}>Back to site</a>
      </header>

      <section className={styles.hero}>
        <span className={styles.badge}>✦ Free · instant · no signup</span>
        <h1 className={styles.h1}>
          Can AI <span className={styles.grad}>find your store?</span>
        </h1>
        <p className={styles.sub}>
          Shoppers now ask <strong>ChatGPT, Claude, Gemini and Perplexity</strong> what to buy. If your store isn't
          machine-readable, the AI recommends a competitor — and you never even appear. Run the free check.
        </p>

        <Form method="post" className={styles.form}>
          <input
            className={styles.input}
            type="text"
            name="url"
            placeholder="yourstore.com"
            aria-label="Your store URL"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
          />
          <button className={styles.btn} type="submit" disabled={running}>
            {running ? "Scanning…" : "Check my store →"}
          </button>
        </Form>
        <p className={styles.micro}>Checks 11 real AEO signals from your public storefront. Nothing is stored.</p>

        {data && !data.ok && <p className={styles.error}>{data.error}</p>}
      </section>

      {data?.ok && <Results report={data.report} />}

      <footer className={styles.footer}>
        <nav className={styles.footLinks}>
          <a href="/">Home</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </nav>
        <p className={styles.copy}>© {new Date().getFullYear()} ShopHero · shophero.io</p>
      </footer>
    </div>
  );
}
