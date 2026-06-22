import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePlan } from "../lib/billing.server";
import { encrypt, isValidAnthropicKey, isValidThemeToken } from "../lib/crypto.server";
import { clearThemeTokenCache } from "../lib/theme.server";
import { isLikelyStockKey } from "../lib/stock-images.server";
import { getShopSettings, setShopSettings } from "../lib/shop-settings.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const activePlan = await getActivePlan(admin);
  const record = await getShopSettings(session.shop);
  return { activePlan, hasKey: !!record?.anthropicApiKey, hasThemeToken: !!record?.themeToken, hasStockKey: !!record?.stockKey, stockProvider: record?.stockProvider ?? "pexels", shop: session.shop };
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
    await setShopSettings(session.shop, { anthropicApiKey: encrypt(rawKey), plan: "byok" });
    return Response.json({ success: true });
  }

  if (intent === "remove") {
    await setShopSettings(session.shop, { anthropicApiKey: null });
    return Response.json({ success: true });
  }

  if (intent === "saveTheme") {
    const rawToken = String(form.get("themeToken") ?? "").trim();
    if (!isValidThemeToken(rawToken)) {
      return Response.json(
        { error: "Invalid token. Custom-app Admin API tokens start with shpat_" },
        { status: 400 },
      );
    }
    await setShopSettings(session.shop, { themeToken: encrypt(rawToken) });
    clearThemeTokenCache(session.shop);
    return Response.json({ success: true });
  }

  if (intent === "removeTheme") {
    await setShopSettings(session.shop, { themeToken: null });
    clearThemeTokenCache(session.shop);
    return Response.json({ success: true });
  }

  if (intent === "saveStock") {
    const provider = String(form.get("stockProvider") ?? "pexels");
    const rawKey = String(form.get("stockKey") ?? "").trim();
    if (provider !== "pexels" && provider !== "unsplash") {
      return Response.json({ error: "Pick Pexels or Unsplash." }, { status: 400 });
    }
    if (!isLikelyStockKey(provider, rawKey)) {
      return Response.json({ error: `That doesn't look like a ${provider === "pexels" ? "Pexels" : "Unsplash"} key.` }, { status: 400 });
    }
    await setShopSettings(session.shop, { stockKey: encrypt(rawKey), stockProvider: provider });
    return Response.json({ success: true });
  }

  if (intent === "removeStock") {
    await setShopSettings(session.shop, { stockKey: null, stockProvider: null });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}

