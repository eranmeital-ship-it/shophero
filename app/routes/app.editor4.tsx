import { useEffect, useState } from "react";
import { Link } from "react-router";
import "../styles/shophero.css";

/**
 * LAYOUT PROTOTYPE — Editor 4 ("Hybrid: swappable main area + Claude-style chat").
 * Main area swaps: Edit/Design → theme preview · Optimize/Create → management
 * panel (a clean chat whose launcher is a grid of feature tiles; picking one
 * drops a guided plan → pre-questions → checklist into the thread).
 * Presentational only.
 */
type Mode = "edit" | "design" | "optimize" | "create";

const FEATURES = [
  { key: "improve", emoji: "✨", label: "Improve my store" },
  { key: "product", emoji: "🛍️", label: "Fix a product" },
  { key: "redesign", emoji: "🎨", label: "Redesign a page" },
  { key: "descriptions", emoji: "✍️", label: "Write descriptions" },
  { key: "blog", emoji: "📝", label: "Write a blog" },
  { key: "google", emoji: "🔍", label: "Get found on Google" },
  { key: "ai", emoji: "🤖", label: "Get found by AI" },
  { key: "sales", emoji: "📈", label: "Sell more" },
  { key: "trust", emoji: "🛡️", label: "Add trust badges" },
  { key: "faq", emoji: "❓", label: "Add an FAQ" },
  { key: "images", emoji: "🖼️", label: "Find photos" },
  { key: "speed", emoji: "⚡", label: "Make it faster" },
];

const HEADLINES = [
  "What do you want to create?",
  "Let's grow your store today.",
  "What should we improve first?",
  "Tell me a goal — I'll build the plan.",
  "Ready to convert more visitors?",
  "Let's get you cited in AI search.",
  "Describe it. I'll handle the rest.",
  "What can I build for you?",
];

function useTypewriter(pool: string[]) {
  const [i, setI] = useState(0);
  const [txt, setTxt] = useState("");
  const [phase, setPhase] = useState<"type" | "hold" | "erase">("type");
  useEffect(() => {
    const full = pool[i];
    let to: ReturnType<typeof setTimeout>;
    if (phase === "type") {
      if (txt.length < full.length) to = setTimeout(() => setTxt(full.slice(0, txt.length + 1)), 42);
      else to = setTimeout(() => setPhase("hold"), 1600);
    } else if (phase === "hold") {
      to = setTimeout(() => setPhase("erase"), 1400);
    } else {
      if (txt.length > 0) to = setTimeout(() => setTxt(full.slice(0, txt.length - 1)), 22);
      else { setPhase("type"); setI((n) => (n + 1) % pool.length); }
    }
    return () => clearTimeout(to);
  }, [txt, phase, i, pool]);
  return txt;
}

export default function Editor4() {
  const [mode, setMode] = useState<Mode>("create");
  const [flow, setFlow] = useState<string | null>(null);
  const isPreview = mode === "edit" || mode === "design";
  const headline = useTypewriter(HEADLINES);
  const cta = mode === "optimize" ? "Improve →" : "Create →";

  const MODES: { k: Mode; label: string }[] = [
    { k: "edit", label: "Edit" }, { k: "design", label: "Design" },
    { k: "optimize", label: "Optimize" }, { k: "create", label: "Create" },
  ];

  return (
    <div className="sh-e4">
      <div className="sh-e2-flag">Layout preview · <strong>Editor 4 — Hybrid</strong> · placeholder content</div>

      <header className="sh-e4-bar">
        <div className="sh-brand"><div className="sh-brand-mark sh-brand-mark-theme">🎨</div><div className="sh-brand-name">Working copy · v1.4</div></div>
        <div className="sh-e4-modes">
          <span className="sh-e4-modegrp">
            {MODES.slice(0, 2).map((m) => <button key={m.k} className={`sh-e4-mode${mode === m.k ? " is-active" : ""}`} onClick={() => setMode(m.k)}>{m.label}</button>)}
          </span>
          <span className="sh-e4-modesep">preview</span>
          <span className="sh-e4-modegrp">
            {MODES.slice(2).map((m) => <button key={m.k} className={`sh-e4-mode${mode === m.k ? " is-active" : ""}`} onClick={() => setMode(m.k)}>{m.label}</button>)}
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
          <div className="sh-e4-mgmt">
            <div className="sh-e4-chat">
              {mode === "optimize" && (
                <div className="sh-e4-scorestrip">
                  {[["SEO", 72, "#0a84ff"], ["CRO", 58, "#f5a623"], ["AEO", 84, "#16a34a"], ["Speed", 66, "#0a84ff"]].map(([l, v, c]) => (
                    <div key={l as string} className="sh-e4-score"><span className="sh-e4-score-v" style={{ color: c as string }}>{v as number}</span><span className="sh-e4-score-l">{l as string}</span></div>
                  ))}
                  <span className="sh-e4-score-hint">Your store health — pick a feature to improve it.</span>
                </div>
              )}

              {!flow ? (
                <div className="sh-e4-empty">
                  <div className="sh-e4-logo"><span className="sh-e4-logo-mark">◆</span> ShopHero</div>
                  <h2 className="sh-e4-type">{headline}<span className="sh-e4-caret" /></h2>
                  <p>Pick a feature to plan it — or just type what you want.</p>
                  <div className="sh-e4-tiles">
                    {FEATURES.map((f) => (
                      <button key={f.key} className="sh-e4-tile" onClick={() => setFlow(f.key)}>
                        <span className="sh-e4-tile-emoji">{f.emoji}</span>
                        <span className="sh-e4-tile-label">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
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
                    <div className="sh-e4-guided-foot">Progress saves automatically — come back anytime to finish. <button className="sh-e4-newflow" onClick={() => setFlow(null)}>← all features</button></div>
                  </div>
                </div>
              )}

              <div className="sh-e4-composer">
                <div className="sh-e4-inputrow">
                  <textarea className="sh-e4-input" rows={1} placeholder="Message ShopHero…" />
                  <button className="sh-e4-cta">{cta}</button>
                </div>
                <div className="sh-e4-hint">Deterministic steps are free; AI steps show their cost before running.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Link to="/app/editor" className="sh-e2-exit">← Back to the current editor</Link>
    </div>
  );
}
