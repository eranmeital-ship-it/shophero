import type { LoaderFunctionArgs } from "react-router";
import { redirect, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { getShopProfile, parseRecommendations } from "../lib/onboarding.server";
import { getPlan } from "../lib/content-plan.server";
import { listJobs } from "../lib/jobs.server";
import { projectEta, JOB_TYPES, ACTIVE_STATUSES } from "../lib/jobs-types";
import { getCurrentPlan } from "../lib/plan.server";
import { planTotals } from "../lib/plan-routes";
import db from "../db.server";
import "../styles/shophero.css";

/**
 * Home — the hub. Answers "where was I / what's next" the moment the app opens:
 * unfinished work to resume (plan, draft, jobs), a starter checklist of the
 * biggest opportunities, and recent activity. The Editor is the work surface;
 * this is the map back to it.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Same gating as the editor: must have a plan + completed onboarding.
  const activePlan = await getActivePlan(admin).catch(() => null);
  if (!activePlan) return redirect(`/app/pricing?${url.searchParams.toString()}`);
  const profile = await getShopProfile(session.shop);
  if (!profile) return redirect(`/app/onboarding?${url.searchParams.toString()}`);

  const recs = parseRecommendations(profile).slice(0, 5);

  const [contentPlan, jobs, actionPlan, events] = await Promise.all([
    getPlan(session.shop).catch(() => null),
    listJobs(session.shop).catch(() => []),
    getCurrentPlan(session.shop).catch(() => null),
    db.appEvent.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 6 }).catch(() => []),
  ]);

  const activeJobs = (jobs ?? [])
    .filter((j) => (ACTIVE_STATUSES as readonly string[]).includes(j.status))
    .slice(0, 3)
    .map((j) => {
      const { eta, daysLeft } = projectEta(j.total, j.completed, j.perDay);
      return { id: j.id, title: j.title, completed: j.completed, total: j.total, pct: j.total ? Math.round((j.completed / j.total) * 100) : 0, eta, daysLeft, unit: (JOB_TYPES as Record<string, { unit?: string }>)[j.type]?.unit ?? "items" };
    });

  const plan = actionPlan
    ? { goal: actionPlan.goal, ...planTotals(actionPlan.items) }
    : null;

  return {
    storeName: session.shop.replace(/\.myshopify\.com$/, ""),
    recs,
    draftTitle: contentPlan?.status === "active" ? contentPlan.draftTitle : null,
    activeJobs,
    plan,
    events: (events ?? []).map((e) => ({ id: e.id, level: e.level, message: e.message, at: e.createdAt.toISOString() })),
  };
}

const AREA_EMOJI: Record<string, string> = { CRO: "📈", SEO: "🔍", Speed: "⚡", Content: "📝", Design: "🎨", AOV: "🛒", Trust: "🛡️", AEO: "🤖" };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Home() {
  const { storeName, recs, draftTitle, activeJobs, plan, events } = useLoaderData<typeof loader>();
  const hasResume = !!plan || !!draftTitle || activeJobs.length > 0;

  return (
    <div className="sh-docbg">
      <div className="sh-doc sh-home">
        <div className="sh-doc-kicker">Home</div>
        <h1>Welcome back{storeName ? `, ${storeName}` : ""} 👋</h1>
        <p className="sh-doc-lead">Pick up where you left off, or start something new. The Editor is where the work happens.</p>

        <div className="sh-home-cta">
          <Link to="/app/editor" className="sh-btn sh-btn-primary">Open the Editor →</Link>
          <Link to="/app/editor?task=store-manager" className="sh-btn sh-btn-ghost">✨ Improve my store</Link>
          <Link to="/app/editor?task=structured-data" className="sh-btn sh-btn-ghost">🧠 AEO Brain</Link>
        </div>

        {hasResume && (
          <section className="sh-home-sec">
            <h2 className="sh-home-h">Pick up where you left off</h2>
            <div className="sh-home-cards">
              {plan && plan.done < plan.total && (
                <Link to="/app/editor?task=store-manager" className="sh-home-card">
                  <div className="sh-home-card-top"><span className="sh-home-card-emoji">🗺️</span><span className="sh-home-card-title">{plan.goal}</span></div>
                  <div className="sh-home-bar"><span style={{ width: `${Math.round((plan.done / Math.max(1, plan.total)) * 100)}%` }} /></div>
                  <div className="sh-home-card-sub">{plan.done}/{plan.total} steps done · continue →</div>
                </Link>
              )}
              {draftTitle && (
                <Link to="/app/editor" className="sh-home-card">
                  <div className="sh-home-card-top"><span className="sh-home-card-emoji">📅</span><span className="sh-home-card-title">Today&apos;s article is ready</span></div>
                  <div className="sh-home-card-sub">{draftTitle} · review &amp; publish →</div>
                </Link>
              )}
              {activeJobs.map((j) => (
                <Link key={j.id} to="/app/activity" className="sh-home-card">
                  <div className="sh-home-card-top"><span className="sh-home-card-emoji">♻️</span><span className="sh-home-card-title">{j.title}</span></div>
                  <div className="sh-home-bar"><span style={{ width: `${j.pct}%` }} /></div>
                  <div className="sh-home-card-sub">{j.completed}/{j.total} {j.unit} · ~{j.daysLeft}d left (by {j.eta}) →</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="sh-home-sec">
          <h2 className="sh-home-h">Recommended next steps</h2>
          {recs.length > 0 ? (
            <div className="sh-home-checklist">
              {recs.map((r, i) => (
                <Link key={i} to="/app/editor?task=store-manager" className="sh-home-check">
                  <span className="sh-home-check-emoji">{AREA_EMOJI[r.area] ?? "•"}</span>
                  <span className="sh-home-check-main">
                    <span className="sh-home-check-title">{r.title}</span>
                    <span className="sh-home-check-desc">{r.desc}</span>
                  </span>
                  <span className="sh-home-check-go">Start →</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="sh-hint">No analysis yet — open the Editor and run “Improve my store” to generate your plan.</p>
          )}
        </section>

        <section className="sh-home-sec">
          <div className="sh-home-h-row">
            <h2 className="sh-home-h">Recent activity</h2>
            <Link to="/app/activity" className="sh-link">See all →</Link>
          </div>
          {events.length > 0 ? (
            <div className="sh-home-events">
              {events.map((e) => (
                <div key={e.id} className={`sh-home-event lvl-${e.level}`}>
                  <span className="sh-home-event-dot" />
                  <span className="sh-home-event-msg">{e.message}</span>
                  <span className="sh-home-event-at">{timeAgo(e.at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="sh-hint">Nothing yet — your changes and AI tasks will show up here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
