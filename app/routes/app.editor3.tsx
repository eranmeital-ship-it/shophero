import { useState } from "react";
import { Link } from "react-router";
import "../styles/shophero.css";

/**
 * LAYOUT PROTOTYPE — Editor 3 ("Canvas-first + docked assistant").
 * Presentational only. The preview is the hero; the AI/chat/tasks live in a
 * collapsible right dock you summon — like a modern site builder.
 */
const CHIPS = ["✨ Improve", "🚀 PDP", "🔍 SEO", "🧠 AEO", "🧩 Section", "📝 Content"];

export default function Editor3() {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dock, setDock] = useState(true);
  const [tab, setTab] = useState<"chat" | "tasks" | "optimize">("chat");
  return (
    <div className="sh-e3">
      <div className="sh-e2-flag">Layout preview · <strong>Editor 3 — Canvas-first + docked assistant</strong> · placeholder content</div>

      <header className="sh-e3-bar">
        <div className="sh-brand"><div className="sh-brand-mark sh-brand-mark-theme">🎨</div><div className="sh-brand-name">Working copy · v1.4</div></div>
        <div className="sh-e3-modes"><button className="sh-mode is-active">Edit</button><button className="sh-mode">Optimize</button></div>
        <div className="sh-header-right">
          <span className="sh-pill sh-pill-sm">Usage <strong>$2.40</strong></span>
          <button className="sh-icon-btn sh-icon-btn-sm" title="Version history">🕘</button>
          <button className="sh-icon-btn sh-icon-btn-sm" title="How it works">?</button>
          <button className="sh-icon-btn sh-icon-btn-sm" onClick={() => setDock((d) => !d)} title="Toggle assistant">{dock ? "→" : "✦"}</button>
        </div>
      </header>

      <div className="sh-e3-body">
        <section className="sh-e3-canvas">
          <div className="sh-e3-device">
            <button className={device === "desktop" ? "is-active" : ""} onClick={() => setDevice("desktop")}>🖥 Desktop</button>
            <button className={device === "mobile" ? "is-active" : ""} onClick={() => setDevice("mobile")}>📱 Mobile</button>
          </div>
          <div className={`sh-e3-frame ${device}`}>
            <div className="sh-e3-ph">Live preview — the hero of the screen<br /><span>click any element to edit it inline · your store, full-size</span></div>
          </div>
          <div className="sh-e3-quick">
            {CHIPS.map((c) => <button key={c} className="sh-chip">{c}</button>)}
          </div>
          <div className="sh-e3-pending">
            <span><strong>1</strong> change staged</span>
            <button className="sh-btn sh-btn-ghost sh-btn-sm">Discard</button>
            <button className="sh-btn sh-btn-primary sh-btn-sm">Accept</button>
          </div>
        </section>

        {dock && (
          <aside className="sh-e3-dock">
            <div className="sh-e3-docktabs">
              <button className={tab === "chat" ? "is-active" : ""} onClick={() => setTab("chat")}>✦ Assistant</button>
              <button className={tab === "tasks" ? "is-active" : ""} onClick={() => setTab("tasks")}>Tasks</button>
              <button className={tab === "optimize" ? "is-active" : ""} onClick={() => setTab("optimize")}>Optimize</button>
            </div>
            {tab === "chat" && (
              <div className="sh-e3-dockbody">
                <div className="sh-e2-bubble user">Make my hero headline bigger + add a CTA.</div>
                <div className="sh-e2-bubble ai">✓ Updated the hero. See it on the canvas, then Accept.</div>
                <div className="sh-e2-tools">↳ edited sections/hero.liquid</div>
              </div>
            )}
            {tab === "tasks" && (
              <div className="sh-e3-dockbody">
                {["✨ Improve my store", "🚀 Build PDP", "🧠 AEO Brain", "🧩 Add Section", "📝 Write Content"].map((t) => (
                  <button key={t} className="sh-e3-taskrow">{t}<span>→</span></button>
                ))}
              </div>
            )}
            {tab === "optimize" && (
              <div className="sh-e3-dockbody" style={{ alignItems: "center" }}>
                <div className="sh-rings" style={{ marginTop: 8 }}>
                  {[["SEO", 72, "#0a84ff"], ["CRO", 58, "#f5a623"], ["AEO", 84, "#16a34a"]].map(([l, v, c]) => (
                    <div key={l as string} className="sh-ring-wrap">
                      <div className="sh-ring" style={{ ["--val" as string]: v as number, ["--c" as string]: c as string } as React.CSSProperties}><span className="sh-ring-num">{v as number}</span></div>
                      <span className="sh-ring-lbl">{l as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="sh-e3-composer">
              <input className="sh-e2-input" placeholder="Ask ShopHero…" />
              <button className="sh-btn sh-btn-primary sh-btn-sm">Send</button>
            </div>
          </aside>
        )}
      </div>

      <Link to="/app/editor" className="sh-e2-exit">← Back to the current editor</Link>
    </div>
  );
}
