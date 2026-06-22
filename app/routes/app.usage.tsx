import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan, getCycleUsage, type CycleUsage } from "../lib/billing.server";
import { PLANS } from "../lib/plans";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const activePlan = await getActivePlan(admin);
  const cycle = activePlan === "managed" ? await getCycleUsage(admin, session.shop).catch(() => null) : null;
  return { activePlan, cycle };
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

/** The per-cycle bar ledger: $15 included, then $50 top-up blocks (billed / upcoming). */
function CycleBars({ cycle }: { cycle: CycleUsage }) {
  const { included, topUp, maxBlocks, consumed, blocksBilled } = cycle;
  const includedUsed = Math.min(consumed, included);

  const rows = [
    <div key="inc" className="sh-bill-row">
      <div className="sh-bill-head">
        <span className="sh-bill-label">Included usage</span>
        <span className="sh-bill-amt">{fmt(includedUsed)} / {fmt(included)}</span>
      </div>
      <div className="sh-bill-track">
        <div className="sh-bill-fill" style={{ width: `${(includedUsed / included) * 100}%` }} />
      </div>
      <div className="sh-bill-note sh-bill-note-inc">Built into your ${PLANS.managed.amount}/month</div>
    </div>,
  ];

  for (let i = 1; i <= maxBlocks; i++) {
    const start = included + (i - 1) * topUp;
    const usedInBlock = Math.max(0, Math.min(consumed - start, topUp));
    const billed = i <= blocksBilled;
    const isNext = i === blocksBilled + 1;
    const cls = billed ? "is-billed" : isNext ? "is-next" : "is-future";
    rows.push(
      <div key={i} className={`sh-bill-row ${cls}`}>
        <div className="sh-bill-head">
          <span className="sh-bill-label">
            Top-up {fmt(topUp)}
            {billed ? <span className="sh-bill-badge">✓ Billed</span> : <span className="sh-bill-badge sh-bill-badge-pending">Not billed yet</span>}
          </span>
          <span className="sh-bill-amt">{billed ? `${fmt(usedInBlock)} used` : isNext ? "Next billing" : "Upcoming"}</span>
        </div>
        <div className="sh-bill-track">
          <div className="sh-bill-fill" style={{ width: `${billed ? (usedInBlock / topUp) * 100 : 0}%` }} />
        </div>
      </div>,
    );
  }
  return <div className="sh-bill">{rows}</div>;
}

export default function Usage() {
  const { activePlan, cycle } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const plan = activePlan ? PLANS[activePlan] : null;

  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <div className="sh-doc-kicker">Billing</div>
        <h1>Usage &amp; Billing</h1>
        <p className="sh-doc-lead">
          What you&apos;re on, how AI usage is priced, and where to see it. Per-request
          cost is shown live in the editor under each reply, and summed in the “Usage” pill.
        </p>

        <div className="sh-card" style={{ borderColor: "rgba(245,166,35,0.35)", background: "rgba(245,166,35,0.06)" }}>
          <h3><span className="sh-card-emoji">💡</span> How AI usage is counted</h3>
          <p style={{ margin: 0 }}>
            AI tasks use third-party model compute as they run, so you&apos;re charged for what a
            task actually uses — <strong>including tasks you stop, that time out, or that don&apos;t
            finish or fully apply</strong>. Deterministic actions (schema, sections, PDP layouts)
            and the version/restore tools are free. To keep usage low on a large store, run small,
            focused operations and let catalog-wide work go through the one-click bulk tools and
            scheduled jobs — they process your whole store cheaply in the background. Per-shop
            daily &amp; monthly caps protect you from runaway cost.
          </p>
        </div>

        <div className="sh-card">
          <h3><span className="sh-card-emoji">💳</span> Current plan</h3>
          {plan ? (
            <p>
              <span className="sh-tag">{plan.label}</span>{" "}
              — ${plan.amount}/month{plan.trialDays ? ` · ${plan.trialDays}-day trial` : ""}. {plan.description}
            </p>
          ) : (
            <p>No active plan. <a className="sh-link" href="/app/pricing">Choose a plan →</a></p>
          )}
          <div style={{ marginTop: 14 }}>
            <button
              className="sh-btn sh-btn-primary"
              style={{ display: "inline-block" }}
              onClick={() => navigate("/app/pricing")}
            >
              {plan ? "Change plan" : "Choose a plan"}
            </button>
          </div>
        </div>

        {cycle && (
          <div className="sh-card">
            <h3><span className="sh-card-emoji">📈</span> This billing cycle</h3>
            <p style={{ marginTop: -2, marginBottom: 14 }}>
              You&apos;ve used <strong>{fmt(cycle.consumed)}</strong> this cycle. Your ${PLANS.managed.amount}/month
              covers the first {fmt(cycle.included)}; after that we bill {fmt(cycle.topUp)} at a time, only as you use it —
              up to a {fmt(cycle.cap)} limit.
            </p>
            <CycleBars cycle={cycle} />
            {!cycle.live && <p className="sh-bill-dev">Preview — live amounts appear once you&apos;re on a paid subscription.</p>}
          </div>
        )}

        <div className="sh-card">
          <h3><span className="sh-card-emoji">🧮</span> How AI usage is priced</h3>
          <p>
            <strong>${PLANS.managed.amount}/month</strong> includes <strong>${PLANS.managed.includedUsage} of AI usage</strong>.
            Beyond that, usage tops up automatically in <strong>${PLANS.managed.topUp} increments</strong> so you're never interrupted.
            <br /><br />
            There's a <strong>${PLANS.managed.usageCap}/month limit</strong> for safety —{" "}
            <strong>it's a cap, not a charge.</strong> You're only ever billed for what you actually use, and per-request
            cost is shown live in the editor. Reach the limit and we'll ask you to approve a higher one — nothing is charged silently.
          </p>
        </div>

        <div className="sh-card">
          <h3><span className="sh-card-emoji">📊</span> Where to see your usage</h3>
          <p>
            Every reply in the editor shows its model and price (e.g. <code>haiku-4-5 · $0.0123</code>),
            and the header “Usage” pill totals the current session. Account-level usage history and credit
            top-ups are on the roadmap with metered billing.
          </p>
        </div>
      </div>
    </div>
  );
}
