/**
 * Per-shop sliding-window rate limit for the expensive authenticated routes
 * (chat, AEO targets, plan decompose, content generation). Spend caps bound the
 * $ cost; this bounds request VOLUME so a tight client loop can't hammer the
 * model/web-search endpoints. In-memory and per-instance — which is correct here
 * because the app runs as a single instance (see DEPLOY.md).
 */
const hits = new Map<string, number[]>();

/** Returns true if the shop is OVER the limit (should be rejected). */
export function rateLimited(shop: string, max: number, windowMs: number): boolean {
  const key = shop || "unknown";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (hits.size > 10000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return recent.length > max;
}

/** Convenience: a 429 Response if over the limit, else null. */
export function rateLimitResponse(shop: string, max: number, windowMs: number): Response | null {
  if (!rateLimited(shop, max, windowMs)) return null;
  return Response.json({ error: "Too many requests — please slow down and try again in a moment." }, { status: 429 });
}
