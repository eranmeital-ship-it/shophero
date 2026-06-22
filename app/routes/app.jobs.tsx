import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";

import { authenticate } from "../shopify.server";
import { listJobs, setJobStatus } from "../lib/jobs.server";
import { runJobNow } from "../lib/job-runner.server";
import { projectEta, JOB_TYPES } from "../lib/jobs-types";
import "../styles/shophero.css";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const fd = await request.formData();
  const id = String(fd.get("id") || "");
  const op = String(fd.get("op") || "");
  if (id && op === "run") {
    const res = await runJobNow(session.shop, id, admin).catch(() => null);
    return { ok: !!res, ran: res };
  }
  if (id && (op === "pause" || op === "resume" || op === "cancel")) {
    await setJobStatus(session.shop, id, op === "pause" ? "paused" : op === "resume" ? "scheduled" : "canceled");
  }
  return { ok: true };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const jobs = await listJobs(session.shop);
  return {
    jobs: jobs.map((j) => {
      const unit = (JOB_TYPES as Record<string, { unit?: string }>)[j.type]?.unit ?? "items";
      const { daysLeft, eta } = projectEta(j.total, j.completed, j.perDay);
      return {
        id: j.id,
        title: j.title,
        type: j.type,
        unit,
        status: j.status,
        total: j.total,
        completed: j.completed,
        perDay: j.perDay,
        pct: j.total > 0 ? Math.round((j.completed / j.total) * 100) : 0,
        daysLeft,
        eta,
        createdAt: j.createdAt.toISOString(),
      };
    }),
  };
}

const STATUS_TAG: Record<string, { label: string; bg: string; fg: string }> = {
  scheduled: { label: "Scheduled", bg: "rgba(10,132,255,0.14)", fg: "#0a5bd6" },
  running: { label: "Running", bg: "rgba(110,197,49,0.18)", fg: "#1c7c3a" },
  paused: { label: "Paused", bg: "rgba(255,149,0,0.16)", fg: "#9a6200" },
  done: { label: "Done", bg: "rgba(52,199,89,0.16)", fg: "#1c7c3a" },
  canceled: { label: "Canceled", bg: "rgba(0,0,0,0.06)", fg: "#6a6a78" },
  error: { label: "Error", bg: "rgba(255,80,80,0.14)", fg: "#b3261e" },
};

export default function JobsPage() {
  const { jobs } = useLoaderData<typeof loader>();
  const active = jobs.filter((j) => ["scheduled", "running", "paused"].includes(j.status));

  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <div className="sh-doc-kicker">Automation</div>
        <h1>Scheduled Jobs</h1>
        <p className="sh-doc-lead">
          Big changes run safely over time instead of all at once — up to{" "}
          <strong>{JOB_TYPES.bulk_product_pages.perDay} product pages/day</strong> and{" "}
          <strong>{JOB_TYPES.content_articles.perDay} articles/day</strong>. Track progress, pause, or cancel anytime.
        </p>

        {jobs.length === 0 ? (
          <div className="sh-card">
            <p style={{ margin: 0 }}>
              No scheduled jobs yet. When you ask for something big — like “rewrite all my product descriptions” —
              ShopHero schedules it here and works through it a safe amount each day.
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <p className="sh-hint" style={{ marginBottom: 12 }}>
                {active.length} active job{active.length === 1 ? "" : "s"} in progress.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {jobs.map((j) => {
                const tag = STATUS_TAG[j.status] ?? STATUS_TAG.scheduled;
                return (
                  <div key={j.id} className="sh-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <h3 style={{ margin: "0 0 4px" }}>{j.title}</h3>
                        <p className="sh-hint" style={{ margin: 0 }}>
                          {j.completed.toLocaleString()} / {j.total.toLocaleString()} {j.unit} · {j.perDay}/day
                          {["scheduled", "running", "paused"].includes(j.status) && j.daysLeft > 0
                            ? ` · ~${j.daysLeft} day${j.daysLeft === 1 ? "" : "s"} left (done by ${j.eta})`
                            : ""}
                        </p>
                      </div>
                      <span className="sh-tag" style={{ background: tag.bg, color: tag.fg }}>{tag.label}</span>
                    </div>

                    <div className="sh-bill-track" style={{ marginTop: 12 }}>
                      <div className="sh-bill-fill" style={{ width: `${j.pct}%` }} />
                    </div>

                    {["scheduled", "running", "paused"].includes(j.status) && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {j.status !== "paused" && (
                          <Form method="post"><input type="hidden" name="id" value={j.id} /><input type="hidden" name="op" value="run" /><button className="sh-btn sh-btn-primary">Run next batch now</button></Form>
                        )}
                        {j.status === "paused" ? (
                          <Form method="post"><input type="hidden" name="id" value={j.id} /><input type="hidden" name="op" value="resume" /><button className="sh-btn">Resume</button></Form>
                        ) : (
                          <Form method="post"><input type="hidden" name="id" value={j.id} /><input type="hidden" name="op" value="pause" /><button className="sh-btn">Pause</button></Form>
                        )}
                        <Form method="post" onSubmit={(e) => { if (!confirm("Cancel this job?")) e.preventDefault(); }}>
                          <input type="hidden" name="id" value={j.id} />
                          <input type="hidden" name="op" value="cancel" />
                          <button className="sh-btn" style={{ color: "#b3261e" }}>Cancel</button>
                        </Form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
