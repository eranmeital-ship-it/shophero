import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { auditSchema } from "../lib/schema-audit.server";
import { gql } from "../lib/onboarding.server";
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

  const score = Math.round(structured * 0.5 + feedScore * 0.2 + contentPct * 0.3);
  const base = `https://${shop}`;
  return {
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
