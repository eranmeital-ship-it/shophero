import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, Link } from "react-router";
import type { CSSProperties } from "react";
import { authenticate } from "../shopify.server";
import { getActiveTier } from "../lib/billing.server";
import { TIERS } from "../lib/plans";
import { getPlan } from "../lib/content-plan.server";
import type { ContentPiece } from "../lib/content-strategy.server";

/**
 * Content calendar — the dedicated home for the AI-answer drip: the prioritized
 * queue, the approval process, and the daily/weekly cadence. Shares the
 * /api/content-plan actions with the dashboard.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const tier = await getActiveTier(admin).catch(() => null);
  let content: { summary: string | null; status: string; published: number; queue: ContentPiece[]; total: number; draftTitle: string | null; autoPublish: boolean } | null = null;
  try {
    const cp = await getPlan(session.shop);
    if (cp) {
      let queue: ContentPiece[] = [];
      try { queue = JSON.parse(cp.queue || "[]"); } catch { /* ignore */ }
      content = { summary: cp.strategySummary, status: cp.status, published: cp.publishedCount, queue, total: queue.length, draftTitle: cp.draftTitle, autoPublish: cp.autoPublish };
    }
  } catch { /* ignore */ }
  return {
    content,
    dailyContent: tier ? TIERS[tier].dailyContent : false,
    tierLabel: tier ? TIERS[tier].label.replace("ShopHero ", "") : null,
  };
}

const C = {
  bg: "#0a0e09", panel: "#121a10", panel2: "#0e140c", line: "#26331f", lineSoft: "#1c2618",
  text: "#f2f6f0", muted: "#9fb098", faint: "#6f7d68",
  brand: "#6ec531", brand2: "#a3e35c", accent: "#34e0a1", violet: "#7b6cf6",
};
const card: CSSProperties = { background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22 };
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const btn: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 800, fontSize: 13.5, padding: "11px 18px", borderRadius: 11, border: "none", cursor: "pointer", background: `linear-gradient(180deg,${C.brand2},${C.brand})`, color: "#06120c", textDecoration: "none" };

