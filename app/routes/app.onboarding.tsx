import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useNavigate, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopProfile } from "../lib/onboarding.server";
import db from "../db.server";
import type { ScanResult } from "./api.onboarding-scan";
import "../styles/shophero.css";

/**
 * Scan-first onboarding — the moment after install. We don't ask the merchant to
 * fill in a questionnaire (we're inside Shopify); we scan the real store, show
 * what we found, give a starting AI-Readiness Score, and reveal a prioritized
 * plan to fix it and grow. Value before any payment.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const profile = await getShopProfile(session.shop);
  return { shop: session.shop, alreadyOnboarded: !!profile?.onboardedAt };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  await db.shopProfile
    .upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, onboardedAt: new Date() },
      update: { onboardedAt: new Date() },
    })
    .catch(() => {});
  return { ok: true };
}

const SCAN_STEPS = [
  "Reading your catalog & pricing",
  "Checking how AI sees your store",
  "Auditing structured data & feed",
  "Measuring your content depth",
  "Building your fix-and-grow plan",
];

const C = { ink: "#15181d", muted: "#6b7280", line: "#e7e9ec", brand: "#16a34a", brand2: "#15795e", violet: "#7b6cf6", soft: "#f5f8f6" };
const ringColor = (s: number) => (s >= 70 ? "#16a34a" : s >= 40 ? "#e8941a" : "#e0457f");

function ScoreRing({ score }: { score: number }) {
  const r = 58, c = 2 * Math.PI * r;
  const color = ringColor(score);
  return (
    <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
      <circle cx="74" cy="74" r={r} fill="none" stroke="#eceef1" strokeWidth="12" />
      <circle cx="74" cy="74" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 74 74)"
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)" }} />
      <text x="74" y="70" textAnchor="middle" fontSize="42" fontWeight="800" fill={C.ink}>{score}</text>
      <text x="74" y="92" textAnchor="middle" fontSize="12" fontWeight="700" fill={C.muted}>/ 100</text>
    </svg>
  );
}

export default function Onboarding() {
  const scan = useFetcher<ScanResult>();
  const complete = useFetcher();
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const [phase, setPhase] = useState<"scanning" | "results">("scanning");
  const [stepIdx, setStepIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const minDone = useRef(false);
  const started = useRef(false);

  // Kick off the real scan on mount, and run the "thinking" animation.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    scan.load("/api/onboarding-scan");
    const t = setTimeout(() => { minDone.current = true; }, 4200); // min on-screen time so it feels substantial
    return () => clearTimeout(t);
  }, [scan]);

  useEffect(() => {
    if (phase !== "scanning") return;
    const step = setInterval(() => setStepIdx((s) => Math.min(SCAN_STEPS.length - 1, s + 1)), 950);
    const prog = setInterval(() => setPct((p) => (p < 92 ? Math.min(92, p + 3 + Math.random() * 7) : p)), 320);
    return () => { clearInterval(step); clearInterval(prog); };
  }, [phase]);

  // Advance to results once the scan returns AND the minimum animation time passed.
  const data = scan.data;
  useEffect(() => {
    if (phase !== "scanning" || scan.state !== "idle" || !data) return;
    const settle = setInterval(() => {
      if (minDone.current) {
        clearInterval(settle);
        setPct(100);
        setStepIdx(SCAN_STEPS.length);
        setTimeout(() => setPhase("results"), 500);
      }
    }, 200);
    return () => clearInterval(settle);
  }, [phase, scan.state, data]);

  const finish = () => {
    complete.submit({ intent: "complete" }, { method: "post" });
    navigate({ pathname: "/app/readiness", search: sp.toString() ? `?${sp.toString()}` : "" });
  };

  // ── Scanning ────────────────────────────────────────────────────────────
  if (phase === "scanning") {
    return (
      <div className="sh-ob">
        <div className="sh-ob-card sh-ob-center" style={{ maxWidth: 560 }}>
          <div className="sh-ob-hero-orb"><span>S</span></div>
          <h1 style={{ marginBottom: 6 }}>Analyzing your store</h1>
          <p className="sh-ob-lead" style={{ marginBottom: 22 }}>
            We're reading your real catalog to see how ready you are for AI shopping agents — no forms, no guesswork.
          </p>
          <div style={{ height: 6, background: "#eceef1", borderRadius: 999, overflow: "hidden", marginBottom: 22 }}>
            <span style={{ display: "block", height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${C.brand2},${C.brand})`, borderRadius: 999, transition: "width .4s ease" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left", maxWidth: 360, margin: "0 auto" }}>
            {SCAN_STEPS.map((s, i) => {
              const done = i < stepIdx;
              const active = i === stepIdx;
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 11, opacity: done || active ? 1 : 0.4, transition: "opacity .3s" }}>
                  <span style={{ width: 22, height: 22, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {done ? (
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: C.brand, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900 }}>✓</span>
                    ) : active ? (
                      <span className="sh-spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                      <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.line}` }} />
                    )}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: done || active ? 700 : 500, color: active ? C.ink : done ? C.brand2 : C.muted }}>{s}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Results ─────────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="sh-ob">
        <div className="sh-ob-card sh-ob-center" style={{ maxWidth: 480 }}>
          <h2>Let's get you set up</h2>
          <p className="sh-ob-sub">We couldn't finish the scan, but your dashboard is ready to go.</p>
          <button type="button" className="sh-btn sh-btn-primary sh-ob-scan-btn" onClick={finish}>Open my dashboard →</button>
        </div>
      </div>
    );
  }

  const fade = (i: number) => ({ animation: "shObFade .5s ease both", animationDelay: `${i * 70}ms` } as const);

  return (
    <div className="sh-ob">
      <style>{`@keyframes shObFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <div className="sh-ob-card" style={{ maxWidth: 720, textAlign: "left" }}>
        {/* What we found */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.brand2 }}>Scan complete</div>
          <h1 style={{ margin: "6px 0 0" }}>Here's what we found{data.profile.name ? ` in ${data.profile.name}` : ""}</h1>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", margin: "16px 0 6px" }}>
          {data.facts.map((f, i) => (
            <span key={i} style={{ ...fade(i), fontSize: 13, fontWeight: 600, color: C.ink, background: C.soft, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 13px" }}>{f}</span>
          ))}
        </div>
        {data.profile.bestSellers.length > 0 && (
          <p style={{ textAlign: "center", color: C.muted, fontSize: 13, margin: "4px 0 0" }}>
            Reading products like <strong style={{ color: C.ink }}>{data.profile.bestSellers.join(", ")}</strong>
          </p>
        )}

        {/* Score */}
        <div style={{ display: "flex", gap: 20, alignItems: "center", justifyContent: "center", flexWrap: "wrap", margin: "26px 0 8px", padding: "20px", background: C.soft, borderRadius: 18, border: `1px solid ${C.line}` }}>
          <ScoreRing score={data.score} />
          <div style={{ flex: "1 1 280px", minWidth: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.muted }}>Your starting AI-Readiness Score™</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: ringColor(data.score), margin: "2px 0 8px" }}>{data.grade}</div>
            {data.dims.map((d) => (
              <div key={d.label} style={{ marginBottom: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: C.ink }}><span>{d.label}</span><span>{d.score}</span></div>
                <div style={{ height: 6, background: "#eceef1", borderRadius: 999, overflow: "hidden", marginTop: 3 }}>
                  <span style={{ display: "block", height: "100%", width: `${d.score}%`, background: ringColor(d.score === 0 ? 1 : d.score), borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gaps */}
        <h2 style={{ fontSize: 19, margin: "26px 0 4px" }}>What's blocking AI from recommending you</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {data.gaps.map((g, i) => (
            <div key={i} style={{ ...fade(i), display: "flex", gap: 11, alignItems: "flex-start", padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 12, background: "#fff" }}>
              <span style={{ color: "#e0457f", fontWeight: 800, fontSize: 15, lineHeight: 1.4 }}>✕</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{g.label}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{g.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Plan */}
        <h2 style={{ fontSize: 19, margin: "26px 0 4px" }}>Your plan to fix it &amp; grow</h2>
        <p className="sh-ob-sub" style={{ marginTop: 2 }}>ShopHero does the work — you approve. Here's the order we'll tackle it in.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {data.plan.map((p, i) => (
            <div key={i} style={{ ...fade(i), display: "flex", gap: 12, alignItems: "center", padding: "13px 14px", border: `1px solid ${C.line}`, borderRadius: 12, background: "#fff" }}>
              <span style={{ fontSize: 22, width: 30, textAlign: "center", flexShrink: 0 }}>{p.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{p.title}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{p.desc}</div>
              </div>
              <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 999, color: p.tag === "Fix" ? C.brand2 : C.violet, background: p.tag === "Fix" ? "rgba(22,163,74,0.1)" : "rgba(123,108,246,0.1)" }}>{p.tag}</span>
            </div>
          ))}
        </div>

        <button type="button" className="sh-btn sh-btn-primary sh-ob-scan-btn" style={{ marginTop: 24, width: "100%" }} onClick={finish}>
          Start fixing my store →
        </button>
        <p className="sh-ob-fineprint" style={{ textAlign: "center" }}>
          This is your starting estimate from a catalog scan. Your dashboard verifies it live and tracks it as ShopHero works.
        </p>
      </div>
    </div>
  );
}
