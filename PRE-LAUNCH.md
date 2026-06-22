# ShopHero — Pre-Launch QA & Readiness

Run this end-to-end on a **real test store** before launch. The dev store with a
storefront password blocks live preview + schema verification, so use a store
with the password OFF (or a Shopify Partner dev store you control).

For each test: do the **Steps**, confirm the **Expect**, and tick the box. If
anything fails, note it — that's a launch blocker until fixed.

Legend: 🆓 deterministic/free · 💸 uses AI (metered) · 🔒 security · ♻️ durability

---

## 0. Environment preflight
- [ ] Volume mounted at `/data`; `DRIFT_WORKSPACE_ROOT=/data/drift-workspaces`; single instance.
- [ ] `DRIFT_ENCRYPTION_KEY`, `SHOPIFY_API_KEY/SECRET`, `DATABASE_URL/DIRECT_URL` set.
- [ ] `DRIFT_DEV_PLAN=managed` (pilot) — **plan to unset at public launch**.
- [ ] `DRIFT_ALLOW_BASH` unset. `DRIFT_CRON_SECRET` set. `ADMIN_PASSWORD` set.
- [ ] Latest deploy is green; migrations applied (check logs for `prisma migrate deploy`).

## 1. Onboarding
- [ ] Install/open the app → OAuth completes, no redirect loop.
- [ ] Onboarding: store scan runs, growth plan shows, consent step shows the **usage note**, "Unleash" lands on the dashboard.
- [ ] First dashboard load: theme working-copy bootstrap completes (~1 min once), no crash.

## 2. Free / deterministic flows 🆓 (should cost $0)
- [ ] **Add Section** → pick one → it stages → **Accept** → appears in preview. Usage pill does **not** move.
- [ ] **AEO Brain** → audit runs, score shows; **Install schema** → stages → Accept. Coverage map fills.
- [ ] **Build PDP** → pick a blueprint → Apply → stages the section stack → Accept.
- [ ] **Restore points**: open version history → a prior version exists → "Revert to here" works.

## 3. Direct content flows 💸 (cheap, metered)
- [ ] **Rewrite Descriptions** → generate (≤20) → before/after shows → **Publish** → live products update.
- [ ] **SEO / Alt text / Write article** each: generate → review → apply/publish; deliverable link works for the article.
- [ ] Open **Usage** → a `content` usage event appears with a small $ amount. ✅ metering works.

## 4. Agent edit + the NEW approval gate 💸🔒 (most important)
- [ ] Free-text theme edit (e.g. "make my homepage hero headline bigger") → runs → stages → **Accept** → preview updates.
- [ ] Ask for a **live store change** (e.g. "create a collection called Summer Sale") → agent **proposes** it (does NOT run it) → an **Approve & run** bar appears.
- [ ] Click **Approve & run** → it applies **instantly** (no second agent run), shows a ✓ message + deliverable link, and the collection actually exists in Shopify admin. ✅ server-side replay works.
- [ ] Decline path: propose a change, then run a *different* task instead → the stale proposal does not silently apply.

## 5. Metering integrity 💸 (the bug you caught — verify it's fixed)
- [ ] Start a longer agent task, then hit **Stop** mid-run → message says it stopped **and that AI used so far is counted**.
- [ ] Open **Usage** → a usage event (`chat` or `chat-failed`) was recorded for that stopped run. ✅ no more un-billed spend.
- [ ] Let a task run to the timeout (or simulate) → UI recovers, no permanent spinner.

## 6. Action plan (routed checklist) 💸 (decompose is metered, steps vary)
- [ ] **Improve my store** → type a goal → it decomposes into a routed checklist with per-step cost badges.
- [ ] Run a **free** step (e.g. schema) → Accept → it **auto-marks shipped** with date + cost.
- [ ] Reload the page → the plan + progress are **still there** (persisted).
- [ ] "New goal" archives the current plan.

## 7. Scheduled jobs ♻️💸
- [ ] Ask for a catalog-wide task on a store with many products (e.g. "rewrite all product descriptions") → it **schedules a job** (doesn't run it all live) with an ETA.
- [ ] Open **Scheduled Jobs** → the job shows; **Run next batch now** → progress advances; descriptions update for that batch.
- [ ] Re-ask the same thing a different way → **no duplicate job** is created (dedupe).
- [ ] Cron: `curl -fsS -H "Authorization: Bearer $DRIFT_CRON_SECRET" https://<app>/api/cron/jobs` → returns `{"ok":true,...}` and advances a due job.

## 8. Stock images 💸(provider) / 🆓(ours)
- [ ] Settings → connect a Pexels/Unsplash key → **Stock Images** tool → search → **Add to Files** → ✓, and the image appears under Shopify **Content → Files**.

## 9. Durability ♻️ (the volume + ShopSettings work)
- [ ] Make a theme change → **Accept**, then **redeploy** the service → reopen → **version history / restore points are still there**. ✅ volume.
- [ ] (If feasible) uninstall + reinstall the app → your saved theme token / keys / plan are **still set** (not wiped). ✅ ShopSettings.

## 10. Security spot-checks 🔒
- [ ] `/ai-check` with a normal store URL → works. With `http://169.254.169.254/...` or `http://localhost` → **rejected** (no metadata leak).
- [ ] `curl https://<app>/api/cron/jobs` **without** the secret → `401`. With wrong secret → `401`.
- [ ] Hit `/api/aeo-targets` ~10× fast → eventually **429** (rate limit), and spend caps block once a daily cap is hit.
- [ ] Confirm error messages shown to a merchant are friendly (no raw Shopify/Anthropic stack/bodies).

---

## Launch readiness checklist
**App Store listing**
- [ ] App icon, feature media, 3+ screenshots, screencast URL.
- [ ] Listing copy (intro/details/features/search terms) finalized.
- [ ] Category, integrations, test account + reviewer instructions (incl. storefront password if any).

**Billing & legal**
- [ ] Pricing/plan live; "I charge outside Shopify Billing API" left **unchecked**.
- [ ] Terms + Privacy reachable; Terms billing clause includes the stopped/failed-task usage disclosure.
- [ ] `DRIFT_DEV_PLAN` **unset** for public distribution (real Shopify billing enforced) — OR keep `managed` only for an explicit free pilot.

**Access & ops**
- [ ] Theme-write exemption submitted/approved, OR per-shop theme-token flow documented for merchants.
- [ ] Support inbox (hello@shophero.io) monitored; contact form works.
- [ ] Spend caps (`DRIFT_CAP_*`, `DRIFT_PILOT_CAP_USD`) set to comfortable values.
- [ ] Cron scheduled (daily) for `/api/cron/jobs`.
- [ ] An error/usage glance: the operator `/admin` console loads and shows recent events.

**Post-launch watch (first week)**
- [ ] Watch `AppEvent` errors + the global daily spend cap.
- [ ] Spot-check a few merchants' Usage vs. your Anthropic spend (metering accuracy).
