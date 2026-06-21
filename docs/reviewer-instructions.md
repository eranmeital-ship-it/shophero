# ShopHero — instructions for the Shopify reviewer

Paste/adapt this into the "Testing instructions" / review-notes field at
submission. Goal: let the reviewer install, authenticate, see billing, and
exercise the core flow with zero guesswork.

---

## What ShopHero does
ShopHero is an AI assistant that builds and optimizes a merchant's storefront from
plain-English requests. It edits a **safe, unpublished copy** of the theme and
stages every change for the merchant's explicit approval before publishing.

## Test/demo store
- Demo store: `shophero-ehoqmlbg.myshopify.com` (published theme + sample products).
- (If the reviewer prefers their own dev store, see "Theme access during review".)

## How to install & authenticate
1. Install the app on a development store from the App Store listing / install link.
2. Approve the requested scopes: `write_products`, `write_themes`, `write_content`.
   (No orders or customer data are requested.)
3. The embedded app loads inside the store admin.

## Billing (test mode)
- ShopHero uses the Shopify Billing API. During review, billing runs in **test
  mode** — approving the subscription creates a **test charge only (no real
  money)**.
- On first load the app asks you to start the Managed AI plan ($49/mo + included
  usage). Approve it to proceed; it returns you to the app.

## First-run setup ("Getting your store ready")
- On first load, ShopHero makes a safe unpublished copy of the live theme. This
  one-time setup shows a "Getting your store ready…" screen for up to ~a minute,
  then opens the editor. (No action needed — it continues automatically.)

## What to try (core flow)
1. **Onboarding** — answer a couple of quick questions; ShopHero scans the store
   and builds a growth plan.
2. **Edit** — type a request (e.g. "rewrite my product descriptions" or "add a
   trust section to my product page"), or click a one-click tool. ShopHero
   generates the change and **stages it** — nothing is live yet.
3. **Preview & approve** — review the visual preview/diff, then Approve & Publish.
4. **Optimize** — open the Optimize tab to see the store-health scorecard; click a
   score to see the breakdown and one-tap fixes.
5. **Activity / rollback** — open Activity to see the change log and **revert** or
   **undo** any change in one click.

## Theme access during review (important)
ShopHero edits theme files, which on Shopify requires the theme-write exemption
(requested separately). For review:
- On the **provided demo store**, theme access is pre-configured, so the full
  edit → approve → publish flow works end-to-end.
- If installing on a different store before the exemption is granted, the app
  **degrades gracefully**: it shows a clear "theme access" screen with setup steps
  instead of erroring, while all non-theme features remain usable.
- We recommend testing on the demo store for the complete experience.

## Safety summary (for context)
- Edits happen on an **unpublished copy** of the theme; the live store is never
  changed without approval.
- **Every change is staged for approval** and is **reversible** (version history +
  one-click rollback).
- Mandatory webhooks (`app/uninstalled`, `shop/redact`, `customers/data_request`,
  `customers/redact`) are implemented and HMAC-verified; uninstall/redaction
  removes all stored data.

## Support
hello@shophero.io · https://shophero.io/contact
