/**
 * Anthropic API key pool with failover (managed plan).
 *
 * Configure backups in .env:
 *   ANTHROPIC_API_KEY=sk-ant-...           # primary
 *   ANTHROPIC_API_KEYS=sk-ant-...,sk-ant-... # comma-separated backups
 *
 * When a key fails with a credit/billing, rate-limit, or auth error, it's put on
 * a cooldown and the turn retries on the next key. State is in-process (resets on
 * restart) — fine for resilience; move to a store if you need cross-instance.
 */

const COOLDOWN_MS: Record<"credit" | "auth" | "rate", number> = {
  credit: 60 * 60 * 1000, // out of credit / billing — back off an hour
  auth: 24 * 60 * 60 * 1000, // bad/revoked key — effectively park it
  rate: 60 * 1000, // rate-limited — short cool-off
};

const cooldownUntil = new Map<string, number>();

/** All configured keys (primary first), de-duplicated. */
export function poolKeys(): string[] {
  const raw = [process.env.ANTHROPIC_API_KEY, ...(process.env.ANTHROPIC_API_KEYS ?? "").split(",")];
  const cleaned = raw.map((k) => k?.trim()).filter((k): k is string => !!k);
  return [...new Set(cleaned)];
}

/** Keys ordered so available (not-cooled) ones come first. */
export function orderedKeys(): string[] {
  const now = Date.now();
  const coolUntil = (k: string) => {
    const u = cooldownUntil.get(k) ?? 0;
    return u <= now ? 0 : u;
  };
  return poolKeys().slice().sort((a, b) => coolUntil(a) - coolUntil(b));
}

export function markFailed(key: string, kind: "credit" | "auth" | "rate"): void {
  cooldownUntil.set(key, Date.now() + COOLDOWN_MS[kind]);
}

export function markOk(key: string): void {
  cooldownUntil.delete(key);
}

/** Snapshot of the key pool for the admin console (keys masked). */
export function keyHealth(): { id: string; status: "ok" | "cooldown"; until: string | null }[] {
  const now = Date.now();
  return poolKeys().map((k) => {
    const u = cooldownUntil.get(k) ?? 0;
    const cooling = u > now;
    return { id: `…${k.slice(-6)}`, status: cooling ? "cooldown" : "ok", until: cooling ? new Date(u).toISOString() : null };
  });
}

/** Classify an error as a key-level failure that warrants failover, or null. */
export function keyFailureKind(err: unknown): "credit" | "auth" | "rate" | null {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (m.includes("credit balance") || m.includes("insufficient") || m.includes("billing") || m.includes("payment") || m.includes("quota"))
    return "credit";
  if (m.includes("invalid x-api-key") || m.includes("authentication_error") || m.includes("invalid api key") || m.includes(" 401"))
    return "auth";
  if (m.includes("rate_limit") || m.includes("rate limit") || m.includes(" 429") || m.includes("overloaded") || m.includes(" 529"))
    return "rate";
  return null;
}
