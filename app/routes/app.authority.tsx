import type { LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";
import type { CSSProperties } from "react";
import { authenticate } from "../shopify.server";
import { getActiveTier } from "../lib/billing.server";
import { TIERS } from "../lib/plans";
import { getMembership, type Membership } from "../lib/link-exchange.server";

/**
 * Authority & PR — the off-page layer (Authority tier). Sells and explains the
 * monthly press distribution + high-authority backlinks that build the trust
 * signal AI uses to decide who to recommend. Shows "Order now" to upgrade, or
 * the live state once the merchant is on Authority.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const tier = await getActiveTier(admin).catch(() => null);
  const canNetwork = tier === "pro" || tier === "authority"; // Pro+
  const membership = await getMembership(session.shop).catch(() => null);
  return { tier, isAuthority: tier === "authority", price: TIERS.authority.amount, canNetwork, membership };
}

const C = {
  bg: "#0a0e09", panel: "#121a10", panel2: "#0e140c", line: "#26331f", lineSoft: "#1c2618",
  text: "#f2f6f0", muted: "#9fb098", faint: "#6f7d68",
  brand: "#6ec531", brand2: "#a3e35c", accent: "#34e0a1", violet: "#7b6cf6", violet2: "#a78bfa", coral: "#d97757",
};
const card: CSSProperties = { background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22 };
const OUTLETS = ["Yahoo Finance", "Benzinga", "MarketWatch", "Associated Press", "Digital Journal", "+400 more"];
const STEPS = [
  { icon: "📝", title: "We write & distribute", desc: "Each month your authority manager publishes a press release about your store across 400+ news sites via MediaFuse." },
  { icon: "🔗", title: "You earn real backlinks", desc: "Those placements link back to your store from high-domain-authority domains — the off-page signal Google and AI weigh heavily." },
  { icon: "🤖", title: "AI learns to trust you", desc: "When AI decides who to recommend, it leans on what authoritative sites say about you. More citations → more recommendations." },
];

function NetworkRow({ label, p }: { label: string; p: Membership["giving"] }) {
  const statusColor = p?.status === "live" ? C.brand2 : p?.status === "missing" ? C.coral : C.muted;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 11, background: C.panel2, border: `1px solid ${C.lineSoft}` }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.faint, width: 64, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {p ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.url.replace(/^https?:\/\//, "")}</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>anchor: “{p.anchor}”</div>
          </>
        ) : <div style={{ fontSize: 12.5, color: C.faint }}>Matching you with the most relevant store…</div>}
      </div>
      {p && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: statusColor }}>{p.status}</span>}
    </div>
  );
}

export default function Authority() {
  const { isAuthority, price, canNetwork, membership } = useLoaderData<typeof loader>();
  const net = useFetcher<{ ok?: boolean; membership?: Membership; error?: string }>();
  const m = (net.data?.membership ?? membership) as Membership | null;
  const joined = !!m?.member && m.member.status !== undefined;
  const active = m?.member?.status === "active";
  return (
    <div style={{
      color: C.text, minHeight: "100vh", margin: "-16px", padding: "22px 22px 48px",
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: `radial-gradient(900px 520px at 8% -8%, ${C.violet}1c, transparent 58%), radial-gradient(820px 520px at 102% -4%, ${C.brand}12, transparent 54%), ${C.bg}`,
    }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontSize: 20 }}>🌐</span> Authority &amp; PR</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>The off-page layer — backlinks &amp; mentions from the most trusted sites on the internet.</div>
          </div>
          {isAuthority ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", color: C.violet2, background: `${C.violet}1e`, border: `1px solid ${C.violet}44`, padding: "7px 13px", borderRadius: 999 }}>● AUTHORITY ACTIVE</span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Authority tier · ${price}/mo</span>
          )}
        </div>

        {/* Hero opportunity */}
        <div style={{ ...card, position: "relative", overflow: "hidden", padding: 28, marginBottom: 16, borderColor: `${C.violet}3a`, background: `radial-gradient(130% 130% at 0% 0%, ${C.violet}1f, transparent 58%), linear-gradient(180deg, ${C.panel}, ${C.panel2})` }}>
          <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.violet2}, ${C.violet}, ${C.brand})` }} />
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.violet2 }}>The opportunity</div>
          <h1 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, lineHeight: 1.2, margin: "8px 0 10px", maxWidth: 640 }}>
            Get cited by the sites <span style={{ background: `linear-gradient(90deg,${C.violet2},${C.brand2})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>AI already trusts.</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.6, maxWidth: 620, marginBottom: 18 }}>
            On-page optimization makes your store readable. <strong style={{ color: C.text }}>Authority makes the rest of the web vouch for you</strong> — a monthly press release distributed to 400+ news outlets, earning high-authority backlinks and brand mentions that compound into AI-ranking power.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {OUTLETS.map((o) => (
              <span key={o} style={{ fontSize: 12.5, fontWeight: 700, color: C.text, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`, borderRadius: 999, padding: "7px 13px" }}>{o}</span>
            ))}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: `${C.violet}14`, border: `1px solid ${C.violet}3a` }}>
            <span style={{ fontSize: 22 }}>📣</span>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>
              <strong>$800 of press-release value</strong> every month — <span style={{ color: C.violet2, fontWeight: 700 }}>powered by MediaFuse</span>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s.title} style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 24 }}>{s.icon}</span>
                <span style={{ fontSize: 26, fontWeight: 800, color: C.violet, opacity: 0.3, fontFamily: "ui-monospace, Menlo, monospace" }}>0{i + 1}</span>
              </div>
              <div style={{ fontWeight: 750, fontSize: 14.5 }}>{s.title}</div>
              <div style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* ShopHero Link Network — 3-way exchange */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.violet2 }}>🔗 ShopHero Link Network</div>
            {joined && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", color: active ? C.brand2 : C.faint }}>{active ? "● ENROLLED" : "PAUSED"}</span>}
          </div>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
            A relevance-matched <strong style={{ color: C.text }}>3-way link exchange</strong> with other ShopHero stores. For every link you give, you get one back — but never to the same store (A→B→C→A), so it reads as organic to search &amp; AI. Our algorithm picks the <strong style={{ color: C.text }}>most relevant</strong> partners by your niche &amp; keywords, and we <strong style={{ color: C.text }}>monitor every link to keep it live</strong> (fair use).
          </p>

          {!canNetwork ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "13px 14px", borderRadius: 12, background: `${C.violet}12`, border: `1px solid ${C.violet}3a` }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.muted }}>The Link Network is a <strong style={{ color: C.text }}>Pro &amp; Authority</strong> feature.</div>
              <Form method="post" action="/app/pricing"><input type="hidden" name="tier" value="pro" />
                <button type="submit" style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer", background: `linear-gradient(120deg,#a78bfa,${C.violet})`, padding: "9px 15px", borderRadius: 10 }}>Upgrade to Pro →</button>
              </Form>
            </div>
          ) : joined && active ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                <NetworkRow label="You give" p={m!.giving} />
                <NetworkRow label="You get" p={m!.receiving} />
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12 }}>Your given link is served from your hosted llms.txt and checked regularly. New matches roll in as the network grows.</div>
              <net.Form method="post" action="/api/link-exchange"><input type="hidden" name="intent" value="pause" />
                <button type="submit" disabled={net.state !== "idle"} style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, padding: "9px 14px", borderRadius: 10, cursor: "pointer" }}>Pause my membership</button>
              </net.Form>
            </>
          ) : joined && !active ? (
            <net.Form method="post" action="/api/link-exchange"><input type="hidden" name="intent" value="resume" />
              <button type="submit" disabled={net.state !== "idle"} style={{ fontSize: 13.5, fontWeight: 800, color: "#06120c", border: "none", cursor: "pointer", background: `linear-gradient(180deg,${C.brand2},${C.brand})`, padding: "12px 20px", borderRadius: 11 }}>Resume my membership →</button>
            </net.Form>
          ) : (
            <net.Form method="post" action="/api/link-exchange"><input type="hidden" name="intent" value="join" />
              <button type="submit" disabled={net.state !== "idle"} style={{ fontSize: 13.5, fontWeight: 800, color: "#06120c", border: "none", cursor: "pointer", background: `linear-gradient(180deg,${C.brand2},${C.brand})`, padding: "12px 20px", borderRadius: 11 }}>{net.state !== "idle" ? "Joining…" : "Join the Link Network →"}</button>
            </net.Form>
          )}
          {net.data?.error && <div style={{ fontSize: 12, color: C.coral, marginTop: 10 }}>{net.data.error}</div>}
        </div>

        {/* CTA / status */}
        <div style={{ ...card, textAlign: "center", padding: 26, borderColor: `${C.violet}3a` }}>
          {isAuthority ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>✓ Authority is active</div>
              <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
                Your authority manager runs your monthly press distribution. Watch your backlink profile and AI citations compound — new placements go out every cycle.
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Ready to dominate off-page?</div>
              <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, maxWidth: 520, margin: "0 auto 18px" }}>
                Upgrade to <strong style={{ color: C.text }}>Authority — ${price}/mo</strong>. Your authority manager sets up your first press release right after you order.
              </p>
              <Form method="post" action="/app/pricing">
                <input type="hidden" name="tier" value="authority" />
                <button type="submit" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, border: "none", cursor: "pointer", background: `linear-gradient(120deg,${C.violet2},${C.violet},#5b4bd6)`, color: "#fff" }}>
                  Order now — upgrade to Authority →
                </button>
              </Form>
              <p style={{ color: C.faint, fontSize: 11.5, marginTop: 12 }}>Billed securely through Shopify · 3-day trial · cancel anytime.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
