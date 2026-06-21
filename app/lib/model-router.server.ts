/**
 * Model routing + escalation.
 *
 * Philosophy: default to the CHEAPEST model — it handles ~99% of theme edits in
 * a pro manner — and only reach for a stronger model when the task looks hard
 * (bulk/creative/long-form) or when a cheaper attempt actually fails. The
 * agent loop uses `modelChain()` as an escalation ladder: try the first model,
 * fall back up the chain only on failure.
 *
 * Tiers are env-overridable. DRIFT_MODEL stays meaningful as the "cheap" tier.
 */
export const TIERS = {
  cheap: process.env.DRIFT_MODEL ?? "claude-haiku-4-5",
  smart: process.env.DRIFT_MODEL_SMART ?? "claude-sonnet-4-6",
  max: process.env.DRIFT_MODEL_MAX ?? "claude-opus-4-8",
};

// Tasks that usually warrant starting on the smart tier: content generation,
// bulk operations, design work, large refactors. Plain theme edits don't match.
const CREATIVE = /\b(write|rewrite|draft|compose|generate|design|redesign|brand|copywrit|landing page|campaign|blog|article|product description)\b/i;
const BULK = /\b\d+\s+(posts?|pages?|products?|articles?|sections?|blogs?|variations?|collections?)\b/i;

/** Pick the starting tier for a prompt. Most edits → cheap. */
function startTier(prompt: string): string {
  const p = prompt.trim();
  if (BULK.test(p)) return TIERS.smart; // "create 10 posts…"
  if (CREATIVE.test(p) && p.length > 80) return TIERS.smart; // real creative/long-form ask
  if (p.length > 600) return TIERS.smart; // very detailed/complex brief
  return TIERS.cheap; // the 99% case
}

/**
 * Escalation ladder for a prompt: [start, …stronger tiers]. The agent loop tries
 * each in order, moving up only when the previous model errors/stalls. Duplicate
 * tiers (when env vars collapse them to the same model) are removed.
 */
export function modelChain(prompt: string): string[] {
  const ladder = [TIERS.cheap, TIERS.smart, TIERS.max];
  const start = startTier(prompt);
  const from = ladder.indexOf(start);
  const chain = from === -1 ? [start] : ladder.slice(from);
  return [...new Set(chain)];
}
