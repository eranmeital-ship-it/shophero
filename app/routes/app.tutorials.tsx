import type { LoaderFunctionArgs } from "react-router";
import { useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

const CARDS: { emoji: string; title: string; body: string }[] = [
  { emoji: "✏️", title: "Edit mode — just describe it", body: "Tell ShopHero what you want in plain English (\"add trust badges under the buy button\"). It edits a safe working copy of your theme, then you review the staged files and click Apply to dev theme. Your live store is never touched directly." },
  { emoji: "🩺", title: "Optimize mode — ranked fixes", body: "Optimize runs a live Lighthouse audit of your storefront and lists the highest-impact opportunities (Speed, SEO, Accessibility), tagged HIGH / MED / LOW. Tap \"Fix it\" on any card and it runs that fix through the normal preview → approve flow." },
  { emoji: "⚡", title: "Quick actions", body: "The chips at the top of Edit mode load curated expert prompts — SEO Genius, Speed Boost, Launch Campaign, Write Content, Redesign Hero. Tap one, tweak it if you like, then Send." },
  { emoji: "🛡️", title: "Two safety gates", body: "Theme file edits are staged and only go live when you click Apply. Changes to live store data (creating collections, pages, blog posts) need a separate Approve & run — nothing is created on your real store without your click." },
  { emoji: "🖥️", title: "Preview any page, any device", body: "Use the page selector to preview Home, Product, Collection, Page, Blog, Cart and more (including alternate templates), and the device toggles for desktop / tablet / mobile. “View changes” shows the exact diff before you apply." },
  { emoji: "💡", title: "Tips for great results", body: "Be specific about the page and the outcome. ShopHero remembers the conversation, so you can iterate (\"make it bigger\", \"now change the color\"). For bulk content, expect it to take longer — it's generating real words." },
];

export default function Tutorials() {
  const navigate = useNavigate();
  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <div className="sh-doc-kicker">Getting started</div>
        <h1>How to use ShopHero</h1>
        <p className="sh-doc-lead">
          ShopHero is a conversational operator for your whole store — theme, products,
          collections, pages and content. Here&apos;s the flow.
        </p>

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
          <p>Head to the editor and try a quick action, or describe your first change.</p>
          <div style={{ marginTop: 14 }}>
            <button className="sh-btn sh-btn-dark" style={{ display: "inline-block" }} onClick={() => navigate("/app")}>
              Open the editor →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