export default function Settings() {
  const { activePlan, hasKey, hasThemeToken, hasStockKey, stockProvider } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();
  const themeFetcher = useFetcher<{ error?: string; success?: boolean }>();
  const stockFetcher = useFetcher<{ error?: string; success?: boolean }>();
  const navigate = useNavigate();
  const saving = fetcher.state !== "idle";
  const savingTheme = themeFetcher.state !== "idle";
  const savingStock = stockFetcher.state !== "idle";

  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <button className="sh-back" onClick={() => navigate("/app/editor")}>← Back to editor</button>
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

        <div className="sh-card">
          <h3><span className="sh-card-emoji">🎨</span> Theme editing access</h3>
          {hasThemeToken ? (
            <div>
              <p style={{ marginBottom: 12 }}>This store&apos;s theme token is saved and encrypted. ShopHero can build and preview theme changes here.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span className="sh-keymask">shpat_••••••••••••••••••••</span>
                <themeFetcher.Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="removeTheme" />
                  <button className="sh-btn" style={{ background: "linear-gradient(180deg,#fff,#f7eceb)", color: "#c0392b" }} type="submit" disabled={savingTheme}>
                    Remove token
                  </button>
                </themeFetcher.Form>
              </div>
            </div>
          ) : (
            <themeFetcher.Form method="post" className="sh-field">
              <input type="hidden" name="intent" value="saveTheme" />
              <p style={{ marginBottom: 10 }}>
                To let ShopHero edit this store&apos;s theme, paste a custom-app Admin API token with the <strong>write_themes</strong> scope.
              </p>
              <label className="sh-label" htmlFor="themeToken">Theme token</label>
              <input id="themeToken" name="themeToken" type="password" className="sh-text-input" placeholder="shpat_..." autoComplete="off" required />
              <p className="sh-hint">
                Create it in this store: <strong>Settings → Apps and sales channels → Develop apps → Create an app</strong>,
                enable <strong>write_themes</strong> + <strong>read_themes</strong>, Install, then copy the Admin API access token.
                It&apos;s encrypted at rest.
              </p>
              {themeFetcher.data?.error && <div className="sh-err">{themeFetcher.data.error}</div>}
              {themeFetcher.data?.success && <div className="sh-ok">Theme token saved. Reload the editor to start making changes.</div>}
              <div>
                <button className="sh-btn sh-btn-dark" type="submit" disabled={savingTheme}>
                  {savingTheme ? "Saving…" : "Save token"}
                </button>
              </div>
            </themeFetcher.Form>
          )}
        </div>

        <div className="sh-card">
          <h3><span className="sh-card-emoji">🧠</span> Brand &amp; knowledge</h3>
          <p style={{ marginBottom: 12 }}>Tune how ShopHero writes and what it knows about your store. Most merchants never need these — they&apos;re auto-derived from your store.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="sh-btn" onClick={() => navigate("/app/brand")}>Brand voice →</button>
            <button className="sh-btn" onClick={() => navigate("/app/brains")}>Knowledge (advanced) →</button>
          </div>
        </div>

        <div className="sh-card">
          <h3><span className="sh-card-emoji">🖼️</span> Stock images</h3>
          {hasStockKey ? (
            <div>
              <p style={{ marginBottom: 12 }}>Connected to <strong>{stockProvider === "unsplash" ? "Unsplash" : "Pexels"}</strong>. Search license-clean photos and add them to your Files from the editor&apos;s Stock Images tool.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span className="sh-keymask">••••••••••••••••</span>
                <stockFetcher.Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="removeStock" />
                  <button className="sh-btn" style={{ background: "linear-gradient(180deg,#fff,#f7eceb)", color: "#c0392b" }} type="submit" disabled={savingStock}>
                    Disconnect
                  </button>
                </stockFetcher.Form>
              </div>
            </div>
          ) : (
            <stockFetcher.Form method="post" className="sh-field">
              <input type="hidden" name="intent" value="saveStock" />
              <p style={{ marginBottom: 10 }}>
                Connect a free stock-photo account so ShopHero can pull real, license-clean images into your store instead of placeholders.
              </p>
              <label className="sh-label" htmlFor="stockProvider">Provider</label>
              <select id="stockProvider" name="stockProvider" className="sh-text-input" defaultValue={stockProvider}>
                <option value="pexels">Pexels (free)</option>
                <option value="unsplash">Unsplash (free)</option>
              </select>
              <label className="sh-label" htmlFor="stockKey" style={{ marginTop: 10 }}>API key</label>
              <input id="stockKey" name="stockKey" type="password" className="sh-text-input" placeholder="Paste your API key" autoComplete="off" required />
              <p className="sh-hint">
                <strong>Pexels:</strong> create a free key at pexels.com/api. <strong>Unsplash:</strong> create an app at unsplash.com/developers and copy the Access Key. Encrypted at rest.
              </p>
              {stockFetcher.data?.error && <div className="sh-err">{stockFetcher.data.error}</div>}
              {stockFetcher.data?.success && <div className="sh-ok">Connected. Open the Stock Images tool in the editor to search.</div>}
              <div>
                <button className="sh-btn sh-btn-dark" type="submit" disabled={savingStock}>
                  {savingStock ? "Saving…" : "Connect"}
                </button>
              </div>
            </stockFetcher.Form>
          )}
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
