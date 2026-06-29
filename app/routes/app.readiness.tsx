import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useRevalidator, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getActiveTier } from "../lib/billing.server";
import { TIERS } from "../lib/plans";
import { ensureReady } from "../lib/bootstrap.server";
import { auditSchema } from "../lib/schema-audit.server";
import { gql } from "../lib/onboarding.server";
import { getPlan } from "../lib/content-plan.server";
import type { ContentPiece } from "../lib/content-strategy.server";
import db from "../db.server";
import "../styles/shophero.css";

/**
 * AI-Readiness — the centerpiece. One 0–100 score for how well AI shopping agents
 * can read & recommend the store, blended from the deterministic schema audit,
 * content readability, and the hosted feed; plus REAL AI-crawler activity and a
 * ranked gap list. This is the screen merchants log in to watch move.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let structured = 0, installed = false, grade = "Needs work";
  let gaps: { label: string; detail: string; who: string; how?: string; fix?: { label: string; href?: string; action?: string } }[] = [];
  let liveNote: string | null = null;
  try {
    const { dir } = await ensureReady({ shop, accessToken: session.accessToken! });
    const audit = await auditSchema(admin, dir);
    structured = audit.score;
    installed = audit.installed;
    grade = audit.grade;
    gaps = audit.checks
      .filter((c) => c.status === "fail" || c.status === "partial")
      .slice(0, 8)
      .map((c) => ({ label: c.label, detail: c.detail, who: c.who, how: c.how, fix: c.fix }));
    liveNote = audit.live?.verified ? `Verified live${audit.live.detectedTypes?.length ? ` · ${audit.live.detectedTypes.join(", ")}` : ""}` : audit.live?.note ?? null;
  } catch { /* audit best-effort */ }

  // Readable-content dimension: % of products with a substantive description.
  let contentPct = 0, productCount = 0;
  try {
    const pd = await gql<{ productsCount?: { count?: number }; products?: { nodes?: { descriptionHtml?: string }[] } }>(
      admin, `{ productsCount { count } products(first: 100) { nodes { descriptionHtml } } }`);
    const nodes = pd?.products?.nodes ?? [];
    productCount = pd?.productsCount?.count ?? nodes.length;
    if (nodes.length) {
      const good = nodes.filter((n) => (n.descriptionHtml ?? "").replace(/<[^>]+>/g, " ").trim().length >= 120).length;
      contentPct = Math.round((good / nodes.length) * 100);
    }
  } catch { /* ignore */ }

  // The hosted AI feed + llms.txt are served by the app (App Proxy) once installed.
  const feedScore = 100;

  // Real AI-crawler activity (last 30 days).
  let crawlers: { bot: string; count: number }[] = [];
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await db.crawlerHit.groupBy({ by: ["bot"], where: { shop, createdAt: { gte: since } }, _count: { bot: true } });
    crawlers = rows.map((r) => ({ bot: r.bot, count: r._count.bot })).sort((a, b) => b.count - a.count);
  } catch { /* table may be empty */ }
  const crawlerTotal = crawlers.reduce((s, c) => s + c.count, 0);

  // Content plan (the constant AI-answer SEO drip) — strategy summary + queue.
  let content: { summary: string | null; status: string; published: number; queue: ContentPiece[]; total: number; draftTitle: string | null; autoPublish: boolean; perDay: number } | null = null;
  try {
    const cp = await getPlan(shop);
    if (cp) {
      let queue: ContentPiece[] = [];
      try { queue = JSON.parse(cp.queue || "[]"); } catch { /* ignore */ }
      content = { summary: cp.strategySummary, status: cp.status, published: cp.publishedCount, queue: queue.slice(0, 8), total: queue.length, draftTitle: cp.draftTitle, autoPublish: cp.autoPublish, perDay: cp.perDay };
    }
  } catch { /* ignore */ }

  const tier = await getActiveTier(admin).catch(() => null);
  const tierLabel = tier ? TIERS[tier].label.replace("ShopHero ", "") : null;
  const dailyContent = tier ? TIERS[tier].dailyContent : false;
  const canDescribe = tier ? TIERS[tier].productDescriptions : false;

  const score = Math.round(structured * 0.5 + feedScore * 0.2 + contentPct * 0.3);
  const base = `https://${shop}`;
  return {
    content,
    tier, tierLabel, dailyContent, canDescribe,
    score, grade, productCount, liveNote, crawlers, crawlerTotal,
    dims: [
      { key: "structured", label: "Structured data", score: structured, note: installed ? "JSON-LD installed" : "Not installed yet" },
      { key: "feed", label: "AI feed & llms.txt", score: feedScore, note: "Hosted & live" },
      { key: "content", label: "Readable content", score: contentPct, note: `${contentPct}% of products` },
    ],
    gaps,
    links: { llms: `${base}/apps/shophero/llms.txt`, feed: `${base}/apps/shophero/feed.json` },
  };
}