export default function ContentCalendar() {
  const d = useLoaderData<typeof loader>();
  const analyze = useFetcher();
  const act = useFetcher();
  const analyzing = analyze.state !== "idle";
  const acting = act.state !== "idle";
  const c = d.content;

  // Project the queue onto real calendar dates at the tier's cadence.
  const cadenceDays = d.dailyContent ? 1 : 7;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dk = (dt: Date) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
  type Slot = { title: string; intent: string; ready?: boolean };
  const byDay = new Map<string, Slot[]>();
  const addSlot = (dt: Date, s: Slot) => { const k = dk(dt); const a = byDay.get(k) ?? []; a.push(s); byDay.set(k, a); };
  if (c?.draftTitle && !c.autoPublish) addSlot(today, { title: c.draftTitle, intent: "review", ready: true });
  (c?.queue ?? []).forEach((p, i) => addSlot(new Date(today.getTime() + (i + 1) * cadenceDays * 86400000), { title: p.title, intent: p.intent }));
  const gridStart = new Date(today); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridDays = Array.from({ length: 35 }, (_, i) => new Date(gridStart.getTime() + i * 86400000));
  const intentColor: Record<string, string> = { buying: C.brand, research: C.accent, support: C.violet, brand: "#e8941a", review: C.brand2 };

  return (
    <div style={{
      color: C.text, minHeight: "100vh", margin: "-16px", padding: "22px 22px 48px",
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: `radial-gradient(900px 520px at 8% -8%, ${C.brand}12, transparent 58%), ${C.bg}`,
    }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 19, fontWeight: 800, display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontSize: 20 }}>🗓️</span> Content calendar</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>Your AI-answer article drip — the queue, the cadence, and the approval flow.</div>
        </div>

        <div style={card}>
          {c?.summary ? (
            <>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 8 }}>{c.summary}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14, fontFamily: mono }}>
                <strong style={{ color: C.brand2 }}>{c.published}</strong> published · <strong style={{ color: C.text }}>{c.total}</strong> in calendar · <strong style={{ color: C.text }}>{d.dailyContent ? "daily" : "1 / week"}</strong> cadence
              </div>

              {/* approval toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {[`🗓️ Drafted ${d.dailyContent ? "daily" : "weekly"}`, c.autoPublish ? "⚡ Auto-approved" : "✅ You approve", "🚀 Published live"].map((s, i, arr) => (
                    <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: i === 1 && !c.autoPublish ? C.brand2 : C.text, background: i === 1 && !c.autoPublish ? `${C.brand}18` : "rgba(255,255,255,0.04)", border: `1px solid ${i === 1 && !c.autoPublish ? C.brand + "44" : C.lineSoft}`, padding: "5px 11px", borderRadius: 999 }}>{s}</span>
                      {i < arr.length - 1 && <span style={{ color: C.faint, fontSize: 13 }}>→</span>}
                    </span>
                  ))}
                </div>
                <act.Form method="post" action="/api/content-plan">
                  <input type="hidden" name="intent" value="autopublish" />
                  <input type="hidden" name="value" value={c.autoPublish ? "off" : "on"} />
                  <button type="submit" disabled={acting} style={{ fontSize: 12, fontWeight: 800, padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: c.autoPublish ? "none" : `1px solid ${C.line}`, background: c.autoPublish ? C.brand : "transparent", color: c.autoPublish ? "#06120c" : C.muted }}>
                    {c.autoPublish ? "✓ Auto-publishing on" : "Approve all · auto-publish"}
                  </button>
                </act.Form>
              </div>

              {c.draftTitle && !c.autoPublish && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.brand}55`, background: `${C.brand}12`, marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.brand2 }}>● Ready to review</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginTop: 2 }}>{c.draftTitle}</div>
                  </div>
                  <act.Form method="post" action="/api/content-plan">
                    <input type="hidden" name="intent" value="publish" />
                    <button style={btn} type="submit" disabled={acting}>{acting ? "Publishing…" : "Approve & publish →"}</button>
                  </act.Form>
                </div>
              )}

              {/* The calendar grid */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{today.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                  <div style={{ fontSize: 11.5, color: C.faint }}>Upcoming articles on their {c.autoPublish ? "publish" : "draft"} dates</div>
                </div>

                <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.line}`, background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))" }}>
                  {/* weekday header — gray/white gradient strip */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))", borderBottom: `1px solid ${C.line}` }}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
                      <div key={w} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase", padding: "10px 0" }}>{w}</div>
                    ))}
                  </div>
                  {/* day cells */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                    {gridDays.map((dt, idx) => {
                      const slots = byDay.get(dk(dt)) ?? [];
                      const isToday = dk(dt) === dk(today);
                      const inMonth = dt.getMonth() === today.getMonth();
                      const col = idx % 7, row = Math.floor(idx / 7);
                      return (
                        <div key={idx} style={{
                          minHeight: 118, padding: 9, minWidth: 0, display: "flex", flexDirection: "column", gap: 5,
                          borderRight: col < 6 ? `1px solid ${C.lineSoft}` : "none",
                          borderTop: row > 0 ? `1px solid ${C.lineSoft}` : "none",
                          background: isToday
                            ? `linear-gradient(180deg, ${C.brand}22, ${C.brand}07)`
                            : inMonth
                              ? "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.01))"
                              : "linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.06))",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: isToday ? C.brand2 : inMonth ? C.muted : C.faint, fontFamily: mono }}>{dt.getDate()}</span>
                            {isToday && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", color: "#06120c", background: C.brand2, padding: "2px 6px", borderRadius: 999 }}>TODAY</span>}
                          </div>
                          {slots.slice(0, 3).map((s, i) => (
                            <div key={i} title={s.title} style={{
                              fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, color: "#0a1206",
                              background: `linear-gradient(180deg, ${intentColor[s.intent] ?? C.brand}, ${intentColor[s.intent] ?? C.brand}cc)`,
                              borderRadius: 6, padding: "4px 6px", overflow: "hidden",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                              boxShadow: s.ready ? `0 0 0 1.5px ${C.brand2}` : "none",
                            }}>{s.ready ? "● " : ""}{s.title}</div>
                          ))}
                          {slots.length > 3 && <div style={{ fontSize: 9.5, color: C.faint, fontWeight: 700 }}>+{slots.length - 3} more</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: C.muted }}>
                  {Object.entries(intentColor).filter(([k]) => k !== "review").map(([k, col]) => (
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: col }} />{k}</span>
                  ))}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.brand, boxShadow: `0 0 0 1.5px ${C.brand2}` }} />ready to review</span>
                </div>
              </div>

              {!d.dailyContent && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 12, background: `${C.violet}12`, border: `1px solid ${C.violet}3a`, marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                    <strong style={{ color: C.text }}>Starter publishes 1 article/week.</strong> Upgrade to Pro for a <strong style={{ color: C.text }}>daily</strong> article + product-description rewrites.
                  </div>
                  <Link to="/app/pricing" style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: "#fff", textDecoration: "none", background: `linear-gradient(120deg,#a78bfa,${C.violet})`, padding: "9px 15px", borderRadius: 10 }}>Upgrade to Pro →</Link>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
              Analyze your store — best sellers, categories, content gaps — to build a prioritized calendar of AI-answer articles that keep earning SEO/AI traffic, drafted on a cadence for your approval.
            </div>
          )}
          <analyze.Form method="post" action="/api/content-plan">
            <input type="hidden" name="intent" value="analyze" />
            <button style={btn} type="submit" disabled={analyzing}>
              {analyzing ? "Analyzing your store…" : c?.summary ? "Rebuild content plan" : "Analyze my store & build my calendar →"}
            </button>
          </analyze.Form>
          {act.data && typeof act.data === "object" && "error" in act.data && (act.data as { error?: string }).error && (
            <div style={{ fontSize: 12, color: "#e0457f", marginTop: 10 }}>{(act.data as { error: string }).error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
