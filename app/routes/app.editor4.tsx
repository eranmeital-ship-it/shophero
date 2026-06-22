import { useState } from "react";
import { Link } from "react-router";
import "../styles/shophero.css";

/**
 * LAYOUT PROTOTYPE — Editor 4 ("Hybrid: swappable main area + Claude-style chat").
 * The main area switches between the THEME PREVIEW (Edit/Design modes) and a
 * MANAGEMENT PANEL (Optimize/Create modes). The management panel is a clean,
 * Claude-app-style chat whose composer has the premade feature buttons built in;
 * pressing one drops a guided flow (plan → pre-questions → checklist) into the
 * thread. Presentational only.
 */
type Mode = "edit" | "design" | "optimize" | "create";
const FEATURES = [
  { key: "improve", label: "✨ Improve my store" },
  { key: "pdp", label: "🚀 Build PDP" },
  { key: "seo", label: "🔍 SEO" },
  { key: "aeo", label: "🧠 AEO Brain" },
  { key: "section", label: "🧩 Add Section" },
  { key: "content", label: "📝 Write Content" },
];

export default function Editor4() {
  const [mode, setMode] = useState<Mode>("create");
  const [flow, setFlow] = useState<string | null>(null);
  const isPreview = mode === "edit" || mode === "design";

  return (
    <div className="sh-e4">
      <div className="sh-e2-flag">Layout preview · <strong>Editor 4 — Hybrid: swappable main area + Claude-style chat</strong> · placeholder content</div>

      {/* Top bar with the mode switcher that swaps the whole main area */}
      <header className="sh-e4-bar">
        <div className="sh-brand"><div className="sh-brand-mark sh-brand-mark-theme">🎨</div><div className="sh-brand-name">Working copy · v1.4</div></div>
        <div className="sh-e4-modes">
          <span className="sh-e4-modegrp">
            <button className={`sh-e4-mode${mode === "edit" ? " is-active" : ""}`} onClick={() => setMode("edit")}>Edit</button>
            <button className={`sh-e4-mode${mode === "design" ? " is-active" : ""}`} onClick={() => setMode("design")}>Design</button>
          </span>
          <span className="sh-e4-modesep">preview</span>
          <span className="sh-e4-modegrp">
            <button className={`sh-e4-mode${mode === "optimize" ? " is-active" : ""}`} onClick={() => setMode("optimize")}>Optimize</button>
            <button className={`sh-e4-mode${mode === "create" ? " is-active" : ""}`} onClick={() => setMode("create")}>Create</button>
          </span>
          <span className="sh-e4-modesep">manage</span>
        </div>
        <div className="sh-header-right">
          <span className="sh-pill sh-pill-sm">Usage <strong>$2.40</strong></span>
          <button className="sh-icon-btn sh-icon-btn-sm" title="Version history">🕘</button>
          <button className="sh-icon-btn sh-icon-btn-sm" title="How it works">?</button>
        </div>
      </header>

      <div className="sh-e4-main">
        {isPreview ? (
          /* ---- PREVIEW (Edit / Design) ---- */
          <div className="sh-e4-preview">
            <div className="sh-e2-device" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)" }}>
              <button className="is-active">🖥 Desktop</button><button>📱 Mobile</button>
            </div>
            <div className="sh-e4-frame">
              <div className="sh-e2-ph">Theme preview — {mode === "design" ? "click any element to design it inline" : "make and preview theme edits"}<br /><span>full-size storefront · shown only when you're working on the look</span></div>
            </div>
            <button className="sh-e4-jump" onClick={() => setMode("create")}>✦ Ask ShopHero →</button>
          </div>
        ) : (
          /* ---- MANAGEMENT PANEL (Optimize / Create) — Claude-style chat ---- */
          <div className="sh-e4-mgmt">
            <div className="sh-e4-chat">
              {mode === "optimize" && (
                <div className="sh-e4-scorestrip">
                  {[["SEO", 72, "#0a84ff"], ["CRO", 58, "#f5a623"], ["AEO", 84, "#16a34a"], ["Speed", 66, "#0a84ff"]].map(([l, v, c]) => (
                    <div key={l as string} className="sh-e4-score"><span className="sh-e4-score-v" style={{ color: c as string }}>{v as number}</span><span className="sh-e4-score-l">{l as string}</span></div>
                  ))}
                  <span className="sh-e4-score-hint">Your store health — tap a gap below to fix it.</span>
                </div>
              )}

              {!flow ? (
                /* Empty state — Claude-style: centered prompt + feature launcher */
                <div className="sh-e4-empty">
                  <div className="sh-e4-spark">✦</div>
                  <h2>{mode === "optimize" ? "What should we improve?" : "What do you want to create?"}</h2>
                  <p>Describe it, or start from a ready-made feature.</p>
                </div>
              ) : (
                /* After pressing a feature → guided flow injected into the thread */
                <div className="sh-e4-thread">
                  <div className="sh-e2-bubble user">{FEATURES.find((f) => f.key === flow)?.label}</div>
                  <div className="sh-e4-guided">
                    <div className="sh-e4-guided-h">Let's plan this — a couple of quick questions</div>
                    <div className="sh-e4-q">Which products? <span className="sh-e4-opts"><b>All</b><i>Needs work</i><i>Pick some</i></span></div>
                    <div className="sh-e4-q">Tone / focus? <span className="sh-e4-opts"><b>Benefit-led</b><i>Premium</i><i>Playful</i></span></div>
                    <div className="sh-e4-guided-h" style={{ marginTop: 14 }}>Your checklist (run one at a time)</div>
                    {[["Add trust + benefits sections", "Free"], ["Rewrite 20 product descriptions", "~$0.18"], ["Optimize SEO titles + meta", "~$0.12"], ["Install structured data (schema)", "Free"]].map(([t, c], i) => (
                      <div key={i} className="sh-e4-step"><span className="sh-e4-step-n">{i + 1}</span><span className="sh-e4-step-t">{t}</span><span className="sh-e4-step-c">{c}</span><button className="sh-btn sh-btn-primary sh-btn-sm">Run →</button></div>
                    ))}
                    <div className="sh-e4-guided-foot">Progress saves automatically — come back anytime to finish.</div>
                  </div>
                </div>
              )}

              {/* Composer — Claude-style, with the premade feature buttons built IN */}
              <div className="sh-e4-composer">
                <div className="sh-e4-feats">
                  {FEATURES.map((f) => (
                    <button key={f.key} className={`sh-e4-feat${flow === f.key ? " is-active" : ""}`} onClick={() => setFlow(f.key)}>{f.label}</button>
                  ))}
                </div>
                <div className="sh-e4-inputrow">
                  <textarea className="sh-e4-input" rows={1} placeholder="Message ShopHero…  (or tap a feature above to plan it)" />
                  <button className="sh-e4-send">↑</button>
                </div>
                <div className="sh-e4-hint">Tap a feature to plan it; deterministic steps are free, AI steps show their cost first.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Link to="/app/editor" className="sh-e2-exit">← Back to the current editor</Link>
    </div>
  );
}
