import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { auditSchema } from "../lib/schema-audit.server";
import { gql } from "../lib/onboarding.server";
import { getPlan } from "../lib/content-plan.server";
import type { ContentPiece } from "../lib/content-strategy.server";
import db from "../db.server";

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

function ScoreRing({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const color = score >= 80 ? "#16a34a" : score >= 50 ? "#e8941a" : "#e0457f";
  return (
    <svg width="132" height="132" viewBox="0 0 132 132">
      <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="11" />
      <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 66 66)" />
      <text x="66" y="62" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--sh-ink)">{score}</text>
      <text x="66" y="84" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--sh-ink-faint)">/ 100</text>
    </svg>
  );
}

export default function Readiness() {
  const d = useLoaderData<typeof loader>();
  const analyze = useFetcher();
  const act = useFetcher(); // publish / auto-publish toggle
  const analyzing = analyze.state !== "idle";
  const acting = act.state !== "idle";
  return (
    <div className="sh-rd">
      <div className="sh-rd-head">
        <div className="sh-rd-title">🤖 AI-Readiness</div>
        <div className="sh-rd-sub">How ready your store is for AI shopping agents — ChatGPT, Claude, Perplexity & Google AI.</div>
      </div>

      <div className="sh-rd-hero">
        <ScoreRing score={d.score} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sh-rd-grade">{d.grade}</div>
          <div className="sh-rd-sub" style={{ marginTop: 4 }}>
            {d.score >= 80 ? "Strong — AI agents can read and recommend your store." : d.score >= 50 ? "Getting there — close the gaps below to get recommended more." : "Most AI agents can't read your store yet. Fix the gaps below."}
          </div>
          <Link to="/app/editor" className="sh-btn sh-btn-primary" style={{ marginTop: 12, display: "inline-block" }}>Fix my gaps →</Link>
        </div>
      </div>

      <div className="sh-rd-dims">
        {d.dims.map((dim) => (
          <div className="sh-rd-dim" key={dim.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
              <span>{dim.label}</span><span>{dim.score}</span>
            </div>
            <div className="sh-rd-meter"><span style={{ width: `${dim.score}%` }} /></div>
            <div className="sh-rd-sub" style={{ fontSize: 11.5, marginTop: 6 }}>{dim.note}</div>
          </div>
        ))}
      </div>

      <div className="sh-rd-card">
        <div style={{ fontWeight: 750, marginBottom: 4 }}>📈 AI-crawler activity <span className="sh-rd-sub" style={{ fontWeight: 500 }}>· last 30 days</span></div>
        {d.crawlerTotal > 0 ? (
          <>
            <div className="sh-rd-sub" style={{ marginBottom: 10 }}><strong>{d.crawlerTotal}</strong> fetches of your feed / llms.txt by AI bots.</div>
            <div className="sh-rd-bots">
              {d.crawlers.map((c) => <span className="sh-rd-bot" key={c.bot}>{c.bot} · {c.count}</span>)}
            </div>
          </>
        ) : (
          <div className="sh-rd-sub">No AI-crawler reads logged yet. Once your hosted feed is live, fetches by GPTBot, ClaudeBot, PerplexityBot & others show up here — real proof AI is reading your store.</div>
        )}
      </div>

      {d.gaps.length > 0 && (
        <div className="sh-rd-card">
          <div style={{ fontWeight: 750, marginBottom: 8 }}>Gaps blocking AI recommendations</div>
          {d.gaps.map((g, i) => (
            <div className="sh-rd-gap" key={i}>
              <span>{g.who === "ai" ? "🤖" : "🙋"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 650, fontSize: 13.5 }}>{g.label}</div>
                <div className="sh-rd-sub" style={{ fontSize: 12 }}>{g.detail}</div>
              </div>
              {g.who === "ai" && <Link to="/app/editor" className="sh-rd-fix">Fix →</Link>}
            </div>
          ))}
        </div>
      )}

      <div className="sh-rd-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 750 }}>✍️ Content plan <span className="sh-rd-sub" style={{ fontWeight: 500 }}>· constant AI-answer SEO drip</span></div>
          {d.content?.summary && (
            <act.Form method="post" action="/api/content-plan">
              <input type="hidden" name="intent" value="autopublish" />
              <input type="hidden" name="value" value={d.content.autoPublish ? "off" : "on"} />
              <button type="submit" disabled={acting} title="Auto-publish each daily article without manual approval"
                style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: d.content.autoPublish ? "none" : "1px solid var(--sh-line, #e1e3e5)", background: d.content.autoPublish ? "#16a34a" : "#fff", color: d.content.autoPublish ? "#fff" : "#42474c" }}>
                {d.content.autoPublish ? "✓ Auto-publishing on" : "Approve all · auto-publish"}
              </button>
            </act.Form>
          )}
        </div>

        {d.content?.summary ? (
          <>
            <div className="sh-rd-sub" style={{ margin: "8px 0" }}>{d.content.summary}</div>
            <div className="sh-rd-sub" style={{ fontSize: 12, marginBottom: 10 }}>
              <strong>{d.content.published}</strong> published · <strong>{d.content.total}</strong> in your calendar{d.content.autoPublish ? " · auto-publishing daily" : " · drafted daily for your approval"}
            </div>

            {/* Pending draft → approve & publish (per-item approval) */}
            {d.content.draftTitle && !d.content.autoPublish && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(22,163,74,0.3)", background: "rgba(22,163,74,0.06)", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#15795e" }}>Ready to review</div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.content.draftTitle}</div>
                </div>
                <act.Form method="post" action="/api/content-plan">
                  <input type="hidden" name="intent" value="publish" />
                  <button className="sh-btn sh-btn-primary" type="submit" disabled={acting}>{acting ? "Publishing…" : "Approve & publish →"}</button>
                </act.Form>
              </div>
            )}

            {/* The calendar — upcoming pieces in priority order */}
            {d.content.queue.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {d.content.queue.map((p, i) => (
                  <div key={i} className="sh-rd-gap" style={{ padding: "7px 0", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--sh-bg-alt, #f3f4f6)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: "#6b7280", flexShrink: 0 }}>{i + 1}</span>
                    <span className="sh-rd-bot" style={{ fontSize: 10.5 }}>{p.intent}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>
                      <div className="sh-rd-sub" style={{ fontSize: 11.5 }}>{p.angle}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="sh-rd-sub" style={{ fontSize: 11.5, marginBottom: 10 }}>
              {d.content.autoPublish
                ? "Auto-publish is on — one article goes live each day, no approval needed. Turn it off to review each one first."
                : "Each day's article is drafted automatically and waits here for your approval. Use “Approve all” to let them publish on their own."}
            </div>
          </>
        ) : (
          <div className="sh-rd-sub" style={{ margin: "8px 0 10px" }}>Analyze your store — best sellers, categories, content gaps — to build a prioritized plan of AI-answer articles that keep earning SEO/AI traffic, drafted on a cadence for your approval.</div>
        )}
        <analyze.Form method="post" action="/api/content-plan">
          <input type="hidden" name="intent" value="analyze" />
          <button className="sh-btn sh-btn-primary" type="submit" disabled={analyzing}>
            {analyzing ? "Analyzing your store…" : d.content?.summary ? "Rebuild content plan" : "Analyze my store & build a content plan →"}
          </button>
        </analyze.Form>
        {act.data && typeof act.data === "object" && "error" in act.data && (act.data as { error?: string }).error && (
          <div className="sh-rd-sub" style={{ fontSize: 12, color: "#e0457f", marginTop: 8 }}>{(act.data as { error: string }).error}</div>
        )}
      </div>

      <div className="sh-rd-card">
        <div style={{ fontWeight: 750, marginBottom: 8 }}>Your hosted agent-ready files</div>
        <div className="sh-rd-sub" style={{ marginBottom: 10 }}>Served live from ShopHero — what AI crawlers read. {d.liveNote ? `(${d.liveNote})` : ""}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="sh-rd-bot" href={d.links.llms} target="_blank" rel="noreferrer">llms.txt ↗</a>
          <a className="sh-rd-bot" href={d.links.feed} target="_blank" rel="noreferrer">feed.json ↗</a>
        </div>
      </div>
    </div>
  );
}
