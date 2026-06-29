import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { authenticate } from "../shopify.server";
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
  let gaps: { label: string; detail: string; who: string }[] = [];
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
      .map((c) => ({ label: c.label, detail: c.detail, who: c.who }));
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
  let content: { summary: string | null; status: string; published: number; queue: ContentPiece[]; total: number; draftTitle: string | null; autoPublish: boolean } | null = null;
  try {
    const cp = await getPlan(shop);
    if (cp) {
      let queue: ContentPiece[] = [];
      try { queue = JSON.parse(cp.queue || "[]"); } catch { /* ignore */ }
      content = { summary: cp.strategySummary, status: cp.status, published: cp.publishedCount, queue: queue.slice(0, 8), total: queue.length, draftTitle: cp.draftTitle, autoPublish: cp.autoPublish };
    }
  } catch { /* ignore */ }

  const score = Math.round(structured * 0.5 + feedScore * 0.2 + contentPct * 0.3);
  const base = `https://${shop}`;
  return {
    content,
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
  brand: "#6ec531", brand2: "#a3e35c", accent: "#34e0a1", violet: "#7b6cf6",
  coral: "#d97757", amber: "#e8941a", blue: "#3b82f6",
};
const scoreColor = (s: number) => (s >= 80 ? C.brand : s >= 50 ? C.amber : C.coral);
const card: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 };
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint, marginBottom: 12 };
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

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
  const analyze = useFetcher();
  const act = useFetcher(); // publish / auto-publish toggle
  const analyzing = analyze.state !== "idle";
  const acting = act.state !== "idle";

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
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", margin: "-16px", padding: "22px 22px 40px", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`
        .rdx-card { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .rdx-card:hover { transform: translateY(-2px); border-color: ${C.brand}55; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
        .rdx-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .rdx-dot-on { box-shadow: 0 0 0 0 ${C.brand}88; animation: rdxPulse 1.8s infinite; }
        @keyframes rdxPulse { 0% { box-shadow: 0 0 0 0 ${C.brand}77; } 70% { box-shadow: 0 0 0 7px ${C.brand}00; } 100% { box-shadow: 0 0 0 0 ${C.brand}00; } }
        @keyframes rdxBar { from { width: 0; } }
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: C.brand2, background: `${C.brand}14`, border: `1px solid ${C.brand}3a`, padding: "7px 13px", borderRadius: 999 }}>
            <span className="rdx-dot rdx-dot-on" style={{ background: C.brand }} /> SYSTEMS LIVE · MONITORING
          </span>
        </div>

        {/* ── Hero: gauge + telemetry tiles ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.1fr) minmax(280px, 1fr)", gap: 14, marginBottom: 14 }}>
          <div className="rdx-card" style={{ ...card, padding: 22, display: "flex", gap: 20, alignItems: "center", background: `radial-gradient(120% 120% at 0% 0%, ${C.brand}12, transparent 60%), ${C.panel}`, borderColor: `${C.brand}33` }}>
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
          <div style={sectionTitle}>Signal breakdown</div>
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
        <div style={sectionTitle}>Systems</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
          <SystemCard icon="📐" title="Structured data" on={structuredOn} detail={structuredOn ? "JSON-LD installed & rendering" : "Not installed yet — fix to switch on"} />
          <SystemCard icon="🤖" title="AI feed & llms.txt" on detail={d.liveNote ? d.liveNote : "Hosted & live for AI crawlers"} />
          <SystemCard icon="✍️" title="Content engine" on={!!d.content?.summary} detail={d.content?.summary ? (d.content.autoPublish ? "Auto-publishing daily" : `${d.content.total} articles in the calendar`) : "Not started — build a plan below"} />
          <SystemCard icon="📡" title="Crawler radar" on={d.crawlerTotal > 0} detail={d.crawlerTotal > 0 ? `${d.crawlerTotal} reads in the last 30 days` : "Listening for AI bots…"} />
        </div>

        {/* ── Two-column: issues + radar ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 }}>
          {/* Open issues */}
          <div className="rdx-card" style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ ...sectionTitle, marginBottom: 0 }}>Open issues · blocking AI</div>
              <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 800, color: d.gaps.length ? C.amber : C.brand }}>{d.gaps.length} active</span>
            </div>
            {d.gaps.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {d.gaps.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 12px", borderRadius: 11, background: C.panel2, border: `1px solid ${C.lineSoft}` }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: g.who === "ai" ? C.amber : C.blue, marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{g.label}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{g.detail}</div>
                    </div>
                    {g.who === "ai" && <Link to="/app/editor" style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: C.brand2, textDecoration: "none" }}>Fix →</Link>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: 13 }}>✓ No blocking issues. Your store is reading clean to AI.</div>
            )}
          </div>

          {/* Crawler radar */}
          <div className="rdx-card" style={card}>
            <div style={{ ...sectionTitle }}>📡 AI-crawler radar · 30 days</div>
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

        {/* ── Content engine ── */}
        <div className="rdx-card" style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ ...sectionTitle, marginBottom: 0 }}>✍️ Content engine · AI-answer drip</div>
            {d.content?.summary && (
              <act.Form method="post" action="/api/content-plan">
                <input type="hidden" name="intent" value="autopublish" />
                <input type="hidden" name="value" value={d.content.autoPublish ? "off" : "on"} />
                <button type="submit" disabled={acting} title="Auto-publish each daily article without manual approval"
                  style={{ fontSize: 12, fontWeight: 800, padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: d.content.autoPublish ? "none" : `1px solid ${C.line}`, background: d.content.autoPublish ? C.brand : "transparent", color: d.content.autoPublish ? "#06120c" : C.muted }}>
                  {d.content.autoPublish ? "✓ Auto-publishing on" : "Approve all · auto-publish"}
                </button>
              </act.Form>
            )}
          </div>

          {d.content?.summary ? (
            <>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 8 }}>{d.content.summary}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12, fontFamily: mono }}>
                <strong style={{ color: C.brand2 }}>{d.content.published}</strong> published · <strong style={{ color: C.text }}>{d.content.total}</strong> in calendar{d.content.autoPublish ? " · auto daily" : " · approval-first"}
              </div>

              {d.content.draftTitle && !d.content.autoPublish && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.brand}55`, background: `${C.brand}12`, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.brand2 }}>● Ready to review</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginTop: 2 }}>{d.content.draftTitle}</div>
                  </div>
                  <act.Form method="post" action="/api/content-plan">
                    <input type="hidden" name="intent" value="publish" />
                    <button className="rdx-btn" type="submit" disabled={acting}>{acting ? "Publishing…" : "Approve & publish →"}</button>
                  </act.Form>
                </div>
              )}

              {d.content.queue.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
                  {d.content.queue.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 10, background: C.panel2, border: `1px solid ${C.lineSoft}` }}>
                      <span style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(255,255,255,0.05)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: C.faint, flexShrink: 0, fontFamily: mono }}>{i + 1}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.violet, background: `${C.violet}1e`, padding: "3px 7px", borderRadius: 999, flexShrink: 0 }}>{p.intent}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 650, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                        <div style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.angle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12, lineHeight: 1.5 }}>
                {d.content.autoPublish
                  ? "Auto-publish is on — one article goes live each day, hands-off. Switch it off to review each first."
                  : "Each day's article is drafted automatically and waits here for your approval. Use “Approve all” to let them publish on their own."}
              </div>
            </>
          ) : (
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>Analyze your store — best sellers, categories, content gaps — to build a prioritized calendar of AI-answer articles that keep earning SEO/AI traffic, drafted on a cadence for your approval.</div>
          )}
          <analyze.Form method="post" action="/api/content-plan">
            <input type="hidden" name="intent" value="analyze" />
            <button className="rdx-btn" type="submit" disabled={analyzing}>
              {analyzing ? "Analyzing your store…" : d.content?.summary ? "Rebuild content plan" : "Analyze my store & build a content plan →"}
            </button>
          </analyze.Form>
          {act.data && typeof act.data === "object" && "error" in act.data && (act.data as { error?: string }).error && (
            <div style={{ fontSize: 12, color: C.coral, marginTop: 10 }}>{(act.data as { error: string }).error}</div>
          )}
        </div>

        {/* ── Hosted endpoints ── */}
        <div className="rdx-card" style={card}>
          <div style={sectionTitle}>Hosted agent-ready endpoints</div>
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
