# ShopHero — App Store Submission Readiness

Living checklist to get ShopHero through Shopify App Store review. Check items off
as they're done. Sections marked **[BLOCKER]** must be complete before submitting.

---

## 0. Sequencing (read first)

The realistic order, because some steps gate others:

1. **Theme-write exemption [BLOCKER for public install]** — submit the request now;
   it's reviewed by Shopify and can take days–weeks. A public OAuth install can't
   write themes until this is granted. Until then, pilots run on per-store
   custom-app tokens (`DRIFT_THEME_TOKEN`).
2. **Close the code/config gaps** (sections 1–4) — can be done in parallel.
3. **Prepare the listing + docs** (sections 5–6).
4. **Final QA pass** (section 7) on a clean test store.
5. **Submit** (section 8).

---

## 1. Functionality & stability [BLOCKER]

- [ ] Clean OAuth install on a brand-new dev store (no errors).
- [ ] Embedded app loads via App Bridge with session-token auth (no cookie reliance).
- [ ] No uncaught errors → app never shows a blank "Application Error" (we added
      graceful fallbacks: theme-access gate + "getting ready" loader).
- [ ] Browser console is clean (no red errors) on the main screens.
- [ ] Every primary flow works end-to-end: onboarding → edit (stage → approve →
      publish) → optimize/scorecard → activity (revert/undo) → scheduled jobs →
      brand kit → brains → usage → settings.
- [ ] App handles a store with **lots of products** (scope guard / slow-release jobs).
- [ ] App handles an **empty/new** store without crashing or absurd numbers
      (onboarding estimate is now conservative + revenue-anchored).
- [ ] Uninstall → reinstall works cleanly (data cleanup fires).

## 2. Billing [BLOCKER]

ShopHero already uses the Shopify Billing API (`app/lib/billing.server.ts`).

- [ ] Remove the dev bypass in production: **unset `DRIFT_DEV_PLAN`** in Railway
      (otherwise no real subscription is created → reviewers can't see billing).
- [ ] Keep **`DRIFT_BILLING_TEST=true`** during review (Shopify reviewers expect
      *test* charges, not real money). Flip to `false` only after approval.
- [ ] Confirm the pricing screen (`/app/pricing`) creates a subscription and the
      confirmation/redirect flow completes.
- [ ] Listing pricing must exactly match what the Billing API charges ($49/mo +
      metered usage cap). Disclose usage-based charges clearly.
- [ ] Confirm the app **requires an active subscription** before use (the `/app`
      loader already redirects to `/app/pricing` when `getActivePlan` is null).

## 3. Mandatory privacy/compliance webhooks [BLOCKER]

Implemented + HMAC-verified in `app/routes/webhooks.compliance.tsx`.

- [ ] `customers/data_request` — we store no customer PII → documented no-op. ✅
- [ ] `customers/redact` — no customer PII → documented no-op. ✅
- [x] `shop/redact` — purges ALL shop-scoped data via `purgeShopData()`
      (ShopProfile, StoreReport, ContentPlan, BrainDoc, Job, UsageEvent, AppEvent,
      Session) + deletes the theme workspace. ✅ (`app/lib/shop-data.server.ts`)
- [ ] `app/uninstalled` — deletes session; consider also clearing shop data.
- [ ] All four are registered (`shopify.app.shophero.toml` lists them) and return 200.

## 4. Security & data handling [BLOCKER]

- [ ] Webhooks HMAC-verified via `authenticate.webhook` ✅
- [ ] Secrets only in env (never committed); `.env` gitignored ✅
- [ ] BYOK keys encrypted at rest (AES-256-GCM, `DRIFT_ENCRYPTION_KEY`) ✅
- [ ] Admin console (`/admin`) locked behind `ADMIN_PASSWORD` (timing-safe) ✅;
      consider IP allowlist — it exposes cross-shop data.
- [ ] Minimal scopes only: `write_products,write_themes,write_content` ✅
- [ ] TLS everywhere (Railway + Postgres `sslmode`) ✅
- [ ] Rotate production secrets before launch (`DRIFT_ENCRYPTION_KEY`,
      `ADMIN_PASSWORD`) — never reuse dev values.
- [ ] Agent safety for multi-tenant: review the Bash tool exposure (`DRIFT_ALLOW_BASH`)
      per SECURITY.md item 3.

## 5. Privacy policy, data & subprocessors [BLOCKER]

- [x] `/privacy` lists what data is accessed, why, retention, and deletion path. ✅
- [x] **Anthropic (Claude) disclosed as a subprocessor**, incl. "does not train on
      API data" + the no-customer-PII stance. ✅ (`app/routes/privacy.tsx`)
- [x] `/terms` accurate for the service + billing ($49/mo + included $15 + capped
      top-ups, cancel anytime, no guaranteed results). Reviewed — no change. ✅
- [x] `/contact` works (server-side → hello@shophero.io); no public email exposed ✅
- [ ] Privacy/Terms URLs entered in the Partner Dashboard listing.

## 6. App Store listing assets

> Copy drafted in `docs/listing-copy.md`. Reviewer notes in `docs/reviewer-instructions.md`.

- [x] App name + tagline (draft in docs/listing-copy.md).
- [ ] App icon (1200×1200, no text-heavy clutter).
- [ ] 3–6 screenshots (1600×900) of real flows: onboarding, editor + preview,
      optimize scorecard, revenue plan, activity/rollback.
- [ ] Optional but strong: a short demo video.
- [ ] Listing description, feature bullets, benefits.
- [ ] Categories + search terms.
- [ ] Support email + (optional) support URL/docs.
- [ ] Pricing details matching the Billing API.

## 7. Reviewer experience [BLOCKER]

- [x] **Test instructions** drafted in `docs/reviewer-instructions.md` (install,
      billing test mode, what to try, theme access during review, demo store).
- [ ] A **demo/test store** in good shape (products, a theme) the reviewer can use,
      or clear steps to set one up.
- [ ] If billing test mode is on, tell the reviewer charges are test charges.
- [ ] Make sure onboarding doesn't dead-end if the reviewer skips fields.

## 8. Submit

- [ ] App set to **public distribution** in the Partner Dashboard (enables Billing API).
- [ ] All URLs (app, redirect, privacy, terms) point to production (`app.shophero.io`).
- [ ] `shopify app deploy` run with the final config.
- [ ] Submit for review; monitor the Partner Dashboard for reviewer feedback.

---

## Known gaps to fix

1. ~~`shop/redact` full purge~~ — DONE (`purgeShopData`).
2. **Production env (Railway, your action)** — unset `DRIFT_DEV_PLAN`, set
   `DRIFT_BILLING_TEST=true`, rotate `DRIFT_ENCRYPTION_KEY` + `ADMIN_PASSWORD`
   for production. (sections 2, 4)
3. (Optional) `app/uninstalled` — keeps session-only delete by design; full
   erasure happens via `shop/redact` ~48h later (Shopify's intended pattern).

## Notes

- Theme writes require Shopify's exemption for public OAuth tokens; custom-app
  tokens (`DRIFT_THEME_TOKEN`) bridge pilots until granted. See SECURITY.md.
- Single Railway replica for now (in-process state) — fine for launch.
