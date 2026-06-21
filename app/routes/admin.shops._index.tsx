import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { isAdmin } from "../lib/admin.server";
import { AdminNav } from "../components/admin-nav";
import db from "../db.server";
import "../styles/shophero.css";

type SortKey = "shop" | "plan" | "turns" | "spend" | "lastActive";

export async function loader({ request }: LoaderFunctionArgs) {
  if (!isAdmin(request)) throw redirect("/admin/login");
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const sort = (url.searchParams.get("sort") || "spend") as SortKey;
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";

  const [sessions, byShop] = await Promise.all([
    db.session.findMany({ select: { shop: true, plan: true, scope: true, anthropicApiKey: true } }),
    db.usageEvent.groupBy({ by: ["shop"], _sum: { costUsd: true, billedUsd: true }, _max: { createdAt: true }, _count: true }),
  ]);

  const agg = new Map(byShop.map((b) => [b.shop, b]));
  const seen = new Set<string>();
  let shops: { shop: string; plan: string | null; byok: boolean; scopes: number; turns: number; spend: number; lastActive: string | null }[] = [];
  const push = (shop: string, plan: string | null, byok: boolean, scopes: number) => {
    if (seen.has(shop)) return;
    seen.add(shop);
    const a = agg.get(shop);
    shops.push({ shop, plan, byok, scopes, turns: a?._count ?? 0, spend: a?._sum.billedUsd ?? 0, lastActive: a?._max.createdAt?.toISOString() ?? null });
  };
  for (const s of sessions) push(s.shop, s.plan ?? null, !!s.anthropicApiKey, s.scope ? s.scope.split(",").length : 0);
  for (const b of byShop) push(b.shop, null, false, 0);

  if (q) shops = shops.filter((s) => s.shop.toLowerCase().includes(q));

  shops.sort((a, b) => {
    let r = 0;
    if (sort === "shop") r = a.shop.localeCompare(b.shop);
    else if (sort === "plan") r = (a.plan ?? "").localeCompare(b.plan ?? "");
    else if (sort === "turns") r = a.turns - b.turns;
    else if (sort === "spend") r = a.spend - b.spend;
    else if (sort === "lastActive") r = (a.lastActive ?? "").localeCompare(b.lastActive ?? "");
    return dir === "asc" ? r : -r;
  });

  return { shops, q, sort, dir, count: seen.size };
}

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export default function AdminShops() {
  const d = useLoaderData<typeof loader>();

  const sortHref = (key: SortKey) => {
    const dir = d.sort === key && d.dir === "desc" ? "asc" : "desc";
    const p = new URLSearchParams();
    if (d.q) p.set("q", d.q);
    p.set("sort", key);
    p.set("dir", dir);
    return `/admin/shops?${p.toString()}`;
  };
  const arrow = (key: SortKey) => (d.sort === key ? (d.dir === "desc" ? " ↓" : " ↑") : "");
  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th><a className="sh-sort" href={sortHref(k)}>{label}{arrow(k)}</a></th>
  );

  return (
    <div className="sh-docbg">
      <div className="sh-doc" style={{ maxWidth: 1100 }}>
        <AdminNav active="shops" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="sh-doc-kicker">Admin console</div>
            <h1>Shops ({d.count})</h1>
          </div>
          <form method="get" style={{ display: "flex", gap: 8 }}>
            <input className="sh-input" name="q" placeholder="Search shops…" defaultValue={d.q} />
            <input type="hidden" name="sort" value={d.sort} />
            <input type="hidden" name="dir" value={d.dir} />
            <button className="sh-btn" style={{ background: "linear-gradient(180deg,#fff,#eef1f5)", color: "var(--sh-ink)" }}>Search</button>
          </form>
        </div>

        <div className="sh-card" style={{ padding: 0, marginTop: 14 }}>
          <table className="sh-table">
            <thead>
              <tr>
                <Th k="shop" label="Shop" />
                <Th k="plan" label="Plan" />
                <th>Key</th>
                <th>Scopes</th>
                <Th k="turns" label="Turns" />
                <Th k="spend" label="Spend" />
                <Th k="lastActive" label="Last active" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {d.shops.length === 0 ? <tr><td colSpan={8} className="sh-empty-cell">{d.q ? "No shops match." : "No installs yet."}</td></tr> :
                d.shops.map((s) => (
                  <tr key={s.shop}>
                    <td className="sh-mono-cell"><a href={`/admin/shops/${s.shop}`} style={{ color: "#0a84ff", textDecoration: "none" }}>{s.shop}</a></td>
                    <td>{s.plan ?? "—"}</td>
                    <td>{s.byok ? "BYOK 🔑" : "—"}</td>
                    <td>{s.scopes || "—"}</td>
                    <td>{s.turns.toLocaleString()}</td>
                    <td>{money(s.spend)}</td>
                    <td className="sh-dim">{when(s.lastActive)}</td>
                    <td><a href={`/admin/shops/${s.shop}`} style={{ color: "#0a84ff", textDecoration: "none", fontWeight: 600 }}>View →</a></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
