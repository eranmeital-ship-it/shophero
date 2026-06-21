import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { isAdmin, adminClearCookie } from "../lib/admin.server";
import { keyHealth } from "../lib/key-pool.server";
import { AdminNav } from "../components/admin-nav";
import db from "../db.server";
import "../styles/shophero.css";

export async function action({ request }: ActionFunctionArgs) {
  await request.formData().catch(() => {});
  return redirect("/admin/login", { headers: { "Set-Cookie": adminClearCookie() } });
}

const DAY = 86400000;
const midnight = (d: Date | string) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (!isAdmin(request)) throw redirect("/admin/login");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDay = midnight(now);
  startDay.setDate(startDay.getDate() - 29);
  const weekStart = midnight(now);
  weekStart.setDate(weekStart.getDate() - 7 * 8 + 1);

  const [sessions, total, month, byPlan, byModel, byShop, recent, errors, errorCount, ev30, profiles] = await Promise.all([
    db.session.findMany({ select: { shop: true, plan: true, scope: true, anthropicApiKey: true } }),
    db.usageEvent.aggregate({ _sum: { costUsd: true, billedUsd: true }, _count: true }),
    db.usageEvent.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { billedUsd: true }, _count: true }),
    db.usageEvent.groupBy({ by: ["plan"], _sum: { billedUsd: true }, _count: true }),
    db.usageEvent.groupBy({ by: ["model"], _sum: { costUsd: true, billedUsd: true }, _count: true }),
    db.usageEvent.groupBy({ by: ["shop"], _sum: { costUsd: true, billedUsd: true }, _max: { createdAt: true }, _count: true }),
    db.usageEvent.findMany({ orderBy: { createdAt: "desc" }, take: 18 }),
    db.appEvent.findMany({ where: { level: "error" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.appEvent.count({ where: { level: "error" } }),
    db.usageEvent.findMany({ where: { createdAt: { gte: startDay } }, select: { createdAt: true, billedUsd: true, costUsd: true } }),
    db.shopProfile.findMany({ select: { createdAt: true } }),
  ]);

  const shopAgg = new Map(byShop.map((b) => [b.shop, b]));
  const seen = new Set<string>();
  const shops: { shop: string; plan: string | null; turns: number; spend: number; lastActive: string | null }[] = [];
  const pushShop = (shop: string, plan: string | null) => {
    if (seen.has(shop)) return;
    seen.add(shop);
    const a = shopAgg.get(shop);
    shops.push({ shop, plan, turns: a?._count ?? 0, spend: a?._sum.billedUsd ?? 0, lastActive: a?._max.createdAt?.toISOString() ?? null });
  };
  for (const s of sessions) pushShop(s.shop, s.plan ?? null);
  for (const b of byShop) pushShop(b.shop, null);
  shops.sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));

  // ---- growth series ----
  const rev = Array(30).fill(0);
  const cost = Array(30).fill(0);
  const turns = Array(30).fill(0);
  for (const e of ev30) {
    const i = Math.round((midnight(e.createdAt).getTime() - startDay.getTime()) / DAY);
    if (i >= 0 && i < 30) {
      rev[i] += e.billedUsd ?? 0;
      cost[i] += e.costUsd ?? 0;
      turns[i] += 1;
    }
  }

  // ---- daily revenue snapshot: subscription (est. MRR) + AI usage − API cost ----
  const paidSet = new Set<string>();
  for (const s of sessions) if (s.plan) paidSet.add(s.shop);
  const paidShops = paidSet.size;
  const SUB_PRICE = 49;
  const subPerDay = (paidShops * SUB_PRICE) / 30;
  const snapshot: { label: string; gross: number; net: number }[] = [];
  for (let i = 14; i < 30; i++) {
    const dt = new Date(startDay.getTime() + i * DAY);
    const gross = subPerDay + rev[i];
    snapshot.push({
      label: dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      gross,
      net: gross - cost[i],
    });
  }
  snapshot.reverse(); // most recent first
  let run = 0;
  const cum = rev.map((v) => (run += v));
  const dayLabels = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(startDay.getTime() + i * DAY);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const newShops = Array(8).fill(0);
  for (const p of profiles) {
    const i = Math.floor((midnight(p.createdAt).getTime() - weekStart.getTime()) / (7 * DAY));
    if (i >= 0 && i < 8) newShops[i] += 1;
  }
  const weekLabels = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(weekStart.getTime() + i * 7 * DAY);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  return {
    totals: { shops: seen.size, activeShops: byShop.length, turns: total._count, rawCost: total._sum.costUsd ?? 0, revenue: total._sum.billedUsd ?? 0, errors: errorCount },
    month: { turns: month._count, revenue: month._sum.billedUsd ?? 0 },
    plans: byPlan.map((p) => ({ plan: p.plan ?? "—", turns: p._count, revenue: p._sum.billedUsd ?? 0 })),
    models: byModel.map((m) => ({ model: m.model ?? "—", turns: m._count, cost: m._sum.costUsd ?? 0, revenue: m._sum.billedUsd ?? 0 })).sort((a, b) => b.turns - a.turns),
    topShops: shops.slice(0, 8),
    recent: recent.map((r) => ({ shop: r.shop, model: r.model, billedUsd: r.billedUsd ?? 0, createdAt: r.createdAt.toISOString() })),
    errors: errors.map((e) => ({ shop: e.shop, message: e.message, createdAt: e.createdAt.toISOString() })),
    keys: keyHealth(),
    snapshot,
    estMrr: paidShops * 49,
    charts: {
      revenue: { values: rev, labels: dayLabels, total: rev.reduce((a, b) => a + b, 0) },
      turns: { values: turns, labels: dayLabels, total: turns.reduce((a, b) => a + b, 0) },
      cum: { values: cum, labels: dayLabels, total: cum[cum.length - 1] ?? 0 },
      newShops: { values: newShops, labels: weekLabels, total: newShops.reduce((a, b) => a + b, 0) },
    },
  };
}