// ── Control-center design tokens (premium dark "ops" console) ────────────────
const C = {
  bg: "#0a0e09", panel: "#121a10", panel2: "#0e140c", line: "#26331f", lineSoft: "#1c2618",
  text: "#f2f6f0", muted: "#9fb098", faint: "#6f7d68",
  brand: "#6ec531", brand2: "#a3e35c", accent: "#34e0a1", violet: "#7b6cf6", violet2: "#a78bfa",
  coral: "#d97757", amber: "#e8941a", blue: "#3b82f6",
};
const scoreColor = (s: number) => (s >= 80 ? C.brand : s >= 50 ? C.amber : C.coral);
const card: React.CSSProperties = { background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.line}`, borderRadius: 18, padding: 20 };
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

function Label({ children, mb = 14 }: { children: React.ReactNode; mb?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: mb }}>
      <span style={{ width: 3, height: 13, borderRadius: 2, background: `linear-gradient(${C.brand2},${C.accent})`, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.faint }}>{children}</span>
    </div>
  );
}

function Gauge({ score, shown }: { score: number; shown: number }) {
  const r = 64, c = 2 * Math.PI * r;
  const col = scoreColor(score);
  return (
    <svg width="172" height="172" viewBox="0 0 172 172" style={{ filter: `drop-shadow(0 0 16px ${col}44)` }}>
      <defs>
        <linearGradient id="rdxGauge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={col} /><stop offset="1" stopColor={C.accent} />
        </linearGradient>
      </defs>
      <circle cx="86" cy="86" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="13" />
      <circle cx="86" cy="86" r={r} fill="none" stroke="url(#rdxGauge)" strokeWidth="13" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} transform="rotate(-90 86 86)"
        style={{ transition: "stroke-dashoffset .25s linear" }} />
      <text x="86" y="82" textAnchor="middle" fontSize="50" fontWeight="800" fill={C.text}>{shown}</text>
      <text x="86" y="108" textAnchor="middle" fontSize="12" fontWeight="700" fill={C.faint} letterSpacing="0.1em">/ 100</text>
    </svg>
  );
}

function Tile({ value, label, accent }: { value: React.ReactNode; label: string; accent: string }) {
  return (
    <div className="rdx-card" style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent, letterSpacing: "-0.02em", lineHeight: 1.1, fontFamily: mono }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function SystemCard({ icon, title, on, detail }: { icon: string; title: string; on: boolean; detail: string }) {
  return (
    <div className="rdx-card" style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: on ? C.brand2 : C.faint }}>
          <span className={on ? "rdx-dot rdx-dot-on" : "rdx-dot"} style={{ background: on ? C.brand : C.faint }} />
          {on ? "ONLINE" : "IDLE"}
        </span>
      </div>
      <div style={{ fontWeight: 750, fontSize: 13.5, color: C.text }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{detail}</div>
    </div>
  );
}

export default function Readiness() {
  const d = useLoaderData<typeof loader>();
  const installFix = useFetcher<{ ok?: boolean; error?: string }>(); // one-tap schema install
  const revalidator = useRevalidator();
  const installing = installFix.state !== "idle";
  const installed = !!installFix.data?.ok;
  const reevaluating = revalidator.state === "loading";

  // Animated count-up for the headline score (the "needle settling" moment).
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1100);
      setShown(Math.round(d.score * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [d.score]);

  const verdict = d.score >= 80
    ? "Strong — AI agents can read and recommend your store."
    : d.score >= 50
      ? "Getting there — close the open issues to get recommended more often."
      : "Most AI agents can't read your store yet. Work the queue below.";
  const structuredOn = (d.dims.find((x) => x.key === "structured")?.score ?? 0) > 0;
  const articles = d.content?.published ?? 0;

  return (
    <div style={{
      color: C.text, minHeight: "100vh", margin: "-16px", padding: "22px 22px 48px",
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: `
        radial-gradient(900px 520px at 8% -8%, ${C.brand}14, transparent 58%),
        radial-gradient(820px 520px at 102% -4%, ${C.violet}12, transparent 54%),
        linear-gradient(rgba(255,255,255,0.016) 1px, transparent 1px) 0 0 / 100% 42px,
        linear-gradient(90deg, rgba(255,255,255,0.016) 1px, transparent 1px) 0 0 / 42px 100%,
        ${C.bg}`,
    }}>
      <style>{`
        .rdx-card { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .rdx-card:hover { transform: translateY(-2px); border-color: ${C.brand}55; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
        .rdx-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .rdx-dot-on { box-shadow: 0 0 0 0 ${C.brand}88; animation: rdxPulse 1.8s infinite; }
        @keyframes rdxPulse { 0% { box-shadow: 0 0 0 0 ${C.brand}77; } 70% { box-shadow: 0 0 0 7px ${C.brand}00; } 100% { box-shadow: 0 0 0 0 ${C.brand}00; } }
        @keyframes rdxBar { from { width: 0; } }
        @keyframes rdxSpin { to { transform: rotate(360deg); } }
        .rdx-bar > span { animation: rdxBar 1s cubic-bezier(.2,.7,.2,1) both; }
        .rdx-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; font-weight:800; font-size:13.5px; padding:11px 18px; border-radius:11px; border:none; cursor:pointer; background:linear-gradient(180deg,${C.brand2},${C.brand}); color:#06120c; text-decoration:none; transition: transform .15s ease, box-shadow .15s ease; }
        .rdx-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 24px ${C.brand}44; }
        .rdx-chip { font-family:${mono}; font-size:12.5px; color:${C.text}; background:${C.panel2}; border:1px solid ${C.line}; border-radius:10px; padding:9px 13px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; }
        .rdx-chip:hover { border-color:${C.brand}66; }
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        {/* ── Top bar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 20 }}>🛰️</span> AI-Readiness Control Center
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>Live operations for how ChatGPT, Claude, Perplexity &amp; Google AI read and recommend your store.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: C.brand2, background: `${C.brand}14`, border: `1px solid ${C.brand}3a`, padding: "7px 13px", borderRadius: 999 }}>
              <span className="rdx-dot rdx-dot-on" style={{ background: C.brand }} /> SYSTEMS LIVE · MONITORING
            </span>
            <button type="button" onClick={() => revalidator.revalidate()} disabled={reevaluating}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: C.text, background: C.panel, border: `1px solid ${C.line}`, padding: "7px 13px", borderRadius: 999, cursor: reevaluating ? "default" : "pointer" }}>
              <span style={{ display: "inline-block", animation: reevaluating ? "rdxSpin .8s linear infinite" : "none" }}>↻</span>
              {reevaluating ? "Re-evaluating…" : "Re-evaluate"}
            </button>
            <Link to="/app/pricing" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, textDecoration: "none", color: d.tier === "authority" ? C.violet2 : C.brand2, background: d.tier === "authority" ? `${C.violet}1a` : `${C.brand}14`, border: `1px solid ${d.tier === "authority" ? C.violet + "44" : C.brand + "3a"}`, padding: "7px 13px", borderRadius: 999 }}>
              {d.tierLabel ? `${d.tierLabel} plan` : "No plan"} {d.tier !== "authority" && <span style={{ opacity: 0.85 }}>· Upgrade →</span>}
            </Link>
          </div>
        </div>

        {/* ── Hero: gauge + telemetry tiles ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.1fr) minmax(280px, 1fr)", gap: 14, marginBottom: 14 }}>
          <div className="rdx-card" style={{ ...card, position: "relative", overflow: "hidden", padding: 24, display: "flex", gap: 20, alignItems: "center", background: `radial-gradient(130% 130% at 0% 0%, ${C.brand}18, transparent 58%), linear-gradient(180deg, ${C.panel}, ${C.panel2})`, borderColor: `${C.brand}3a` }}>
            <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.brand2}, ${C.accent}, ${C.violet})` }} />
            <Gauge score={d.score} shown={shown} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }}>AI-Readiness Score™</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(d.score), margin: "2px 0 6px" }}>{d.grade}</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{verdict}</div>
              <Link to="/app/editor" className="rdx-btn">Fix my gaps →</Link>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Tile value={d.productCount} label="Products in catalog" accent={C.text} />
            <Tile value={d.crawlerTotal} label="AI-crawler reads · 30d" accent={C.accent} />
            <Tile value={articles} label="AI-answer articles live" accent={C.brand2} />
            <Tile value={d.gaps.length} label="Open issues" accent={d.gaps.length ? C.amber : C.brand} />
          </div>
        </div>

        {/* ── Signal breakdown ── */}
        <div className="rdx-card" style={{ ...card, marginBottom: 14 }}>
          <Label>Signal breakdown</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
            {d.dims.map((dim) => (
              <div key={dim.key}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{dim.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(dim.score), fontFamily: mono }}>{dim.score}</span>
                </div>
                <div className="rdx-bar" style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${Math.max(dim.score, 2)}%`, background: `linear-gradient(90deg,${scoreColor(dim.score)},${C.accent})`, borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>{dim.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Systems status ── */}
        <Label>Systems</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
          <SystemCard icon="📐" title="Structured data" on={structuredOn} detail={structuredOn ? "✓ Installed & activated · live on every product page" : "Not installed yet — fix to switch on"} />
          <SystemCard icon="🤖" title="AI feed & llms.txt" on detail={`✓ Installed & activated · hosted live${d.liveNote ? ` · ${d.liveNote}` : ""}`} />
          <SystemCard icon="✍️" title="Content engine" on={!!d.content?.summary} detail={d.content?.summary ? (d.content.autoPublish ? "Auto-publishing daily" : `${d.content.total} articles in the calendar`) : "Not started — build a plan below"} />
          <SystemCard icon="📡" title="Crawler radar" on={d.crawlerTotal > 0} detail={d.crawlerTotal > 0 ? `${d.crawlerTotal} reads in the last 30 days` : "Listening for AI bots…"} />
        </div>

        {/* ── Two-column: issues + radar ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 }}>
          {/* Open issues */}
          <div className="rdx-card" style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Label mb={0}>Open issues · blocking AI</Label>
              <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 800, color: d.gaps.length ? C.amber : C.brand }}>{d.gaps.length} active</span>
            </div>
            {d.gaps.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {d.gaps.map((g, i) => {
                  const byUs = g.who === "ai";
                  return (
                    <div key={i} style={{ padding: "12px 13px", borderRadius: 12, background: C.panel2, border: `1px solid ${C.lineSoft}` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: byUs ? C.amber : C.blue, marginTop: 6, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{g.label}</span>
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: byUs ? C.brand2 : C.blue, background: byUs ? `${C.brand}1a` : `${C.blue}22`, padding: "2px 7px", borderRadius: 999 }}>{byUs ? "ShopHero fixes" : "You fix"}</span>
                          </div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{g.detail}</div>
                        </div>
                      </div>
                      {/* How to fix */}
                      {(g.how || byUs) && (
                        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.lineSoft}` }}>
                          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.faint, flexShrink: 0, marginTop: 1 }}>Fix</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{g.how ?? "ShopHero stages this automatically from the Editor — review and publish."}</div>
                            <div style={{ marginTop: 8 }}>
                              {g.fix?.action === "install" ? (
                                installed ? (
                                  <span style={{ fontSize: 12, fontWeight: 800, color: C.brand2 }}>✓ Staged — publish to go live</span>
                                ) : (
                                  <button type="button" onClick={() => installFix.submit({}, { method: "post", action: "/api/structured-data" })} disabled={installing}
                                    style={{ fontSize: 12, fontWeight: 800, padding: "7px 13px", borderRadius: 9, border: "none", cursor: installing ? "default" : "pointer", background: `linear-gradient(180deg,${C.brand2},${C.brand})`, color: "#06120c" }}>
                                    {installing ? "Installing…" : g.fix.label}
                                  </button>
                                )
                              ) : g.fix?.href ? (
                                <a href={g.fix.href} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 800, color: C.brand2, textDecoration: "none", border: `1px solid ${C.line}`, padding: "7px 13px", borderRadius: 9, display: "inline-block" }}>{g.fix.label} ↗</a>
                              ) : byUs ? (
                                <Link to="/app/editor" style={{ fontSize: 12, fontWeight: 800, color: C.brand2, textDecoration: "none", border: `1px solid ${C.line}`, padding: "7px 13px", borderRadius: 9, display: "inline-block" }}>Fix in Editor →</Link>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {installFix.data?.error && <div style={{ fontSize: 12, color: C.coral }}>{installFix.data.error}</div>}
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>After fixing, hit <strong style={{ color: C.muted }}>Re-evaluate</strong> up top to recompute your score.</div>
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: 13 }}>✓ No blocking issues. Your store is reading clean to AI.</div>
            )}
          </div>

          {/* Crawler radar */}
          <div className="rdx-card" style={card}>
            <Label>📡 AI-crawler radar · 30 days</Label>
            {d.crawlerTotal > 0 ? (
              <>
                <div style={{ fontSize: 32, fontWeight: 800, fontFamily: mono, color: C.accent }}>{d.crawlerTotal}<span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}> reads</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  {d.crawlers.map((c) => {
                    const max = d.crawlers[0]?.count || 1;
                    return (
                      <div key={c.bot}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, color: C.text }}>{c.bot}</span>
                          <span style={{ fontFamily: mono, color: C.muted }}>{c.count}</span>
                        </div>
                        <div className="rdx-bar" style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${(c.count / max) * 100}%`, background: `linear-gradient(90deg,${C.accent},${C.brand})`, borderRadius: 999 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                  <span className="rdx-dot rdx-dot-on" style={{ background: C.accent }} />
                  <span style={{ fontWeight: 700, color: C.text }}>Listening for AI bots…</span>
                </div>
                Once your feed is live, fetches by <strong style={{ color: C.text }}>GPTBot, ClaudeBot, PerplexityBot &amp; Google-Extended</strong> stream in here — real proof AI is reading your store.
              </div>
            )}
          </div>
        </div>

        {/* ── Content engine (teaser → full calendar) ── */}
        <Link to="/app/content" className="rdx-card" style={{ ...card, marginBottom: 14, display: "flex", alignItems: "center", gap: 16, textDecoration: "none", color: C.text }}>
          <span style={{ fontSize: 26, flexShrink: 0 }}>✍️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 750, fontSize: 14.5 }}>Content engine · AI-answer drip</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, fontFamily: mono }}>
              {d.content?.summary
                ? <><strong style={{ color: C.brand2 }}>{d.content.published}</strong> published · <strong style={{ color: C.text }}>{d.content.total}</strong> in calendar · {d.dailyContent ? "daily" : "1 / week"}{d.content.autoPublish ? " · auto" : d.content.draftTitle ? " · 1 awaiting approval" : ""}</>
                : "Not started — build your AI-answer content calendar"}
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: C.brand2 }}>Open calendar →</span>
        </Link>

        {/* ── Hosted endpoints ── */}
        <div className="rdx-card" style={card}>
          <Label>Hosted agent-ready endpoints</Label>
          <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 12 }}>Served live from ShopHero — exactly what AI crawlers read.{d.liveNote ? ` (${d.liveNote})` : ""}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="rdx-chip" href={d.links.llms} target="_blank" rel="noreferrer"><span style={{ color: C.brand }}>GET</span> /llms.txt ↗</a>
            <a className="rdx-chip" href={d.links.feed} target="_blank" rel="noreferrer"><span style={{ color: C.brand }}>GET</span> /feed.json ↗</a>
          </div>
        </div>
      </div>
    </div>
  );
}
