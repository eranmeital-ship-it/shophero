# Deploying ShopHero (Railway)

ShopHero runs as a single long-running container (React Router 7 server + Prisma/Postgres
+ Claude Agent SDK). This is the canonical list of environment variables and the
infrastructure that MUST be in place. Prisma migrations run automatically on container
start (`prisma migrate deploy`).

---

## ⚠️ Critical infrastructure (don't skip)

### 1. Persistent volume for the theme workspace
Theme edits are staged in a per-shop git workspace **on disk** (uncommitted changes =
"pending", commit history = restore points). The container filesystem is **ephemeral** —
wiped on every deploy — so without a volume, **staged changes and version/restore history
are lost on each deploy**.

- Attach a Railway **Volume** to the app service, mount path: **`/data`**
  (Railway: ⌘K → "Create Volume" → pick the service → mount path `/data`).
- Set `DRIFT_WORKSPACE_ROOT=/data/drift-workspaces` (any path **under** the mount).
- A Railway volume **forces the service to a single replica** — which is REQUIRED:
  the per-shop concurrency locks (`app/lib/shop-lock.server.ts`) are in-process, so the
  app must run on exactly **one instance**. Do not scale horizontally until staging is
  moved to DB-backed storage (the "Option A" follow-up).

### 2. Postgres
`DATABASE_URL` (+ `DIRECT_URL` for Prisma). Use Railway's own Postgres URLs — do not
delete the Postgres service's own generated variables.

---

## Required variables

| Variable | Purpose |
|---|---|
| `SHOPIFY_API_KEY` | Shopify app API key (client id) |
| `SHOPIFY_API_SECRET` | Shopify app secret 🔒 |
| `SCOPES` | Comma-separated OAuth scopes |
| `SHOPIFY_APP_URL` | Public app URL (e.g. `https://app.shophero.io`). Falls back to `HOST` in dev. |
| `DATABASE_URL` | Postgres connection string 🔒 |
| `DIRECT_URL` | Postgres direct URL for Prisma migrations 🔒 |
| `DRIFT_ENCRYPTION_KEY` | AES-256 key encrypting per-shop secrets (BYOK key, theme token, stock key) 🔒 — **rotating/losing this makes saved keys undecryptable** |
| `ANTHROPIC_API_KEY` | Anthropic key for managed-mode AI 🔒 (or use the pool below) |

---

## Security (Wave 1 hardening — set these)

| Variable | Recommended | Purpose |
|---|---|---|
| `DRIFT_ALLOW_BASH` | **leave UNSET** | The agent's shell tool. OFF unless set to `true`. Only enable in an isolated sandbox — it's reachable via prompt injection from store content. |
| `DRIFT_CRON_SECRET` | set a long random string 🔒 | Required to enable the scheduled-jobs cron (`/api/cron/jobs`). The endpoint fails closed (does nothing) until this is set. |
| `ADMIN_PASSWORD` | set a strong value 🔒 | Gate for the operator `/admin` console. |

The agent subprocess env is scrubbed to an allowlist, so other secrets here never reach it.

## Cost caps (Wave 1 — sensible defaults, tune as needed)

| Variable | Default | Purpose |
|---|---|---|
| `DRIFT_CAP_SHOP_DAILY_USD` | `25` | Per-shop spend/day (billed $ on managed, raw $ on BYOK) |
| `DRIFT_CAP_SHOP_MONTHLY_USD` | `250` | Per-shop spend/month |
| `DRIFT_CAP_GLOBAL_DAILY_USD` | `200` | ALL managed spend/day — your backstop |
| `DRIFT_PILOT_CAP_USD` | `15` | Hard REAL-cost/day ceiling for the free pilot |

These are enforced on every LLM route AND the background job runner. Set any to `0` to disable that gate.

## Plan / billing

| Variable | Notes |
|---|---|
| `DRIFT_DEV_PLAN` | `managed` = free pilot (AI on us, capped by `DRIFT_PILOT_CAP_USD`); `byok` = bring-your-own-key. **Keep `managed` during the pilot. Unset in production public distribution** so real Shopify billing is enforced. |
| `DRIFT_BILLING_TEST` | Test-mode billing subscriptions (non-production). |

