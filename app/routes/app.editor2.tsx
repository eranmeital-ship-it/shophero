import { useState } from "react";
import { Link } from "react-router";
import "../styles/shophero.css";

/**
 * LAYOUT PROTOTYPE — Editor 2 ("Command bar + big preview").
 * Presentational only (placeholder content) so the arrangement can be evaluated
 * against Editor 1 (current) and Editor 3. Not wired to the agent/fetchers.
 */
const CHIPS = ["✨ Improve my store", "🚀 Build PDP", "🔍 SEO", "🧠 AEO Brain", "🧩 Add Section", "📝 Write Content", "🖼️ Stock Images"];

export default function Editor2() {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className="sh-e2">
      <div className="sh-e2-flag">Layout preview · <strong>Editor 2 — Command bar + big preview</strong> · placeholder content</div>

      <header className="sh-e2-top">
        <div className="sh-brand">
          <div className="sh-brand-mark sh-brand-mark-theme">🎨</div>
          <div><div className="sh-brand-name">Working copy · v1.4</div><div className="sh-brand-shop">Safe working copy · your live store is untouched</div></div>
        </div>
        <div className="sh-header-right">
          <div className="sh-hr-stack">
            <span className="sh-pill sh-pill-sm">Usage <strong>$2.40</strong></span>
            <span className="sh-pill sh-pill-sm">Managed AI</span>
          </div>
          <div className="sh-hr-stack">
            <button className="sh-icon-btn sh-icon-btn-sm" title="How it works">?</button>
            <button className="sh-icon-btn sh-icon-btn-sm" title="Version history">🕘</button>
          </div>
        </div>
      </header>

      <div className="sh-e2-cmd">
        <div className="sh-e2-cmdrow">
          <input className="sh-e2-input" placeholder="Tell ShopHero what to do — e.g. “make my homepage hero bolder”" />
          <button className="sh-btn sh-btn-primary">Run →</button>
        </div>
        <div className="sh-e2-chips">
          {CHIPS.map((c) => <button key={c} className="sh-chip">{c}</button>)}
        </div>
      </div>

      <div className="sh-e2-body">
        <section className="sh-e2-work">
          <div className="sh-e2-worktabs">
            <button className="sh-mode is-active">Chat</button>
            <button className="sh-mode">Optimize</button>
          </div>
          <div className="sh-e2-thread">
            <div className="sh-e2-bubble user">Make my homepage hero headline bigger and add a clear CTA.</div>
            <div className="sh-e2-bubble ai">✓ Updated the hero — larger headline, a high-contrast “Shop now” button, on-brand colors. Preview it on the right, then Accept to publish.</div>
            <div className="sh-e2-tools">↳ read sections/hero.liquid · ↳ edited theme</div>
          </div>
          <div className="sh-e2-pending">
            <span><strong>1</strong> change staged — review on the right</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sh-btn sh-btn-ghost">Discard</button>
              <button className="sh-btn sh-btn-primary">Accept change</button>
            </div>
          </div>
          <div className="sh-e2-composer">
            <input className="sh-e2-input" placeholder="Reply or ask for a tweak…" />
            <button className="sh-btn sh-btn-primary">Send</button>
          </div>
        </section>

        <section className="sh-e2-preview">
          <div className="sh-e2-pvbar">
            <span className="sh-dim">shophero.myshopify.com</span>
            <div className="sh-e2-device">
              <button className={device === "desktop" ? "is-active" : ""} onClick={() => setDevice("desktop")}>🖥 Desktop</button>
              <button className={device === "mobile" ? "is-active" : ""} onClick={() => setDevice("mobile")}>📱 Mobile</button>
            </div>
          </div>
          <div className="sh-e2-stage">
            <div className={`sh-e2-frame ${device}`}>
              <div className="sh-e2-ph">Live preview<br /><span>your storefront renders here — large, the focus of the screen</span></div>
            </div>
          </div>
        </section>
      </div>

      <Link to="/app/editor" className="sh-e2-exit">← Back to the current editor</Link>
    </div>
  );
}
