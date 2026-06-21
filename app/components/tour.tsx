import { useEffect, useState } from "react";

export interface TourStep {
  /** data-tour value of the element to spotlight; omit for a centered step. */
  target?: string;
  title: string;
  body: string;
  /** Override the primary button label (e.g. the welcome CTA). */
  cta?: string;
}

/**
 * Lightweight product walkthrough — a welcome popup, then spotlight coach-marks
 * anchored to elements tagged with data-tour. No deps; pure positioning.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];

  // Lock page scroll while the tour is open so coach-marks can't shift the layout.
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      window.scrollTo(0, 0);
    };
  }, []);

  useEffect(() => {
    function measure() {
      if (!step?.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  if (!step) return null;
  const last = i === steps.length - 1;
  const next = () => (last ? onClose() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));

  const PAD = 6;
  const CARD_W = 300;
  const CARD_H = 210; // estimate, for choosing a side that keeps the card on-screen
  let cardStyle: React.CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampX = (x: number) => Math.min(Math.max(12, x), vw - CARD_W - 12);
    const clampY = (y: number) => Math.min(Math.max(12, y), vh - CARD_H - 12);
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const spaceLeft = rect.left;
    const spaceRight = vw - rect.right;
    const GAP = 14;
    // Prefer below, then above, then beside (left/right) — so tall/full-height
    // targets like the preview show the card on the side, never off-screen.
    if (spaceBelow >= CARD_H + 20) cardStyle = { top: rect.bottom + GAP, left: clampX(rect.left) };
    else if (spaceAbove >= CARD_H + 20) cardStyle = { top: Math.max(12, rect.top - CARD_H - GAP), left: clampX(rect.left) };
    else if (spaceLeft >= CARD_W + 20) cardStyle = { left: rect.left - CARD_W - GAP, top: clampY(rect.top) };
    else if (spaceRight >= CARD_W + 20) cardStyle = { left: rect.right + GAP, top: clampY(rect.top) };
    else cardStyle = { top: clampY(rect.top), left: clampX(rect.left) };
  }

  return (
    <div className="sh-tour">
      {rect ? (
        <div
          className="sh-tour-spot"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      ) : (
        <div className="sh-tour-dim" />
      )}

      <div className="sh-tour-card" style={cardStyle}>
        {rect ? (
          <div className="sh-tour-step">Step {i + 1} of {steps.length}</div>
        ) : (
          <div className="sh-tour-mark">S</div>
        )}
        <div className="sh-tour-title">{step.title}</div>
        <div className="sh-tour-body">{step.body}</div>
        <div className="sh-tour-actions">
          {!last ? <button className="sh-tour-skip" onClick={onClose}>Skip</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            {i > 0 && <button className="sh-btn sh-btn-ghost" onClick={back}>Back</button>}
            <button className="sh-btn sh-btn-primary" onClick={next}>{step.cta ?? (last ? "Start 🚀" : "Next →")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
