import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan, createSubscription } from "../lib/billing.server";
import { PLANS } from "../lib/plans";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const activePlan = await getActivePlan(admin);
  return { activePlan, shop: session.shop };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const plan = (form.get("plan") as "managed" | "byok") || "managed";

  if (!["managed", "byok"].includes(plan)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  // After Shopify billing approval, merchant lands back on /app (the main page).
  const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;

  const confirmationUrl = await createSubscription(admin, plan, returnUrl);
  return redirect(confirmationUrl);
}

export default function Pricing() {
  const { activePlan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const m = PLANS.managed;

  return (
    <div style={S.page}>
      <h1 style={S.title}>Start with ShopHero</h1>
      <p style={S.sub}>One plan. Everything included. Cancel anytime.</p>

      <div style={S.card}>
        <div style={S.badge}>Managed AI</div>
        <div style={S.price}>
          <span style={S.amount}>${m.amount}</span>
          <span style={S.interval}>/month</span>
        </div>
        <p style={S.desc}>Claude AI fully included — no API key, no setup. Just ask, approve, ship.</p>

        <ul style={S.features}>
          <li>✓ Full ShopHero editor, CRO brain &amp; one-click fixes</li>
          <li>✓ No Anthropic API key needed</li>
          <li>✓ <strong>${m.includedUsage} of AI usage included</strong> every month</li>
          <li>✓ After that, usage auto-tops-up in ${m.topUp} increments</li>
          <li>✓ Priority support</li>
        </ul>

        {/* The part merchants worry about — stated plainly. */}
        <div style={S.usageBox}>
          <div style={S.usageTitle}>How usage works</div>
          <p style={S.usageText}>
            Your ${m.amount}/month includes <strong>${m.includedUsage} of AI usage</strong>. Beyond that,
            ShopHero automatically tops up in <strong>${m.topUp}</strong> increments so you never get
            interrupted. There's a <strong>${m.usageCap}/month limit</strong> for peace of mind —{" "}
            <strong>that's a cap, not a charge: you're only ever billed for what you actually use.</strong>{" "}
            Reach the limit and we'll ask before going higher.
          </p>
        </div>

        {activePlan === "managed" ? (
          <div style={S.current}>✓ Current plan</div>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="plan" value="managed" />
            <button style={S.btn} type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? "Redirecting…" : `Subscribe — $${m.amount}/mo`}
            </button>
          </fetcher.Form>
        )}
        <p style={S.fineprint}>Billed through Shopify. Usage is metered transparently and shown live in the editor.</p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 540, margin: "0 auto", padding: "48px 24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif" },
  title: { fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8, textAlign: "center" },
  sub: { color: "#6d7175", textAlign: "center", marginBottom: 32, fontSize: 15 },
  card: { border: "2px solid #1a1a1a", borderRadius: 20, padding: 32, position: "relative", boxShadow: "0 18px 50px rgba(0,0,0,0.10)", background: "linear-gradient(180deg,#fff,#f7f8fb)" },
  badge: { display: "inline-block", background: "#1a1a1a", color: "#fff", borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 700, marginBottom: 16 },
  price: { display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 },
  amount: { fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em" },
  interval: { fontSize: 17, color: "#6d7175" },
  desc: { color: "#6d7175", fontSize: 15, marginBottom: 20, lineHeight: 1.5 },
  features: { listStyle: "none", padding: 0, margin: "0 0 20px", fontSize: 14.5, display: "flex", flexDirection: "column", gap: 10, lineHeight: 1.4 },
  usageBox: { background: "#f1f5fb", border: "1px solid #e1e6ee", borderRadius: 14, padding: 16, marginBottom: 22 },
  usageTitle: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6d7175", marginBottom: 8 },
  usageText: { fontSize: 13.5, color: "#3a3a3c", lineHeight: 1.6, margin: 0 },
  btn: { width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#1a1a1a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15.5 },
  current: { textAlign: "center", color: "#008060", fontWeight: 700, padding: "14px 0", fontSize: 15 },
  fineprint: { textAlign: "center", color: "#9da2a8", fontSize: 12, marginTop: 14, marginBottom: 0 },
};
