import type { LoaderFunctionArgs } from "react-router";
import { useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

const STEPS: { n: number; title: string; body: string }[] = [
  { n: 1, title: "We scan your store", body: "ShopHero reads your real catalog and scores how ready you are for AI shopping agents — your AI-Readiness Score™, with the exact gaps ranked." },
  { n: 2, title: "On-page gets fixed", body: "Structured data, a hosted AI feed and llms.txt go live so ChatGPT, Claude, Perplexity & Google AI can actually read your products — instantly, across the whole catalog." },
  { n: 3, title: "Content keeps earning", body: "The content engine drafts AI-answer articles from your best sellers on a cadence — you approve, or let them auto-publish." },
  { n: 4, title: "Authority compounds", body: "On Authority, monthly press distribution earns high-trust backlinks — the off-page signal AI uses to decide who to recommend." },
];

const CARDS: { emoji: string; title: string; body: string }[] = [
  { emoji: "🛰️", title: "Your AI-Readiness Score™", body: "One 0–100 score for how well AI shopping agents can read and recommend your store — blended from structured-data coverage, readable content, and your hosted feed. The Control Center is where you watch it move; hit Re-evaluate any time to recompute it live after a fix." },
  { emoji: "📐", title: "On-page — done automatically", body: "ShopHero installs JSON-LD schema (Product, Offer, Review, FAQ, Breadcrumb) as a theme snippet, so it covers every product page at once — no per-product work, no matter your catalog size. Your llms.txt and AI-retrieval feed are hosted by ShopHero and kept fresh." },
  { emoji: "🗓️", title: "Content calendar & approvals", body: "Open Content calendar to see your prioritized queue of AI-answer articles. Each is drafted on a cadence and waits for you: Approve & publish one at a time, or flip Approve all · auto-publish to let them go live hands-off. Starter publishes 1/week; Pro publishes daily." },
  { emoji: "🌐", title: "Authority & PR (off-page)", body: "The Authority tier runs a monthly press release across 400+ news sites (Yahoo Finance, Benzinga, MarketWatch & more) via MediaFuse — earning high-authority backlinks and brand mentions that build the trust AI weighs when recommending stores. See the opportunity under Authority & PR." },
  { emoji: "📦", title: "Big catalogs — safe 50/day rollout", body: "Per-product AI work (descriptions, SEO meta, image alt) rolls out at up to 50 products/day in the background, resumable and spend-capped — so a large catalog never runs all at once. Schema is instant and size-independent." },
  { emoji: "📡", title: "Proof it's working", body: "The crawler radar logs real fetches by GPTBot, ClaudeBot, PerplexityBot & Google-Extended — actual evidence AI is reading your store, not vanity metrics. Watch the reads climb in the Control Center." },
  { emoji: "🛡️", title: "You're always in control", body: "Theme edits are staged on a working copy and only go live when you publish. Live-store changes (articles, collections) need your approval. Every change is reversible, and your data is never sold." },
  { emoji: "💳", title: "Plans & upgrading", body: "Starter ($49) gets you AI-readable + 1 article/week. Pro ($149) adds daily articles, product-description rewrites and live re-optimization. Authority ($399) adds the PR/backlink engine. Upgrade anytime under Plans & upgrade — 3-day trial, cancel from Shopify." },
];

export default function Tutorials() {
  const navigate = useNavigate();
  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <div className="sh-doc-kicker">Learn</div>
        <h1>How ShopHero works</h1>
        <p className="sh-doc-lead">
          ShopHero makes your store the one AI recommends — by fixing it on-page, fueling it with
          content, and building real authority off-page. Here&apos;s the whole system.
        </p>

        {/* How it works — 4 steps */}
        <div className="sh-card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}><span className="sh-card-emoji">⚙️</span> The flow, end to end</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 12 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ display: "flex", gap: 11 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: "linear-gradient(135deg,#34e0a1,#7b6cf6)", color: "#06120c", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{s.n}</span>
                <div>
                  <div style={{ fontWeight: 750, fontSize: 14 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: "#5b6b57", lineHeight: 1.5, marginTop: 2 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sh-grid2">
          {CARDS.map((c) => (
            <div key={c.title} className="sh-card">
              <h3><span className="sh-card-emoji">{c.emoji}</span> {c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>

        <div className="sh-card" style={{ marginTop: 16 }}>
          <h3><span className="sh-card-emoji">🚀</span> Ready?</h3>
          <p>Start in the Control Center to see your score, build your content calendar, or explore the Authority engine.</p>
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="sh-btn sh-btn-dark" onClick={() => navigate("/app")}>Open Control Center →</button>
            <button className="sh-btn" onClick={() => navigate("/app/content")}>Content calendar</button>
            <button className="sh-btn" onClick={() => navigate("/app/authority")}>Authority &amp; PR</button>
          </div>
        </div>
      </div>
    </div>
  );
}
