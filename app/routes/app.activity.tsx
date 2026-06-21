import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useNavigation, Form } from "react-router";

import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { listVersions, workspaceDir, restoreToVersion, undoCommit, commitBaseline } from "../lib/workspace.server";
import { pushWorkspaceChanges } from "../lib/theme.server";
import { listJobs } from "../lib/jobs.server";
import { projectEta, JOB_TYPES } from "../lib/jobs-types";
import db from "../db.server";
import "../styles/shophero.css";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const fd = await request.formData();
  const sha = String(fd.get("sha") || "");
  const op = String(fd.get("op") || "restore");
  if (!sha) return { ok: false, error: "Missing version id." };
  try {
    const { themeId, dir } = await ensureReady(ctx);

    if (op === "undo") {
      let toPush: string[];
      try {
        toPush = await undoCommit(dir, sha);
      } catch (err) {
        if (err instanceof Error && err.message === "CONFLICT") {
          return {
            ok: false,
            error: "This change overlaps with a newer change, so it can't be undone on its own. Undo the newer change first, or use “Revert to here” to roll back to this point.",
          };
        }
        throw err;
      }
      if (toPush.length) await pushWorkspaceChanges(ctx, themeId, dir, toPush);
      await db.appEvent
        .create({ data: { shop: session.shop, level: "info", type: "undo", message: `Undid change ${sha.slice(0, 7)} (${toPush.length} file(s))` } })
        .catch(() => {});
      return { ok: true, message: `Undid that change — ${toPush.length} file(s) updated. Later changes were kept.` };
    }

    // restore = point-in-time rollback
    const toPush = await restoreToVersion(dir, sha);
    if (toPush.length) await pushWorkspaceChanges(ctx, themeId, dir, toPush);
    await commitBaseline(dir, `rolled back to ${sha.slice(0, 7)}`);
    await db.appEvent
      .create({ data: { shop: session.shop, level: "info", type: "rollback", message: `Reverted to ${sha.slice(0, 7)} (${toPush.length} file(s))` } })
      .catch(() => {});
    return { ok: true, message: `Reverted ${toPush.length} file(s) to that point.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [versions, jobs, events] = await Promise.all([
    listVersions(workspaceDir(shop)).catch(() => []),
    listJobs(shop),
    db.appEvent.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const upcoming = jobs
    .filter((j) => ["scheduled", "running", "paused"].includes(j.status))
    .map((j) => {
      const { daysLeft, eta } = projectEta(j.total, j.completed, j.perDay);
      const unit = (JOB_TYPES as Record<string, { unit?: string }>)[j.type]?.unit ?? "items";
      return {
        id: j.id,
        title: j.title,
        status: j.status,
        completed: j.completed,
        total: j.total,
        perDay: j.perDay,
        unit,
        daysLeft,
        eta,
        pct: j.total > 0 ? Math.round((j.completed / j.total) * 100) : 0,
      };
    });

  return {
    versions,
    upcoming,
    events: events.map((e) => ({ level: e.level, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })),
  };
}

const when = (iso: string) => new Date(iso).toLocaleString();
const whenShort = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const EVENT_META: Record<string, { icon: string; label: string }> = {
  command: { icon: "💬", label: "Command" },
  apply: { icon: "✅", label: "Applied changes" },
  rollback: { icon: "↩️", label: "Reverted" },
  undo: { icon: "⤺", label: "Undid a change" },
  rollback_error: { icon: "⚠️", label: "Revert failed" },
  job_scheduled: { icon: "📅", label: "Scheduled job" },
  job_progress: { icon: "⚙️", label: "Job progress" },
  admin_note: { icon: "📝", label: "Note" },
  chat_error: { icon: "⚠️", label: "Error" },
  spend_cap: { icon: "🛑", label: "Usage limit" },
};

export default function ActivityPage() {
  const { versions, upcoming, events } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const reverting = nav.state === "submitting";

  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <div className="sh-doc-kicker">Activity</div>
        <h1>Activity &amp; History</h1>
        <p className="sh-doc-lead">Everything ShopHero has done, what's coming up, and one-click revert to any earlier point.</p>

        {result?.ok && <div className="sh-card" style={{ background: "rgba(52,199,89,0.12)", borderColor: "rgba(52,199,89,0.4)" }}>✓ {result.message}</div>}
        {result && !result.ok && <div className="sh-card" style={{ background: "rgba(255,80,80,0.1)", borderColor: "rgba(255,80,80,0.4)" }}>✕ {result.error}</div>}

        {/* Upcoming */}
        <h3 className="sh-admin-h">Upcoming tasks</h3>
        {upcoming.length === 0 ? (
          <div className="sh-card"><p style={{ margin: 0 }} className="sh-hint">No scheduled work. Big requests (like “rewrite all my descriptions”) get scheduled here and roll out a safe amount each day.</p></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcoming.map((j) => (
              <div key={j.id} className="sh-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>{j.title}</strong>
                  <span className="sh-tag">{j.status}</span>
                </div>
                <p className="sh-hint" style={{ margin: "4px 0 8px" }}>
                  {j.completed.toLocaleString()}/{j.total.toLocaleString()} {j.unit} · {j.perDay}/day
                  {j.daysLeft > 0 ? ` · ~${j.daysLeft} day${j.daysLeft === 1 ? "" : "s"} left (done by ${j.eta})` : ""}
                </p>
                <div className="sh-bill-track"><div className="sh-bill-fill" style={{ width: `${j.pct}%` }} /></div>
              </div>
            ))}
            <p className="sh-hint">Manage these under <a className="sh-link" href="/app/jobs">Scheduled Jobs →</a></p>
          </div>
        )}

        {/* Version history with revert */}
        <h3 className="sh-admin-h">Change history</h3>
        <div className="sh-card" style={{ padding: 0 }}>
          <table className="sh-table">
            <thead><tr><th>When</th><th>Change</th><th>Files</th><th></th></tr></thead>
            <tbody>
              {versions.length === 0 ? (
                <tr><td colSpan={4} className="sh-empty-cell">No changes applied yet.</td></tr>
              ) : (
                versions.map((v, i) => (
                  <tr key={v.sha}>
                    <td className="sh-dim">{whenShort(v.date)}</td>
                    <td>{v.label}{i === 0 && <span className="sh-tag" style={{ marginLeft: 8 }}>current</span>}</td>
                    <td>{v.files}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {/* Undo just this one change (kept everything after it). Hidden on the oldest/baseline row. */}
                        {i < versions.length - 1 && (
                          <Form method="post" onSubmit={(e) => { if (!confirm("Undo just this change? Everything after it stays. (If it overlaps a newer change, we'll tell you.)")) e.preventDefault(); }}>
                            <input type="hidden" name="sha" value={v.sha} />
                            <input type="hidden" name="op" value="undo" />
                            <button className="sh-btn" disabled={reverting}>Undo this change</button>
                          </Form>
                        )}
                        {/* Point-in-time restore. Disabled on the current row. */}
                        {i !== 0 && (
                          <Form method="post" onSubmit={(e) => { if (!confirm("Revert your theme to this point? Later changes will be rolled back (still reversible).")) e.preventDefault(); }}>
                            <input type="hidden" name="sha" value={v.sha} />
                            <input type="hidden" name="op" value="restore" />
                            <button className="sh-btn" disabled={reverting}>Revert to here</button>
                          </Form>
                        )}
                        {i === 0 && versions.length === 1 && <span className="sh-dim">—</span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="sh-hint">Reverting brings your <strong>dev theme</strong> back to that snapshot and is itself reversible — your live theme is never touched.</p>

        {/* Activity feed */}
        <h3 className="sh-admin-h">Recent activity</h3>
        <div className="sh-card" style={{ padding: 0 }}>
          <table className="sh-table">
            <thead><tr><th>When</th><th>Type</th><th>Detail</th></tr></thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={3} className="sh-empty-cell">Nothing yet.</td></tr>
              ) : (
                events.map((e, i) => {
                  const m = EVENT_META[e.type ?? ""] ?? { icon: "•", label: e.type ?? "event" };
                  return (
                    <tr key={i}>
                      <td className="sh-dim">{when(e.createdAt)}</td>
                      <td>{m.icon} {m.label}</td>
                      <td className={e.level === "error" ? "sh-err-cell" : ""}>{e.message}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
