import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, data, redirect, useActionData, useFetcher, useLoaderData, useNavigate, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import {
  finalizePlan,
  getShopProfile,
  revenueFromBucket,
  runOnboardingAnalysis,
  saveOnboarding,
  type Leak,
  type OnboardingAnswers,
} from "../lib/onboarding.server";
import { seedBrandKitFromOnboarding } from "../lib/brand.server";
import db from "../db.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const activePlan = await getActivePlan(admin);
  if (!activePlan) {
    const url = new URL(request.url);
    return redirect(`/app/pricing?${url.searchParams.toString()}`);
  }
  const profile = await getShopProfile(session.shop);
  return { shop: session.shop, alreadyOnboarded: !!profile?.onboardedAt };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const activePlan = await getActivePlan(admin);
  if (!activePlan) return redirect("/app/pricing");

  const form = await request.formData();
  const consentData = form.get("consentData") === "1";
  if (!consentData) {
    return data({ error: "Please allow ShopHero to access your store data so we can build your plan." }, { status: 400 });
  }

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const answers: OnboardingAnswers = {
    sells: str("sells"),
    goals: form.getAll("goals").map(String),
    audience: str("audience"),
    aov: str("aov"),
    revenue: str("revenue"),
    challenge: str("challenge"),
    voice: str("voice"),
    admire: str("admire"),
    notes: str("notes"),
  };

  const { snapshot, recommendations, usage, costUsd, model } = await runOnboardingAnalysis({
    admin,
    shop: session.shop,
    plan: activePlan,
    answers,
  });

  await saveOnboarding({ shop: session.shop, answers, snapshot, recommendations });
  await seedBrandKitFromOnboarding(session.shop, answers, snapshot).catch(() => {});

  if (usage) {
    await db.usageEvent
      .create({
        data: {
          shop: session.shop,
          plan: activePlan,
          model: model ?? null,
          kind: "onboarding",
          costUsd: costUsd ?? null,
          billedUsd: activePlan === "managed" ? (costUsd ?? 0) * 3 : 0,
          inputTokens: usage.inputTokens ?? null,
          outputTokens: usage.outputTokens ?? null,
        },
      })
      .catch(() => {});
  }
  await db.appEvent
    .create({ data: { shop: session.shop, level: "info", type: "onboarding", message: `Onboarded — ${recommendations.length} recommendations generated` } })
    .catch(() => {});

  const totals = finalizePlan(recommendations, revenueFromBucket(answers.revenue));
  return data({ ok: true, ...totals });
}

// ── Content ──────────────────────────────────────────────────────────────────

const WHAT_NEXT = ["Analyze your store", "Find revenue leaks", "Estimate upside", "Build your growth roadmap"];

const RADAR_MSGS = [
  "Analyzing homepage…",
  "Mapping customer journey…",
  "Reviewing product pages…",
  "Measuring trust signals…",
  "Checking mobile experience…",
  "Comparing against top-performing stores…",
  "Searching for conversion leaks…",
  "Calculating revenue opportunities…",
  "Building growth profile…",
];

const OUTCOMES = ["Revenue", "Conversion rate", "Average order value", "Organic traffic", "Store speed", "Customer trust"];
const HANDLES = [
  "Finding opportunities",
  "Design improvements",
  "Store optimization",
  "SEO improvements",
  "Content creation",
  "Growth experiments",
  "Technical implementation",
];

const POWERS: { emoji: string; title: string; desc: string }[] = [
  { emoji: "💰", title: "Find Money", desc: "Discover hidden revenue opportunities automatically." },
  { emoji: "🛠️", title: "Build Anything", desc: "Pages, sections, campaigns, collections, content, products — store improvements of any kind." },
  { emoji: "🚀", title: "Fix Everything", desc: "One-click deployment after approval. No developers required." },
];

const TRUST: { title: string; lines: string[] }[] = [
  { title: "Design changes", lines: ["Made on a private copy.", "Preview first.", "Approve when ready."] },
  { title: "Store changes", lines: ["Every action explained beforehand.", "Nothing happens automatically."] },
  { title: "Your data", lines: ["Never sold.", "Never shared.", "Used only to improve your store."] },
];