const money = (n: number, dp = 2) => `$${(n ?? 0).toFixed(dp)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function BarChart({ values, color = "#6ec531" }: { values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  const n = values.length || 1;
  const W = 320, H = 120, gap = 2;
  const bw = (W - gap * (n - 1)) / n;
  return (
    <svg className="sh-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(1.5, (v / max) * (H - 6)) : 0;
        return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1.5} fill={color} />;
      })}
    </svg>
  );
}

function AreaChart({ values, color = "#6ec531" }: { values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const W = 320, H = 120;
  const pts = values.map((v, i) => `${n <= 1 ? 0 : (i / (n - 1)) * W},${H - (v / max) * (H - 8) - 2}`).join(" ");
  return (
    <svg className="sh-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="rgba(110,197,49,0.16)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ChartCard({ title, big, children, first, last }: { title: string; big: string; children: React.ReactNode; first: string; last: string }) {
  return (
    <div className="sh-chart-card">
      <div className="sh-chart-head">
        <span className="sh-chart-title">{title}</span>
        <span className="sh-chart-big">{big}</span>
      </div>
      {children}
      <div className="sh-chart-axis"><span>{first}</span><span>{last}</span></div>
    </div>
  );
}

export default function AdminDashboard() {
  const d = useLoaderData<typeof loader>();
  const c = d.charts;

  const avgCostPerRequest = d.totals.turns ? d.totals.rawCost / d.totals.turns : 0;
  const costPerActiveShop = d.totals.activeShops ? d.totals.rawCost / d.totals.activeShops : 0;

  const STATS = [
    { label: "Shops", value: String(d.totals.shops) },
    { label: "Active shops", value: String(d.totals.activeShops) },
    { label: "Turns", value: d.totals.turns.toLocaleString() },
    { label: "Revenue (billed)", value: money(d.totals.revenue) },
    { label: "API cost (ours)", value: money(d.totals.rawCost) },
    { label: "Margin", value: money(d.totals.revenue - d.totals.rawCost) },
    { label: "Avg cost / request", value: money(avgCostPerRequest, 4) },
    { label: "Cost / active shop", value: money(costPerActiveShop) },
    { label: "Errors", value: String(d.totals.errors) },
  ];

  return (
    <div className="sh-docbg">
      <div className="sh-doc" style={{ maxWidth: 1100 }}>
        <AdminNav active="dashboard" />
        <div className="sh-doc-kicker">Admin console</div>
        <h1>ShopHero Operations</h1>
        <p className="sh-doc-lead">Growth, revenue, usage and health across every shop.</p>

        <div className="sh-admin-stats">
          {STATS.map((s) => (
            <div key={s.label} className="sh-stat-card">
              <div className="sh-stat-num">{s.value}</div>
              <div className="sh-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="sh-hint" style={{ marginTop: 8 }}>
          This month: {d.month.turns.toLocaleString()} turns · {money(d.month.revenue)} billed.
        </p>

        {/* Growth charts */}
        <h3 className="sh-admin-h">Growth</h3>
        <div className="sh-charts">
          <ChartCard title="Revenue / day · 30d" big={money(c.revenue.total)} first={c.revenue.labels[0]} last={c.revenue.labels[29]}>
            <BarChart values={c.revenue.values} color="#6ec531" />
          </ChartCard>
          <ChartCard title="Cumulative revenue · 30d" big={money(c.cum.total)} first={c.cum.labels[0]} last={c.cum.labels[29]}>
            <AreaChart values={c.cum.values} color="#34c759" />
          </ChartCard>
          <ChartCard title="Turns / day · 30d" big={c.turns.total.toLocaleString()} first={c.turns.labels[0]} last={c.turns.labels[29]}>
            <BarChart values={c.turns.values} color="#0a84ff" />
          </ChartCard>
          <ChartCard title="New shops / week · 8w" big={String(c.newShops.total)} first={c.newShops.labels[0]} last={c.newShops.labels[7]}>
            <BarChart values={c.newShops.values} color="#b06dfc" />
          </ChartCard>
        </div>

        {/* Daily revenue snapshot */}
        <h3 className="sh-admin-h">Daily revenue snapshot</h3>
        <p className="sh-hint" style={{ marginTop: -4 }}>
          Net = subscription (est. MRR {money(d.estMrr)}) + AI usage billed − our API cost, per day.
        </p>
        <div className="sh-card" style={{ padding: 0 }}>
          <table className="sh-table sh-snap">
            <thead><tr><th>Date</th><th>Gross</th><th>Net</th><th style={{ width: "45%" }}>Trend</th></tr></thead>
            <tbody>
              {(() => {
                const maxNet = Math.max(0.01, ...d.snapshot.map((r) => r.net));
                return d.snapshot.map((r, i) => {
                  const w = Math.max(0, (r.net / maxNet) * 100);
                  const top = r.net >= maxNet * 0.999;
                  return (
                    <tr key={i}>
                      <td className="sh-dim">{r.label}</td>
                      <td>{money(r.gross)}</td>
                      <td style={{ fontWeight: top ? 800 : 600 }}>{money(r.net)}</td>
                      <td>
                        <span
                          className="sh-snap-bar"
                          style={{ width: `${w}%`, background: r.net < 0 ? "#d9534f" : top ? "#8fbf1f" : "#b9a888" }}
                        />
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* Top shops preview */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22 }}>
          <h3 className="sh-admin-h" style={{ margin: 0 }}>Top shops</h3>
          <a href="/admin/shops" style={{ color: "#0a84ff", textDecoration: "none", fontWeight: 600 }}>View all shops →</a>
        </div>
        <div className="sh-card" style={{ padding: 0, marginTop: 10 }}>
          <table className="sh-table">
            <thead><tr><th>Shop</th><th>Plan</th><th>Turns</th><th>Spend</th><th>Last active</th><th></th></tr></thead>
            <tbody>
              {d.topShops.length === 0 ? <tr><td colSpan={6} className="sh-empty-cell">No installs yet.</td></tr> :
                d.topShops.map((s) => (
                  <tr key={s.shop}>
                    <td className="sh-mono-cell"><a href={`/admin/shops/${s.shop}`} style={{ color: "#0a84ff", textDecoration: "none" }}>{s.shop}</a></td>
                    <td>{s.plan ?? "—"}</td>
                    <td>{s.turns.toLocaleString()}</td>
                    <td>{money(s.spend)}</td>
                    <td className="sh-dim">{when(s.lastActive)}</td>
                    <td><a href={`/admin/shops/${s.shop}`} style={{ color: "#0a84ff", textDecoration: "none", fontWeight: 600 }}>View →</a></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Subscriptions + models */}
        <div className="sh-grid2" style={{ marginTop: 16 }}>
          <div>
            <h3 className="sh-admin-h">Plans</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>Plan</th><th>Turns</th><th>Revenue</th></tr></thead>
                <tbody>
                  {d.plans.length === 0 ? <tr><td colSpan={3} className="sh-empty-cell">No usage yet.</td></tr> :
                    d.plans.map((p) => <tr key={p.plan}><td><span className="sh-tag">{p.plan}</span></td><td>{p.turns.toLocaleString()}</td><td>{money(p.revenue)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="sh-admin-h">Usage by model</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>Model</th><th>Turns</th><th>Cost</th><th>Billed</th></tr></thead>
                <tbody>
                  {d.models.length === 0 ? <tr><td colSpan={4} className="sh-empty-cell">No usage yet.</td></tr> :
                    d.models.map((m) => <tr key={m.model}><td className="sh-mono-cell">{m.model.replace("claude-", "")}</td><td>{m.turns.toLocaleString()}</td><td>{money(m.cost, 4)}</td><td>{money(m.revenue, 4)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent + errors */}
        <div className="sh-grid2" style={{ marginTop: 16 }}>
          <div>
            <h3 className="sh-admin-h">Recent turns</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>When</th><th>Shop</th><th>Model</th><th>Billed</th></tr></thead>
                <tbody>
                  {d.recent.length === 0 ? <tr><td colSpan={4} className="sh-empty-cell">Nothing yet.</td></tr> :
                    d.recent.map((r, i) => <tr key={i}><td className="sh-dim">{when(r.createdAt)}</td><td className="sh-mono-cell">{r.shop.replace(".myshopify.com", "")}</td><td>{(r.model ?? "—").replace("claude-", "")}</td><td>{money(r.billedUsd, 4)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="sh-admin-h">Recent errors</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>When</th><th>Shop</th><th>Message</th></tr></thead>
                <tbody>
                  {d.errors.length === 0 ? <tr><td colSpan={3} className="sh-empty-cell">No errors 🎉</td></tr> :
                    d.errors.map((e, i) => <tr key={i}><td className="sh-dim">{when(e.createdAt)}</td><td className="sh-mono-cell">{(e.shop ?? "—").replace(".myshopify.com", "")}</td><td className="sh-err-cell">{e.message}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Key pool */}
        <h3 className="sh-admin-h">Anthropic key pool</h3>
        <div className="sh-card">
          {d.keys.length === 0 ? (
            <p className="sh-hint">No keys configured. Set <code>ANTHROPIC_API_KEY</code> (+ <code>ANTHROPIC_API_KEYS</code> for backups).</p>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {d.keys.map((k) => (
                <span key={k.id} className="sh-tag" style={{ background: k.status === "ok" ? "rgba(52,199,89,0.14)" : "rgba(255,149,0,0.16)", color: k.status === "ok" ? "#1c7c3a" : "#9a6200" }}>
                  {k.id} · {k.status === "ok" ? "healthy" : `cooldown → ${when(k.until)}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
