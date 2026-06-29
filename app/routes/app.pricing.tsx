import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useFetcher } from "react-router";
import type { CSSProperties } from "react";
import { authenticate } from "../shopify.server";
import { getActiveTier, createTierSubscription } from "../lib/billing.server";
import { TIERS, TIER_ORDER, type TierName } from "../lib/plans";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const activeTier = await getActiveTier(admin).catch(() => null);
  return { activeTier, shop: session.shop };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const tier = String(form.get("tier") ?? "") as TierName;
  if (!TIER_ORDER.includes(tier)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }
  const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
  const confirmationUrl = await createTierSubscription(admin, tier, returnUrl);
  return redirect(confirmationUrl);
}

export default function Pricing() {
  const { activeTier } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  return (
    <div style={S.page}>
      <h1 style={S.title}>Get your store recommended by AI</h1>
      <p style={S.sub}>Start with your free AI-Readiness Score™ — then pick your power level. 14-day trial · cancel anytime from Shopify.</p>

      <div style={S.grid}>
        {TIER_ORDER.map((name) => {
          const t = TIERS[name];
          const current = activeTier === name;
          const popular = name === "pro";
          const isAuthority = name === "authority";
          return (
            <div key={name} style={{ ...S.card, ...(popular ? S.cardPopular : {}), ...(isAuthority ? S.cardAuthority : {}) }}>
              {popular && <div style={S.ribbon}>MOST POPULAR</div>}
              {isAuthority && <div style={{ ...S.ribbon, background: "#7b6cf6" }}>DOMINATE AI</div>}
              <div style={S.name}>{t.label.replace("ShopHero ", "")}</div>
              <div style={S.price}>
                <span style={{ ...S.amount, ...(isAuthority ? { color: "#7b6cf6" } : {}) }}>${t.amount}</span>
                <span style={S.interval}>/month</span>
              </div>
              <div style={S.tagline}>{t.tagline}</div>
              <ul style={S.features}>
                {t.features.map((f, i) => {
                  const heading = f.endsWith("plus:");
                  return (
                    <li key={i} style={heading ? S.featHeading : S.feat}>
                      {!heading && <span style={{ ...S.check, ...(isAuthority ? { color: "#7b6cf6" } : {}) }}>✓</span>}
                      <span>{f}</span>
                    </li>
                  );
                })}
              </ul>
              <div style={S.usageNote}>
                Includes ${t.includedUsage} of AI usage/month, then automatic ${t.topUp} top-ups up to a ${t.usageCap} cap.
                <strong> The cap is a limit, not a charge.</strong>
              </div>
              {current ? (
                <div style={S.current}>✓ Current plan</div>
              ) : (
                <fetcher.Form method="post">
                  <input type="hidden" name="tier" value={name} />
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ ...S.btn, ...(popular ? S.btnPopular : {}), ...(isAuthority ? S.btnAuthority : {}) }}
                  >
                    {submitting ? "Redirecting…" : `Start ${t.label.replace("ShopHero ", "")} — $${t.amount}/mo`}
                  </button>
                </fetcher.Form>
              )}
            </div>
          );
        })}
      </div>
      <p style={S.fineprint}>
        Billed securely through Shopify. AI usage is metered transparently and shown live in your dashboard.
        Authority press distribution is set up with you by your authority manager after signup.
      </p>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "40px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif" },
  title: { fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8, textAlign: "center" },
  sub: { color: "#6d7175", textAlign: "center", marginBottom: 32, fontSize: 15, maxWidth: 620, marginLeft: "auto", marginRight: "auto", lineHeight: 1.55 },
  grid: { display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", alignItems: "stretch" },
  card: { flex: "1 1 300px", maxWidth: 350, border: "1px solid #e1e3e5", borderRadius: 18, padding: 26, position: "relative", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" },
  cardPopular: { border: "2px solid #16a34a", boxShadow: "0 16px 40px rgba(22,163,74,0.14)" },
  cardAuthority: { border: "2px solid #7b6cf6", boxShadow: "0 16px 40px rgba(123,108,246,0.14)" },
  ribbon: { position: "absolute", top: -11, left: 24, background: "#16a34a", color: "#fff", borderRadius: 999, padding: "4px 12px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em" },
  name: { fontSize: 16, fontWeight: 800, marginBottom: 4 },
  price: { display: "flex", alignItems: "baseline", gap: 4 },
  amount: { fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em", color: "#16a34a" },
  interval: { fontSize: 15, color: "#6d7175" },
  tagline: { color: "#6d7175", fontSize: 13.5, margin: "4px 0 16px" },
  features: { listStyle: "none", padding: 0, margin: "0 0 16px", fontSize: 13.5, display: "flex", flexDirection: "column", gap: 9, lineHeight: 1.45, flex: 1 },
  feat: { display: "flex", gap: 9, alignItems: "flex-start", color: "#2b2f33" },
  featHeading: { fontWeight: 800, color: "#15795e", marginTop: 4 },
  check: { color: "#16a34a", fontWeight: 800, flexShrink: 0 },
  usageNote: { background: "#f6f8f7", border: "1px solid #e7e9ec", borderRadius: 12, padding: "11px 13px", fontSize: 12, color: "#525659", lineHeight: 1.55, marginBottom: 16 },
  btn: { width: "100%", padding: "13px 0", borderRadius: 11, border: "1px solid #d3d6d9", background: "#fff", color: "#1a1a1a", fontWeight: 700, cursor: "pointer", fontSize: 14.5 },
  btnPopular: { background: "linear-gradient(180deg,#22c55e,#16a34a)", color: "#fff", border: "none" },
  btnAuthority: { background: "linear-gradient(120deg,#a78bfa,#7b6cf6,#5b4bd6)", color: "#fff", border: "none" },
  current: { textAlign: "center", color: "#16a34a", fontWeight: 800, padding: "13px 0", fontSize: 14.5 },
  fineprint: { textAlign: "center", color: "#9da2a8", fontSize: 12, marginTop: 22, lineHeight: 1.6, maxWidth: 620, marginLeft: "auto", marginRight: "auto" },
};
