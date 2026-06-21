import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { encrypt, isValidAnthropicKey } from "../lib/crypto.server";
import db from "../db.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const activePlan = await getActivePlan(admin);
  const record = await db.session.findFirst({ where: { shop: session.shop } });
  return { activePlan, hasKey: !!record?.anthropicApiKey, shop: session.shop };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const rawKey = String(form.get("apiKey") ?? "").trim();
    if (!isValidAnthropicKey(rawKey)) {
      return Response.json(
        { error: "Invalid API key format. Anthropic keys start with sk-ant-" },
        { status: 400 },
      );
    }
    await db.session.updateMany({
      where: { shop: session.shop },
      data: { anthropicApiKey: encrypt(rawKey), plan: "byok" },
    });
    return Response.json({ success: true });
  }

  if (intent === "remove") {
    await db.session.updateMany({
      where: { shop: session.shop },
      data: { anthropicApiKey: null },
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}

export default function Settings() {
  const { activePlan, hasKey } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();
  const navigate = useNavigate();
  const saving = fetcher.state !== "idle";

  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <button className="sh-back" onClick={() => navigate("/app")}>← Back to editor</button>
        <div className="sh-doc-kicker">Settings</div>
        <h1>Settings</h1>
        <p className="sh-doc-lead">Manage your plan and AI connection.</p>

        <div className="sh-card">
          <h3><span className="sh-card-emoji">💳</span> Plan</h3>
          <p>
            {activePlan === "managed" ? (
              <><span className="sh-tag">Managed AI</span> — AI is included, no API key needed.</>
            ) : activePlan === "byok" ? (
              <><span className="sh-tag">Bring Your Own Key</span> — flat monthly fee; you connect your own Anthropic key below.</>
            ) : (
              <>No active plan. <a className="sh-link" href="/app/pricing">Choose a plan →</a></>
            )}
          </p>
          <div style={{ marginTop: 14 }}>
            <button className="sh-btn sh-btn-primary" style={{ display: "inline-block" }} onClick={() => navigate("/app/usage")}>
              View usage &amp; billing
            </button>
          </div>
        </div>

        {activePlan === "managed" ? (
          <div className="sh-card">
            <h3><span className="sh-card-emoji">🔑</span> Anthropic API key</h3>
            <p>You&apos;re on Managed AI — ShopHero supplies the AI, so there&apos;s nothing to configure here.</p>
          </div>
        ) : (
          <div className="sh-card">
            <h3><span className="sh-card-emoji">🔑</span> Anthropic API key</h3>
            {hasKey ? (
              <div>
                <p style={{ marginBottom: 12 }}>Your key is saved and encrypted at rest.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <span className="sh-keymask">sk-ant-••••••••••••••••••••••••</span>
                  <fetcher.Form method="post" style={{ display: "inline" }}>
                    <input type="hidden" name="intent" value="remove" />
                    <button className="sh-btn" style={{ background: "linear-gradient(180deg,#fff,#f7eceb)", color: "#c0392b" }} type="submit" disabled={saving}>
                      Remove key
                    </button>
                  </fetcher.Form>
                </div>
              </div>
            ) : (
              <fetcher.Form method="post" className="sh-field">
                <input type="hidden" name="intent" value="save" />
                <label className="sh-label" htmlFor="apiKey">API key</label>
                <input id="apiKey" name="apiKey" type="password" className="sh-text-input" placeholder="sk-ant-..." autoComplete="off" required />
                <p className="sh-hint">
                  Get one from{" "}
                  <a className="sh-link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
                  It&apos;s encrypted at rest and only used to run your edits.
                </p>
                {fetcher.data?.error && <div className="sh-err">{fetcher.data.error}</div>}
                {fetcher.data?.success && <div className="sh-ok">Key saved.</div>}
                <div>
                  <button className="sh-btn sh-btn-dark" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save key"}
                  </button>
                </div>
              </fetcher.Form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
