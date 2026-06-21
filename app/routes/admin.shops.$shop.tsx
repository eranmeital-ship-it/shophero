import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, Form, Link } from "react-router";

import { isAdmin } from "../lib/admin.server";
import { AdminNav } from "../components/admin-nav";
import db from "../db.server";
import { getBrandKit, getMemory, clearAgentSession } from "../lib/brand.server";
import { setStatus } from "../lib/content-plan.server";
import "../styles/shophero.css";

function jparse<T>(s: string | null | undefined, fb: T): T {
  if (!s) return fb;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fb;
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!isAdmin(request)) throw redirect("/admin/login");
  const shop = params.shop!;
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");

  try {
    switch (intent) {
      case "clear-agent":
        await clearAgentSession(shop);
        break;
      case "refresh-report":
        await db.storeReport.deleteMany({ where: { shop } });
        break;
      case "clear-onboarding":
        await db.shopProfile.updateMany({ where: { shop }, data: { onboardedAt: null } });
        break;
      case "content-pause":
        await setStatus(shop, "paused");
        break;
      case "content-resume":
        await setStatus(shop, "active");
        break;
      case "set-plan": {
        const plan = String(fd.get("plan") || "").trim() || null;
        await db.session.updateMany({ where: { shop }, data: { plan } });
        break;
      }
      case "add-note": {
        const msg = String(fd.get("note") || "").trim();
        if (msg) await db.appEvent.create({ data: { shop, level: "info", type: "admin_note", message: msg } });
        break;
      }
      case "purge": {
        if (String(fd.get("confirm") || "") === "DELETE") {
          await db.$transaction([
            db.usageEvent.deleteMany({ where: { shop } }),
            db.shopProfile.deleteMany({ where: { shop } }),
            db.storeReport.deleteMany({ where: { shop } }),
            db.contentPlan.deleteMany({ where: { shop } }),
            db.brainDoc.deleteMany({ where: { shop } }),
            db.appEvent.deleteMany({ where: { shop } }),
          ]);
        }
        break;
      }
    }
  } catch (err) {
    console.error("[admin shop action]", intent, err);
    return redirect(`/admin/shops/${shop}?err=${intent}`);
  }
  return redirect(`/admin/shops/${shop}?ok=${intent}`);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (!isAdmin(request)) throw redirect("/admin/login");
  const shop = params.shop!;
  const url = new URL(request.url);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sessions, profileRow, reportRow, planRow, brainDocs, total, month, byModel, byKind, recent, events, errorCount, brandKit, memory] =
    await Promise.all([
      db.session.findMany({ where: { shop } }),
      db.shopProfile.findUnique({ where: { shop } }),
      db.storeReport.findUnique({ where: { shop } }),
      db.contentPlan.findUnique({ where: { shop } }),
      db.brainDoc.findMany({ where: { shop }, orderBy: { updatedAt: "desc" } }),
      db.usageEvent.aggregate({ where: { shop }, _sum: { costUsd: true, billedUsd: true }, _count: true }),
      db.usageEvent.aggregate({ where: { shop, createdAt: { gte: monthStart } }, _sum: { costUsd: true, billedUsd: true }, _count: true }),
      db.usageEvent.groupBy({ by: ["model"], where: { shop }, _sum: { costUsd: true, billedUsd: true }, _count: true }),
      db.usageEvent.groupBy({ by: ["kind"], where: { shop }, _count: true }),
      db.usageEvent.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 25 }),
      db.appEvent.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 30 }),
      db.appEvent.count({ where: { shop, level: "error" } }),
      getBrandKit(shop),
      getMemory(shop),
    ]);

  const goals = jparse<string[]>(profileRow?.goals, []);
  const recs = jparse<{ title?: string }[]>(profileRow?.recommendations, []);
  const scores = jparse<{ label: string; score: number }[]>(reportRow?.scores, []);
  const findings = jparse<string[]>(reportRow?.findings, []);

  const owner = sessions.find((s) => s.accountOwner) ?? sessions[0];

  return {
    shop,
    flash: { ok: url.searchParams.get("ok"), err: url.searchParams.get("err") },
    totals: {
      turns: total._count,
      billed: total._sum.billedUsd ?? 0,
      cost: total._sum.costUsd ?? 0,
      errors: errorCount,
    },
    month: { turns: month._count, billed: month._sum.billedUsd ?? 0, cost: month._sum.costUsd ?? 0 },
    plan: owner?.plan ?? null,
    byok: sessions.some((s) => s.anthropicApiKey),
    owner: owner ? { email: owner.email, name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null, accountOwner: owner.accountOwner, locale: owner.locale } : null,
    sessions: sessions.map((s) => ({
      id: s.id,
      online: s.isOnline,
      email: s.email,
      accountOwner: s.accountOwner,
      scopes: s.scope ? s.scope.split(",").length : 0,
      expires: s.expires?.toISOString() ?? null,
      plan: s.plan,
    })),
    profile: profileRow
      ? {
          onboardedAt: profileRow.onboardedAt?.toISOString() ?? null,
          consentAt: profileRow.dataConsentAt?.toISOString() ?? null,
          agentSessionId: profileRow.agentSessionId ?? null,
          createdAt: profileRow.createdAt.toISOString(),
          updatedAt: profileRow.updatedAt.toISOString(),
        }
      : null,
    goals,
    recsCount: recs.length,
    brandKit,
    memory,
    report: reportRow
      ? { scores, findings, summary: reportRow.summary, model: reportRow.model, generatedAt: reportRow.generatedAt.toISOString() }
      : null,
    contentPlan: planRow
      ? {
          status: planRow.status,
          perDay: planRow.perDay,
          days: planRow.days,
          publishedCount: planRow.publishedCount,
          draftTitle: planRow.draftTitle,
          draftTopic: planRow.draftTopic,
          draftDate: planRow.draftDate?.toISOString() ?? null,
        }
      : null,
    brains: brainDocs.map((b) => ({ brain: b.brain, len: b.content.length, updatedAt: b.updatedAt.toISOString() })),
    byModel: byModel.map((m) => ({ model: m.model ?? "—", turns: m._count, cost: m._sum.costUsd ?? 0, billed: m._sum.billedUsd ?? 0 })).sort((a, b) => b.turns - a.turns),
    byKind: byKind.map((k) => ({ kind: k.kind ?? "—", turns: k._count })).sort((a, b) => b.turns - a.turns),
    recent: recent.map((r) => ({ model: r.model, kind: r.kind, billed: r.billedUsd ?? 0, cost: r.costUsd ?? 0, createdAt: r.createdAt.toISOString() })),
    events: events.map((e) => ({ level: e.level, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })),
  };
}