---

## AI providers & routing (optional beyond Anthropic)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEYS` | Comma-separated key **pool** (rotation + failover) 🔒. Never exposed to the agent subprocess. |
| `DRIFT_MODEL` / `DRIFT_MODEL_SMART` / `DRIFT_MODEL_MAX` | Override the cheap / smart / max tier model ids. |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` | Fallback providers for the structured (non-agent) LLM calls 🔒. |
| `OPENAI_MODEL` / `GEMINI_MODEL` / `OPENROUTER_MODEL` | Model overrides for those providers. |
| `DRIFT_LLM_PROVIDERS` | Provider order, e.g. `anthropic,openai,gemini,openrouter`. |
| `DRIFT_BEDROCK` / `DRIFT_BEDROCK_MODEL` / `AWS_REGION` / `AWS_DEFAULT_REGION` | Optional Amazon Bedrock agent route. |
| `DRIFT_VERTEX` / `DRIFT_VERTEX_MODEL` / `ANTHROPIC_VERTEX_PROJECT_ID` / `CLOUD_ML_REGION` | Optional Google Vertex agent route. |

---

## Theme writes

| Variable | Purpose |
|---|---|
| `DRIFT_THEME_TOKEN` | Global custom-app Admin token (`write_themes`) 🔒 — fallback when a shop hasn't set its own per-shop token in Settings. |
| `DRIFT_THEME_NAME` | Pin the working theme name (disables the `v1.x · timestamp` version stamping on apply). |

Per-shop theme tokens (set by the merchant in Settings) take precedence and are stored
encrypted in `ShopSettings`.

## Scheduled jobs

| Variable | Default | Purpose |
|---|---|---|
| `DRIFT_JOBS_AUTORUN` | on | On-entry daily batch advance. Set `false` to disable. |
| `DRIFT_CRON_MAX_SHOPS` | `50` | Max jobs advanced per cron invocation. |

**Cron setup:** schedule a daily hit to `/api/cron/jobs` with the secret:
```
curl -fsS -H "Authorization: Bearer $DRIFT_CRON_SECRET" https://app.shophero.io/api/cron/jobs
```

---

## Tuning (optional)

| Variable | Default | Purpose |
|---|---|---|
| `DRIFT_REQUEST_TIMEOUT_MS` | `240000` | Agent turn wall-clock cap. |
| `DRIFT_MAX_TURNS` | `16` | Max agent tool-call turns per request. |
| `DRIFT_MAX_CONCURRENT` | `4` | Concurrent agent turns per instance. |
| `DRIFT_REFINE` | on | Pre-flight triage questions. Set `false` to disable. |
| `DRIFT_REPORT_MIN_HOURS` | `24` | Min hours between store-report regenerations. |
| `SHOPIFY_API_VERSION` / `SHOPIFY_ADMIN_API_VERSION` | — | Override the Admin API version. |
| `SHOP_CUSTOM_DOMAIN` | — | Allow a custom shop domain. |
| `NODE_ENV` | `production` | Standard. |

## Email / contact (optional)

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Sends contact-form mail 🔒. |
| `CONTACT_FROM` | From-address for contact mail. |
| `PAGESPEED_API_KEY` | Google PageSpeed Insights key (speed checks) 🔒. |

---

## Post-deploy verification
1. Variable changes trigger a redeploy; if not, hit **Deploy**.
2. Confirm the volume is mounted: make a theme change → **Accept**, then redeploy and
   confirm **version history / restore points persist** (the whole point of the volume).
3. First load after attaching the volume re-clones the working theme (~1 min) — expected.
4. Confirm `DRIFT_DEV_PLAN=managed` for the pilot; **unset it** at public launch.
5. Leave `DRIFT_ALLOW_BASH` unset.

🔒 = secret. Never commit these; never expose them client-side.
