# ShopHero Speed Playbook

> Consulted for storefront-speed tasks. Speed is a **sales** lever, not just tech:
> slow stores bounce (especially mobile/3G/older devices), lose paid traffic,
> erode trust, and rank lower. ~90% of wins are non-code decisions.
> **Always back up (duplicate) the theme before code edits, and never lazy-load or
> defer anything above the fold.**

## Measure first — Core Web Vitals (Shopify store speed report + Lighthouse / PageSpeed Insights)
- **LCP** (Largest Contentful Paint — how fast the main banner/image loads): good < 2.5s · needs work 2.5–4s · poor > 4s.
- **INP** (Interaction to Next Paint — responsiveness to clicks/taps): good < 200ms · 200–500ms needs work · > 500ms poor.
- **CLS** (Cumulative Layout Shift — elements jumping as it loads): good < 0.1 · 0.1–0.25 needs work · > 0.25 poor.
These are real-user metrics. Shopify's report also has a **timeline** that ties changes (app added/removed, etc.) to metric shifts — use it to confirm a change helped.

## Fix by metric (fastest triage)
- **LCP too high →** compress + resize the hero image (< 500KB, never > 1MB), **preload** the hero, drop large sliders/video headers, keep the above-fold layout minimal.
- **INP too high →** remove/replace heavy interactive apps (chat widgets, reviews, pop-ups), clean old/unused code, avoid click-blocking animations, defer non-essential JS.
- **CLS too high →** set explicit **width/height** on every image, stick to 1–2 fonts with `font-display: swap`, and don't let apps load fonts after paint.

## The framework
1. **Cut apps (biggest lever).** Every app fetches assets from third-party servers and often blocks the main load. Remove any app not clearly driving sales/UX; **replace apps with native Shopify settings** where possible. Keep only must-haves.
2. **Remove residual code.** Uninstalled apps leave snippets behind. Search `theme.liquid` (and all theme files) for the app's name + old tracking pixels/unused scripts/fonts; comment out or delete. (Tools: code-editor search, or the "Shopify theme file search" extension.)
3. **Images — the silent killer.** Use **JPEG** (PNG only for transparency); **never GIF** → use an MP4 in an HTML `<video>`. **Resize to actual display size** (e.g. a 1200–2000px banner, not 3000px+) AND **compress** (< 500KB, never > 1MB) before upload (tinyjpg / iloveimg / compresspng / photopea); a bulk-compress app can handle existing images.
4. **Lazy-load below the fold, preload above it.** Add `loading="lazy"` to offscreen images and `preload="none"` to offscreen videos. **Never** lazy-load the hero/LCP image — instead `<link rel="preload">` it. Set image `width`/`height` to prevent CLS.
5. **Defer / async scripts.** In `theme.liquid`, give non-essential scripts **`defer`** (loads after the document — best) or **`async`** (loads alongside). Test functionality after — some scripts break with defer/async. **Exception: do NOT defer tracking pixels** (it corrupts the data). Avoid jQuery; if a script is required, host it from the **Shopify CDN (assets folder)**, not a third-party CDN link.
6. **Defer non-critical CSS** with `media="print" onload="this.media='all'"` — but only for styles of below-fold elements (deferring above-fold CSS causes CLS/LCP).
7. **Lazy-load apps on interaction (advanced).** Load the store first, then load app scripts on first scroll/click. Keep only needed **app embeds** enabled in the customizer.
8. **Fonts.** 1–2 families (heading + body), ≤ ~3 variations; prefer the theme's / Google / Adobe fonts; add `font-display: swap` to every `@font-face`; match the fallback size to avoid CLS; avoid font apps.
9. **Theme.** Use a fast **OS 2.0** theme from the Shopify theme store (Dawn / Horizon are great defaults); avoid bloated premium themes full of unused features/effects; test a theme's demo on PageSpeed Insights before buying.
10. **Simplify the homepage.** Minimal above-fold; a lean layout (banner → value/trust → bestsellers → collections → about → testimonials). Skip sliders, autoplay video and Instagram feeds unless they're a must. Avoid heavy animations/transitions (they load effect libraries before paint → hurts LCP).
11. **Remove unused custom sections** (old announcement bars, comparison tables, before/after) — their code still loads.
12. **Minify** theme code (advanced; back up first), especially around custom sections.

## What ShopHero does vs advises
- **Directly (theme code, staged for approval):** add `loading="lazy"` to offscreen images + `preload` the hero; set image width/height (CLS); `defer`/`async` non-essential scripts (carefully — never tracking pixels); defer non-critical CSS; add `font-display: swap` + trim font variations; remove residual/leftover code and unused custom sections; serve scripts from the assets folder/CDN; replace GIFs with MP4; simplify homepage sections.
- **Advise (merchant action):** uninstall unused apps / replace with native settings; compress + resize images before upload (or a bulk-compress app); switch to a fast OS 2.0 theme if the current one is bloated; review the store speed report.

## Guardrails
Duplicate the theme before editing. Never lazy-load/defer above-fold assets or tracking pixels. Verify each script still works after defer/async. Confirm wins in the speed-report timeline / Lighthouse.

## The business case (hard numbers — cite these to merchants)
Speed is a revenue lever, backed by public data:
- **A 0.5s improvement in site speed can increase conversion.** Half a second is the difference between a sale and a bounce.
- **Bounce rate climbs fast with load time** (Google CWV data): +32% from 1s→3s, **+90% from 1s→5s**, +106% 1s→6s, **+123% 1s→10s**. Semrush: bounce ≈ 35% at 1.5s, 41% at 2s, and roughly triples past 3s.
- **Speed is a Google ranking signal** (since 2010): slower site → worse rankings → less traffic → fewer chances to convert. Faster site = more traffic AND fewer bounces AND higher conversion.
- **Benchmarks to score against:** server response (TTFB) "good" ≈ **0.51s** (Shopify avg; other platforms avg 1.4s, slowest ~2.0s). First Contentful Paint "site speed" — a typical fast store renders around **1.2s**. Use these as the bar: under ~1.2s FCP and ~0.5s TTFB is excellent; flag anything materially slower.

## What the merchant actually controls (focus here)
Shopify already handles a lot of speed for free — global CDN, consolidated hosting (static assets on your storefront domain, not a separate cdn host), section-level lazy-loading, and platform-wide gains (~35% faster YoY). So the agent should NOT chase infra; the remaining, merchant-controlled wins are: **image weight/sizing, number of apps & third-party scripts, render-blocking JS/CSS, theme bloat, and unused sections/code** (everything in the framework above). That's where ShopHero moves the needle.