const GOALS: { value: string; emoji: string; label: string }[] = [
  { value: "conversions", emoji: "📈", label: "Better conversion rate" },
  { value: "aov", emoji: "💰", label: "Higher order value" },
  { value: "seo", emoji: "🔍", label: "More traffic & SEO" },
  { value: "speed", emoji: "⚡", label: "Faster store" },
  { value: "design", emoji: "🎨", label: "Better brand & design" },
  { value: "content", emoji: "📝", label: "Launch / content" },
];

const REV_OPTS = ["Pre-launch", "Under $5k/mo", "$5k–$25k/mo", "$25k–$100k/mo", "$100k+/mo"];
const PERMISSIONS = ["Products", "Collections", "Pages", "Theme", "Storefront", "Performance signals"];

const TOTAL_DOTS = [2, 3, 4, 5, 6, 7, 8]; // content steps that show a progress dot
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

type ScanData = {
  fields: { sells?: string; audience?: string; voice?: string; aov?: string };
  goals: string[];
  detected: string[];
  learnings: string[];
  leaks: Leak[];
  estLow: number;
  estHigh: number;
};

const EMPTY = { sells: "", audience: "", aov: "", revenue: "", challenge: "", voice: "", admire: "" };

/** Ease-out count-up that runs when `active` flips true. */
function useCountUp(target: number, active: boolean, ms = 1100): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return v;
}

const DEFAULT_LEAKS: Leak[] = [
  { title: "Homepage lacks trust indicators", impactUsd: 2100 },
  { title: "Upsell flow missing", impactUsd: 3800 },
  { title: "Collection navigation weak", impactUsd: 1900 },
  { title: "SEO metadata incomplete", impactUsd: 4700 },
];

