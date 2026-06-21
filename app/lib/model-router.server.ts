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
 * Escalation ladder for a prompt. The agent loop tries each model in order,
 * moving up only when the previous one errors/stalls — but each escalation
 * RE-RUNS the whole task from scratch, so the ladder is a cost multiplier. To
 * keep costs sane we CAP it:
 *  - routine edits (start = cheap): cheap → smart only (never the priciest tier),
 *  - complex/creative tasks (start = smart): smart → max.
 * So the priciest tier is reserved for work that genuinely starts there, instead
 * of a routine edit quietly climbing to it on a couple of stumbles. Duplicate
 * tiers (when env vars collapse them) are removed.
 */
export function modelChain(prompt: string): string[] {
  const start = startTier(prompt);
  const chain = start === TIERS.cheap ? [TIERS.cheap, TIERS.smart] : [TIERS.smart, TIERS.max];
  return [...new Set(chain)];
}
