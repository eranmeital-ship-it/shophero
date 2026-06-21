# Theme-write exemption request — ShopHero

Ready-to-paste justification for Shopify's "modify theme files" exemption request.
Adapt field-by-field to the current form; the narrative below is the core.

---

## App name
ShopHero

## What the app does (1–2 sentences)
ShopHero is an AI growth assistant for Shopify merchants. Merchants describe what
they want in plain English ("rewrite my product descriptions", "make my homepage
hero convert better", "speed up my store") and ShopHero builds the change directly
in their theme — then stages it for approval before anything goes live.

## Why theme-file write access is required
ShopHero's core value is building and improving the storefront itself: product-page
layouts, homepage sections, content blocks, performance fixes, on-page SEO, and
conversion-focused redesigns. These require creating and editing theme files
(`templates`, `sections`, `snippets`, `layout`, `assets` — Liquid/JSON/CSS/JS).

Theme app extensions / app blocks alone cannot deliver this: they only let a
merchant place a fixed widget into predefined slots. ShopHero instead reasons over
the merchant's *existing* theme and makes targeted edits to their actual files —
the same work a Shopify developer or page-builder app performs. Writing theme files
via `themeFilesUpsert` is therefore essential to the product.

## How merchants are protected (safety model)
ShopHero is built approval-first and fully reversible — the live storefront is
never edited directly:

1. **Works on a duplicated, unpublished theme.** On setup, ShopHero creates an
   unpublished working copy of the live theme and makes all edits there. The
   published theme is never modified by the agent.
2. **Nothing goes live without explicit approval.** Every change is staged and
   shown to the merchant (with a visual preview and a diff). The merchant must
   click Approve & Publish for any change to reach the live store.
3. **Full version history + one-click rollback.** Every applied change is snapshot
   so the merchant can restore any previous state, or undo a single change, at any
   time.
4. **Auto-backup before edits.** The working copy is duplicated/committed before
   changes, so prior states are always recoverable.
5. **Least-privilege scopes.** ShopHero requests only `write_themes`,
   `write_products`, and `write_content`. It does not request orders, customers,
   or buyer data, and stores no customer PII.

## What changes ShopHero makes
- Product-page / template improvements (layout, trust, CTA, copy)
- Homepage and section edits (hero, content blocks, navigation)
- Performance fixes (image handling, deferring scripts, removing dead app code)
- On-page SEO (titles, metadata, structured content)
- New content (pages, blog articles, FAQs) and collection structure

All edits are scoped to the merchant's request, staged for approval, and reversible.

## Technical implementation
- Theme writes use the Admin GraphQL `themeFilesUpsert` mutation.
- Edits target an unpublished "working copy" theme, not the live theme.
- Asset reads are rate-limited to respect Shopify's API limits.
- Webhooks (`app/uninstalled`, `shop/redact`, `customers/*`) are HMAC-verified and
  remove all stored data on uninstall/redaction.

## Distribution
Public app (Shopify App Store). Billing via the Shopify Billing API.

## Summary
ShopHero needs theme-file write access to do its core job — improving the
storefront — but does so on a duplicated theme, with merchant approval on every
change and one-click rollback, requesting only the minimum scopes. This mirrors
the established, merchant-safe pattern used by approved theme-editing and
page-builder apps.