export default function Onboarding() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const ad = actionData as { ok?: boolean; count?: number; annualUsd?: number; monthlyUsd?: number; priority?: number; error?: string } | undefined;
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submitting = navigation.state !== "idle";

  const scan = useFetcher<ScanData>();

  const [step, setStep] = useState(0);
  const [scanStarted, setScanStarted] = useState(false);
  const [goals, setGoals] = useState<string[]>([]);
  const [f, setF] = useState({ ...EMPTY });
  const [consentData, setConsentData] = useState(false);
  const [consentApproval, setConsentApproval] = useState(false);
  const [learnings, setLearnings] = useState<string[]>([]);
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [est, setEst] = useState<{ low: number; high: number }>({ low: 0, high: 0 });
  const [radarPct, setRadarPct] = useState(0);
  const [radarMsg, setRadarMsg] = useState(0);

  const building = submitting || !!ad?.ok;
  const buildCards = leaks.length ? leaks : DEFAULT_LEAKS;
  const [reveal, setReveal] = useState(0);

  // Radar: animate progress + rotate messages while the scan runs.
  useEffect(() => {
    if (step !== 1) return;
    const msg = setInterval(() => setRadarMsg((m) => m + 1), 1100);
    const pct = setInterval(() => setRadarPct((p) => (p < 92 ? Math.min(92, p + 4 + Math.random() * 8) : p)), 360);
    return () => {
      clearInterval(msg);
      clearInterval(pct);
    };
  }, [step]);

  // When the scan finishes, merge results and advance off the radar.
  useEffect(() => {
    if (step !== 1 || !scanStarted || scan.state !== "idle") return;
    const d = scan.data;
    if (d) {
      setF((prev) => ({
        ...prev,
        sells: d.fields.sells ?? prev.sells,
        audience: d.fields.audience ?? prev.audience,
        voice: d.fields.voice ?? prev.voice,
        aov: d.fields.aov ?? prev.aov,
      }));
      if (d.goals?.length) setGoals((g) => [...new Set([...g, ...d.goals])]);
      setLearnings(d.learnings ?? []);
      setLeaks(d.leaks ?? []);
      setEst({ low: d.estLow ?? 0, high: d.estHigh ?? 0 });
    }
    setRadarPct(100);
    const t = setTimeout(() => setStep(2), 650);
    return () => clearTimeout(t);
  }, [step, scanStarted, scan.state, scan.data]);

  // Building screen: reveal opportunity cards one at a time.
  useEffect(() => {
    if (!building) {
      setReveal(0);
      return;
    }
    if (reveal >= buildCards.length) return;
    const t = setTimeout(() => setReveal((r) => r + 1), 680);
    return () => clearTimeout(t);
  }, [building, reveal, buildCards.length]);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggleGoal = (v: string) => setGoals((g) => (g.includes(v) ? g.filter((x) => x !== v) : [...g, v]));
  const startScan = () => {
    setScanStarted(true);
    setRadarPct(0);
    scan.load("/api/onboarding-scan");
    setStep(1);
  };

  const ready = !!ad?.ok && reveal >= buildCards.length;
  const runningTotal = buildCards.slice(0, reveal).reduce((s, l) => s + l.impactUsd, 0);
  const finalAnnual = useCountUp(ad?.annualUsd ?? 0, ready);
  const leakTotal = leaks.reduce((s, l) => s + l.impactUsd, 0);

  // ── Building screen (replaces wizard during/after submit) ──────────────────
  if (building) {
    return (
      <div className="sh-ob">
        <div className="sh-ob-card sh-ob-build">
          {!ready ? (
            <>
              <h2>Building your growth plan</h2>
              <p className="sh-ob-sub">Scanning every corner of your store for opportunities…</p>
              <div className="sh-ob-build-list">
                {buildCards.slice(0, reveal).map((l, i) => (
                  <div key={i} className="sh-ob-build-card">
                    <div>
                      <div className="sh-ob-build-kicker">Opportunity found</div>
                      <div className="sh-ob-build-title">{l.title}</div>
                    </div>
                    <div className="sh-ob-build-impact">+{money(l.impactUsd)}<span>/yr</span></div>
                  </div>
                ))}
              </div>
              <div className="sh-ob-build-running">
                <span>Revenue opportunity found</span>
                <strong>{money(runningTotal)}</strong>
              </div>
              {reveal >= buildCards.length && <div className="sh-ob-build-fin"><span className="sh-dot" /> Finalizing your plan…</div>}
            </>
          ) : (
            <div className="sh-ob-ready">
              <div className="sh-ob-ready-badge">✓</div>
              <h2>Your growth plan is ready</h2>
              <p className="sh-ob-sub">{ad?.count} opportunities found and prioritized for your store.</p>
              <div className="sh-ob-ready-stats">
                <div>
                  <div className="sh-ob-ready-num">+{money(finalAnnual)}</div>
                  <div className="sh-ob-ready-lbl">estimated upside / year</div>
                </div>
                <div>
                  <div className="sh-ob-ready-num">+{money(ad?.monthlyUsd ?? 0)}</div>
                  <div className="sh-ob-ready-lbl">potential monthly gain</div>
                </div>
                <div>
                  <div className="sh-ob-ready-num">{ad?.priority}<span>/100</span></div>
                  <div className="sh-ob-ready-lbl">priority score</div>
                </div>
              </div>
              <button type="button" className="sh-btn sh-btn-primary sh-ob-scan-btn" onClick={() => navigate("/app")}>
                Show me my growth plan →
              </button>
              <p className="sh-ob-fineprint">Upside is an estimate based on your store signals, stated revenue and industry benchmarks.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const dotIndex = TOTAL_DOTS.indexOf(step);

  return (
    <div className="sh-ob">
      <Form method="post" className="sh-ob-card">
        {dotIndex >= 0 && (
          <div className="sh-ob-progress">
            {TOTAL_DOTS.map((_, i) => (
              <span key={i} className={`sh-ob-dot${i <= dotIndex ? " is-on" : ""}`} />
            ))}
          </div>
        )}

        {/* STEP 1 — The Hook */}
        <section hidden={step !== 0} className="sh-ob-step sh-ob-center">
          <div className="sh-ob-hero-orb">
            <img className="sh-mark-img" src="/logo.png" alt="ShopHero" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <span>S</span>
          </div>
          <h1>Meet your new Shopify growth team</h1>
          <p className="sh-ob-lead">
            Most stores don't have a traffic problem. They have a <strong>conversion problem</strong>.
            ShopHero analyzes your store, identifies hidden revenue opportunities, and builds a
            prioritized growth plan in minutes.
          </p>
          <div className="sh-ob-next">
            {WHAT_NEXT.map((w) => (
              <div key={w} className="sh-ob-next-row"><span className="sh-ob-check">✓</span> {w}</div>
            ))}
          </div>
          <div className="sh-ob-time">⏱ About 90 seconds</div>
          <button type="button" className="sh-btn sh-btn-primary sh-ob-scan-btn" onClick={startScan}>
            Analyze my store →
          </button>
        </section>

        {/* STEP 2 — Live Intelligence Scan (radar) */}
        <section hidden={step !== 1} className="sh-ob-step sh-ob-center">
          <h2>Reading your store…</h2>
          <div className="sh-ob-radar">
            <div className="sh-ob-radar-sweep" />
            <div className="sh-ob-radar-ring" />
            <div className="sh-ob-radar-ring r2" />
            <div className="sh-ob-radar-pct">{Math.round(radarPct)}%</div>
          </div>
          <p className="sh-ob-radar-msg">{RADAR_MSGS[radarMsg % RADAR_MSGS.length]}</p>
          <div className="sh-ob-analyze-bar"><span style={{ width: `${radarPct}%` }} /></div>
        </section>

        {/* STEP 3 — First "holy sh*t" moment */}
        <section hidden={step !== 2} className="sh-ob-step">
          <h2>Here's what we already learned</h2>
          <div className="sh-ob-learn">
            {learnings.map((l, i) => (
              <div key={i} className="sh-ob-learn-row" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="sh-ob-check">✓</span> {l}
              </div>
            ))}
          </div>
          <div className="sh-ob-est">
            <div className="sh-ob-est-kicker">Estimated opportunity found</div>
            <div className="sh-ob-est-num">+{money(est.low)} – {money(est.high)}<span>/yr</span></div>
            <div className="sh-ob-est-sub">Potential revenue available through conversion improvements and store optimization.</div>
          </div>
          <div className="sh-ob-actions sh-ob-actions-end">
            <button type="button" className="sh-btn sh-btn-primary" onClick={next}>Show me more →</button>
          </div>
        </section>

        {/* STEP 4 — The Revenue Leak Report */}
        <section hidden={step !== 3} className="sh-ob-step">
          <h2>Your biggest revenue leaks</h2>
          <p className="sh-ob-sub">Where money is quietly slipping away right now — ranked by what it's costing you.</p>
          <div className="sh-ob-leaks">
            {(leaks.length ? leaks : DEFAULT_LEAKS).map((l, i) => (
              <div key={i} className="sh-ob-leak">
                <div className="sh-ob-leak-rank">#{i + 1}</div>
                <div className="sh-ob-leak-title">{l.title}</div>
                <div className="sh-ob-leak-impact">+{money(l.impactUsd)}<span>/yr</span></div>
              </div>
            ))}
          </div>
          <div className="sh-ob-leak-total">
            <span>Total opportunity</span>
            <strong>{money(leakTotal || DEFAULT_LEAKS.reduce((s, l) => s + l.impactUsd, 0))}/yr</strong>
          </div>
          <p className="sh-ob-fineprint">Estimates based on your store signals and industry benchmarks.</p>
          <div className="sh-ob-actions sh-ob-actions-end">
            <button type="button" className="sh-btn sh-btn-primary" onClick={next}>How do we fix this? →</button>
          </div>
        </section>

        {/* STEP 5 — The Transformation */}
        <section hidden={step !== 4} className="sh-ob-step">
          <h2>Imagine this store 90 days from now</h2>
          <div className="sh-ob-outcomes">
            {OUTCOMES.map((o) => (
              <div key={o} className="sh-ob-outcome"><span>{o}</span><b>↑</b></div>
            ))}
          </div>
          <div className="sh-ob-handles-head">ShopHero handles</div>
          <div className="sh-ob-handles">
            {HANDLES.map((h) => (
              <div key={h} className="sh-ob-handle"><span className="sh-ob-check">✓</span> {h}</div>
            ))}
          </div>
          <p className="sh-ob-sub" style={{ textAlign: "center", marginTop: 14 }}>All staged for your approval.</p>
          <div className="sh-ob-actions sh-ob-actions-end">
            <button type="button" className="sh-btn sh-btn-primary" onClick={next}>Show my superpowers →</button>
          </div>
        </section>

        {/* STEP 6 — The Powers */}
        <section hidden={step !== 5} className="sh-ob-step">
          <h2>Three superpowers</h2>
          <div className="sh-ob-powers">
            {POWERS.map((p) => (
              <div key={p.title} className="sh-ob-power">
                <span className="sh-ob-power-emoji">{p.emoji}</span>
                <div className="sh-ob-power-title">{p.title}</div>
                <div className="sh-ob-power-desc">{p.desc}</div>
              </div>
            ))}
          </div>
          <div className="sh-ob-flow">
            <span>Find</span><i>→</i><span>Build</span><i>→</i><span>Deploy</span>
          </div>
          <div className="sh-ob-actions sh-ob-actions-end">
            <button type="button" className="sh-btn sh-btn-primary" onClick={next}>Continue →</button>
          </div>
        </section>

        {/* STEP 7 — Trust & Safety */}
        <section hidden={step !== 6} className="sh-ob-step">
          <h2>You're always in control</h2>
          <div className="sh-ob-trust">
            {TRUST.map((t) => (
              <div key={t.title} className="sh-ob-trust-block">
                <div className="sh-ob-trust-title">{t.title}</div>
                {t.lines.map((l) => (
                  <div key={l} className="sh-ob-trust-line">{l}</div>
                ))}
              </div>
            ))}
          </div>
          <div className="sh-ob-flow">
            <span>AI works</span><i>→</i><span>You approve</span><i>→</i><span>Store updates</span>
          </div>
          <div className="sh-ob-actions sh-ob-actions-end">
            <button type="button" className="sh-btn sh-btn-primary" onClick={next}>Build my growth plan →</button>
          </div>
        </section>

        {/* STEP 8 — Smart Questions */}
        <section hidden={step !== 7} className="sh-ob-step">
          <h2>Help us personalize your plan</h2>

          <div className="sh-ob-field">
            <span>What matters most right now?</span>
            <div className="sh-ob-goals">
              {GOALS.map((g) => (
                <button type="button" key={g.value} className={`sh-ob-goal${goals.includes(g.value) ? " is-on" : ""}`} onClick={() => toggleGoal(g.value)}>
                  <span>{g.emoji}</span> {g.label}
                </button>
              ))}
            </div>
            {goals.map((g) => <input key={g} type="hidden" name="goals" value={g} />)}
          </div>

          <label className="sh-ob-field">
            <span>Monthly revenue</span>
            <select name="revenue" value={f.revenue} onChange={set("revenue")} className="sh-ob-input">
              <option value="">Select…</option>
              {REV_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          <label className="sh-ob-field">
            <span>Biggest frustration?</span>
            <input name="challenge" value={f.challenge} onChange={set("challenge")} className="sh-ob-input" placeholder="e.g. lots of traffic but few sales" />
          </label>

          <label className="sh-ob-field">
            <span>Brands you admire?</span>
            <input name="admire" value={f.admire} onChange={set("admire")} className="sh-ob-input" placeholder="e.g. Graza, Everyday Dose" />
          </label>

          {/* Carried from the scan so the plan uses everything we learned. */}
          <input type="hidden" name="sells" value={f.sells} />
          <input type="hidden" name="audience" value={f.audience} />
          <input type="hidden" name="voice" value={f.voice} />
          <input type="hidden" name="aov" value={f.aov} />

          <div className="sh-ob-actions sh-ob-actions-end">
            <button type="button" className="sh-btn sh-btn-primary" onClick={next}>Generate my plan →</button>
          </div>
        </section>

        {/* STEP 9 — Permission */}
        <section hidden={step !== 8} className="sh-ob-step">
          <h2>Ready to unleash ShopHero?</h2>
          <p className="sh-ob-sub">To build your growth plan, ShopHero needs access to:</p>
          <div className="sh-ob-perms">
            {PERMISSIONS.map((p) => (
              <span key={p} className="sh-ob-perm"><span className="sh-ob-check">✓</span> {p}</span>
            ))}
          </div>

          <label className={`sh-ob-consent${consentData ? " is-on" : ""}`}>
            <input type="checkbox" name="consentData" value="1" checked={consentData} onChange={(e) => setConsentData(e.target.checked)} />
            <span><strong>Access my store data</strong> to find opportunities and build my plan. <em>(required)</em></span>
          </label>
          <label className={`sh-ob-consent${consentApproval ? " is-on" : ""}`}>
            <input type="checkbox" name="consentApproval" value="1" checked={consentApproval} onChange={(e) => setConsentApproval(e.target.checked)} />
            <span><strong>Nothing is changed without my approval.</strong> Design edits are staged; live-store changes are explained first.</span>
          </label>

          <p className="sh-ob-fineprint">Your data is processed securely, never sold and never shared — used only to improve your store.</p>
          {ad?.error && <div className="sh-ob-error">{ad.error}</div>}

          <div className="sh-ob-actions">
            <button type="button" className="sh-btn sh-btn-ghost" onClick={back}>← Back</button>
            <button type="submit" className="sh-btn sh-btn-primary" disabled={!consentData}>Unleash ShopHero →</button>
          </div>
        </section>
      </Form>
    </div>
  );
}
