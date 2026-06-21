/**
 * Live storefront audit via Google PageSpeed Insights (runs Lighthouse server-side).
 * Returns real Speed / SEO / Accessibility scores and a ranked, actionable issue
 * list for the Optimize tab.
 *
 * Set PAGESPEED_API_KEY in .env to raise the rate limit (works without one).
 * Note: PageSpeed needs a PUBLIC url — a password-protected dev storefront will
 * score the password page, not the theme. Real (public) stores audit correctly.
 */

export interface AuditScore {
  label: string;
  value: number;
  color: string;
}
export interface AuditIssue {
  area: string;
  impact: "high" | "med" | "low";
  title: string;
  desc: string;
  prompt: string;
}
export interface AuditResult {
  scores: AuditScore[];
  issues: AuditIssue[];
  auditedUrl: string;
  note?: string;
}

const CATS: { key: string; label: string }[] = [
  { key: "performance", label: "Speed" },
  { key: "seo", label: "SEO" },
  { key: "accessibility", label: "A11y" },
];

function scoreColor(v: number): string {
  return v >= 90 ? "#34c759" : v >= 50 ? "#ff9500" : "#ff3b30";
}

function clean(s: string): string {
  return (s || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links → text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runAudit(url: string): Promise<AuditResult> {
  const params = new URLSearchParams({ url, strategy: "mobile" });
  CATS.forEach((c) => params.append("category", c.key));
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set("key", key);

  let data: {
    lighthouseResult?: {
      categories?: Record<string, { score?: number; auditRefs?: { id: string; weight?: number }[] }>;
      audits?: Record<string, { title?: string; description?: string; score?: number | null }>;
    };
  };
  try {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
    );
    if (!res.ok) {
      return {
        scores: [],
        issues: [],
        auditedUrl: url,
        note: `Audit unavailable (PageSpeed HTTP ${res.status}). The storefront may be password-protected (dev stores) or unreachable.`,
      };
    }
    data = await res.json();
  } catch (err) {
    return {
      scores: [],
      issues: [],
      auditedUrl: url,
      note: `Audit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const lh = data.lighthouseResult ?? {};
  const cats = lh.categories ?? {};
  const audits = lh.audits ?? {};
  const pct = (s?: number) => Math.round((s ?? 0) * 100);

  const scores: AuditScore[] = CATS.map((c) => {
    const v = pct(cats[c.key]?.score);
    return { label: c.label, value: v, color: scoreColor(v) };
  });

  const issues: (AuditIssue & { weight: number })[] = [];
  for (const c of CATS) {
    const refs = cats[c.key]?.auditRefs ?? [];
    for (const ref of refs) {
      const a = audits[ref.id];
      if (!a || a.score == null || a.score >= 0.9) continue; // skip passing/informational
      const impact = a.score < 0.5 ? "high" : a.score < 0.85 ? "med" : "low";
      const desc = clean(a.description ?? "");
      issues.push({
        area: c.label,
        impact,
        title: clean(a.title ?? ref.id),
        desc: desc.slice(0, 180),
        prompt: `Fix this storefront issue found by a Lighthouse audit — "${clean(a.title ?? ref.id)}": ${desc} Apply safe theme changes and summarize what you did.`,
        weight: ref.weight ?? 0,
      });
    }
  }

  const rank = { high: 0, med: 1, low: 2 } as const;
  issues.sort((a, b) => rank[a.impact] - rank[b.impact] || b.weight - a.weight);

  return {
    scores,
    issues: issues.slice(0, 8).map(({ weight, ...rest }) => { void weight; return rest; }),
    auditedUrl: url,
  };
}