const money = (n: number, dp = 2) => `$${(n ?? 0).toFixed(dp)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export default function AdminShopDetail() {
  const d = useLoaderData<typeof loader>();
  const short = d.shop.replace(".myshopify.com", "");

  const STATS = [
    { label: "Turns", value: d.totals.turns.toLocaleString() },
    { label: "Billed", value: money(d.totals.billed) },
    { label: "API cost", value: money(d.totals.cost) },
    { label: "Margin", value: money(d.totals.billed - d.totals.cost) },
    { label: "This month", value: money(d.month.billed) },
    { label: "Errors", value: String(d.totals.errors) },
  ];

  return (
    <div className="sh-docbg">
      <div className="sh-doc" style={{ maxWidth: 1100 }}>
        <AdminNav active="shops" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="sh-doc-kicker">
              <Link to="/admin" style={{ color: "inherit" }}>← Admin</Link> · Shop
            </div>
            <h1 style={{ wordBreak: "break-all" }}>{short}</h1>
            <p className="sh-doc-lead">{d.shop}</p>
          </div>
          <a className="sh-btn" href={`https://${d.shop}/admin`} target="_blank" rel="noreferrer">Open in Shopify ↗</a>
        </div>

        {d.flash.ok && <div className="sh-card" style={{ background: "rgba(52,199,89,0.12)", borderColor: "rgba(52,199,89,0.4)", marginTop: 12 }}>✓ Done: <strong>{d.flash.ok}</strong></div>}
        {d.flash.err && <div className="sh-card" style={{ background: "rgba(255,80,80,0.1)", borderColor: "rgba(255,80,80,0.4)", marginTop: 12 }}>✕ Action failed: <strong>{d.flash.err}</strong> (check server logs)</div>}

        <div className="sh-admin-stats" style={{ marginTop: 14 }}>
          {STATS.map((s) => (
            <div key={s.label} className="sh-stat-card">
              <div className="sh-stat-num">{s.value}</div>
              <div className="sh-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Status */}
        <h3 className="sh-admin-h">Account</h3>
        <div className="sh-card">
          <div className="sh-grid2">
            <div>
              <p><strong>Plan:</strong> {d.plan ?? "—"} {d.byok ? "· BYOK 🔑" : ""}</p>
              <p><strong>Owner:</strong> {d.owner?.name || d.owner?.email || "—"} {d.owner?.email ? `(${d.owner.email})` : ""}</p>
              <p><strong>Sessions:</strong> {d.sessions.length} · <strong>Locale:</strong> {d.owner?.locale ?? "—"}</p>
            </div>
            <div>
              <p><strong>Onboarded:</strong> {when(d.profile?.onboardedAt ?? null)}</p>
              <p><strong>Data consent:</strong> {when(d.profile?.consentAt ?? null)}</p>
              <p><strong>Agent session:</strong> {d.profile?.agentSessionId ? <code>{d.profile.agentSessionId.slice(0, 18)}…</code> : "—"}</p>
            </div>
          </div>
        </div>

        {/* Support actions */}
        <h3 className="sh-admin-h">Support actions</h3>
        <div className="sh-card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Form method="post"><input type="hidden" name="intent" value="clear-agent" /><button className="sh-btn">Reset agent session</button></Form>
            <Form method="post"><input type="hidden" name="intent" value="refresh-report" /><button className="sh-btn">Force-refresh store report</button></Form>
            <Form method="post"><input type="hidden" name="intent" value="clear-onboarding" /><button className="sh-btn">Clear onboarding (let them redo)</button></Form>
            {d.contentPlan?.status === "active"
              ? <Form method="post"><input type="hidden" name="intent" value="content-pause" /><button className="sh-btn">Pause content plan</button></Form>
              : d.contentPlan
                ? <Form method="post"><input type="hidden" name="intent" value="content-resume" /><button className="sh-btn">Resume content plan</button></Form>
                : null}
            <button
              type="button"
              className="sh-btn"
              onClick={() => {
                const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${short}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download data (JSON)
            </button>
          </div>

          <div className="sh-grid2" style={{ marginTop: 14 }}>
            <Form method="post" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="hidden" name="intent" value="set-plan" />
              <input className="sh-input" name="plan" placeholder="plan (e.g. managed / comp / blank)" defaultValue={d.plan ?? ""} style={{ flex: 1 }} />
              <button className="sh-btn">Set plan</button>
            </Form>
            <Form method="post" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="hidden" name="intent" value="add-note" />
              <input className="sh-input" name="note" placeholder="Add an internal note…" style={{ flex: 1 }} />
              <button className="sh-btn">Add note</button>
            </Form>
          </div>

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: "#b3261e", fontWeight: 700 }}>Danger zone</summary>
            <Form method="post" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}
              onSubmit={(e) => { if (!confirm(`Delete ALL ShopHero data for ${d.shop}? This cannot be undone.`)) e.preventDefault(); }}>
              <input type="hidden" name="intent" value="purge" />
              <input className="sh-input" name="confirm" placeholder='Type DELETE to confirm' style={{ flex: 1 }} />
              <button className="sh-btn" style={{ background: "#b3261e", color: "#fff" }}>Purge shop data</button>
            </Form>
            <p className="sh-hint" style={{ marginTop: 6 }}>Deletes usage, profile, report, content plan, brains and events for this shop. Does not touch the Shopify session/install.</p>
          </details>
        </div>

        {/* Two-column detail */}
        <div className="sh-grid2" style={{ marginTop: 16 }}>
          <div>
            <h3 className="sh-admin-h">Store report</h3>
            <div className="sh-card">
              {d.report ? (
                <>
                  <p className="sh-hint">Generated {when(d.report.generatedAt)} · {(d.report.model ?? "—").replace("claude-", "")}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
                    {d.report.scores.map((s) => <span key={s.label} className="sh-tag">{s.label}: {s.score}</span>)}
                  </div>
                  {d.report.summary && <p>{d.report.summary}</p>}
                  {d.report.findings.length > 0 && <ul className="sh-hint">{d.report.findings.slice(0, 6).map((f, i) => <li key={i}>{f}</li>)}</ul>}
                </>
              ) : <p className="sh-hint">No report cached yet.</p>}
            </div>

            <h3 className="sh-admin-h">Content plan</h3>
            <div className="sh-card">
              {d.contentPlan ? (
                <>
                  <p><span className="sh-tag">{d.contentPlan.status}</span> · {d.contentPlan.perDay}/day for {d.contentPlan.days} days · published {d.contentPlan.publishedCount}</p>
                  {d.contentPlan.draftTitle && <p className="sh-hint">Current draft: <strong>{d.contentPlan.draftTitle}</strong> {d.contentPlan.draftDate ? `(${when(d.contentPlan.draftDate)})` : ""}</p>}
                </>
              ) : <p className="sh-hint">No content plan.</p>}
            </div>

            <h3 className="sh-admin-h">Trained brains ({d.brains.length})</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>Brain</th><th>Size</th><th>Updated</th></tr></thead>
                <tbody>
                  {d.brains.length === 0 ? <tr><td colSpan={3} className="sh-empty-cell">No custom brain knowledge.</td></tr> :
                    d.brains.map((b) => <tr key={b.brain}><td><span className="sh-tag">{b.brain}</span></td><td>{b.len} chars</td><td className="sh-dim">{when(b.updatedAt)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="sh-admin-h">Profile &amp; goals</h3>
            <div className="sh-card">
              <p><strong>Goals:</strong> {d.goals.length ? d.goals.join(", ") : "—"}</p>
              <p><strong>Recommendations:</strong> {d.recsCount}</p>
              <p className="sh-hint">Created {when(d.profile?.createdAt ?? null)} · updated {when(d.profile?.updatedAt ?? null)}</p>
            </div>

            <h3 className="sh-admin-h">Brand kit &amp; memory</h3>
            <div className="sh-card">
              <p><strong>Voice:</strong> {d.brandKit.voice || "—"}</p>
              <p><strong>Audience:</strong> {d.brandKit.audience || "—"}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
                {d.brandKit.colors.map((c) => <span key={c} className="sh-tag" style={{ background: c, color: "#fff" }}>{c}</span>)}
              </div>
              <p><strong>Memory ({d.memory.length}):</strong></p>
              {d.memory.length ? <ul className="sh-hint">{d.memory.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}</ul> : <p className="sh-hint">No memories yet.</p>}
            </div>

            <h3 className="sh-admin-h">Usage by model</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>Model</th><th>Turns</th><th>Cost</th><th>Billed</th></tr></thead>
                <tbody>
                  {d.byModel.length === 0 ? <tr><td colSpan={4} className="sh-empty-cell">No usage.</td></tr> :
                    d.byModel.map((m) => <tr key={m.model}><td className="sh-mono-cell">{m.model.replace("claude-", "")}</td><td>{m.turns}</td><td>{money(m.cost, 4)}</td><td>{money(m.billed, 4)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sessions */}
        <h3 className="sh-admin-h">Sessions</h3>
        <div className="sh-card" style={{ padding: 0 }}>
          <table className="sh-table">
            <thead><tr><th>ID</th><th>Type</th><th>Email</th><th>Owner</th><th>Scopes</th><th>Expires</th></tr></thead>
            <tbody>
              {d.sessions.map((s) => (
                <tr key={s.id}>
                  <td className="sh-mono-cell">{s.id.slice(0, 20)}…</td>
                  <td>{s.online ? "online" : "offline"}</td>
                  <td>{s.email ?? "—"}</td>
                  <td>{s.accountOwner ? "✓" : "—"}</td>
                  <td>{s.scopes || "—"}</td>
                  <td className="sh-dim">{when(s.expires)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent activity + events */}
        <div className="sh-grid2" style={{ marginTop: 16 }}>
          <div>
            <h3 className="sh-admin-h">Recent turns</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>When</th><th>Kind</th><th>Model</th><th>Billed</th></tr></thead>
                <tbody>
                  {d.recent.length === 0 ? <tr><td colSpan={4} className="sh-empty-cell">Nothing yet.</td></tr> :
                    d.recent.map((r, i) => <tr key={i}><td className="sh-dim">{when(r.createdAt)}</td><td>{r.kind ?? "—"}</td><td>{(r.model ?? "—").replace("claude-", "")}</td><td>{money(r.billed, 4)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="sh-admin-h">Events &amp; notes</h3>
            <div className="sh-card" style={{ padding: 0 }}>
              <table className="sh-table">
                <thead><tr><th>When</th><th>Level</th><th>Message</th></tr></thead>
                <tbody>
                  {d.events.length === 0 ? <tr><td colSpan={3} className="sh-empty-cell">No events.</td></tr> :
                    d.events.map((e, i) => (
                      <tr key={i}>
                        <td className="sh-dim">{when(e.createdAt)}</td>
                        <td>{e.level === "error" ? <span className="sh-tag" style={{ background: "rgba(255,80,80,0.14)", color: "#b3261e" }}>error</span> : e.type === "admin_note" ? <span className="sh-tag">note</span> : e.level}</td>
                        <td className={e.level === "error" ? "sh-err-cell" : ""}>{e.message}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
