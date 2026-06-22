/**
 * Public "AI Visibility Check" — a free, no-auth lead magnet.
 *
 * Given any storefront URL we fetch the public HTML (plus robots.txt, sitemap.xml
 * and llms.txt) and score how well AI shopping agents — ChatGPT, Claude, Gemini,
 * Perplexity — can read, understand and recommend the store. 100% deterministic:
 * no Shopify auth, no Claude API call, so it's instant and costs nothing to run.
 *
 * The checks mirror the in-app AEO scorecard but work from public signals only.
 *
 * SECURITY: this is an UNAUTHENTICATED, public endpoint that fetches a
 * user-supplied URL — a classic SSRF surface. Every fetch resolves the host to
 * its IP and refuses private/loopback/link-local/metadata ranges, follows
 * redirects MANUALLY (re-validating each hop), and is byte/time-capped.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

/** Reject loopback, private, link-local, CGNAT and cloud-metadata addresses. */
function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.some((n) => Number.isNaN(n))) return true;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local + 169.254.169.254 metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP → block
}

/** Resolve a host and return a public IP, or null if it's an IP we must refuse. */
async function resolvePublicHost(hostname: string): Promise<string | null> {
  if (net.isIP(hostname)) return isPrivateIp(hostname) ? null : hostname;
  try {
    const results = await lookup(hostname, { all: true });
    if (!results.length) return null;
    for (const r of results) if (isPrivateIp(r.address)) return null; // any private answer → block
    return results[0].address;
  } catch {
    return null;
  }
}

export type CheckStatus = "pass" | "warn" | "fail";
export interface VisibilityCheck {
  key: string;
  label: string;
  weight: number;
  earned: number;
  status: CheckStatus;
  detail: string; // what we found on this store
  why: string; // why an AI agent needs it
}
export interface VisibilityReport {
  url: string;
  host: string;
  score: number; // 0–100
  status: CheckStatus;
  passCount: number;
  total: number;
  checks: VisibilityCheck[];
  topGaps: string[]; // labels of the biggest misses, worst first
}

const UA =
  "Mozilla/5.0 (compatible; ShopHeroBot/1.0; +https://shophero.io/ai-check)";
const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 1_500_000;

// The AI crawlers that matter for AEO. If robots.txt blocks these, the store is
// literally unreadable to the assistant a shopper is asking.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
];

function normalizeUrl(raw: string): { url: string; origin: string; host: string } | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes(".")) return null;
    return { url: u.toString(), origin: u.origin, host: u.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

async function fetchText(url: string, cap = MAX_HTML_BYTES): Promise<{ ok: boolean; status: number; body: string }> {
  let current = url;
  // Manual redirect handling so every hop's resolved IP is re-validated (a public
  // host that 302s to 169.254.169.254 must NOT be followed).
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return { ok: false, status: 0, body: "" };
    }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, status: 0, body: "" };
    if (!(await resolvePublicHost(u.hostname))) return { ok: false, status: 0, body: "" }; // private/blocked

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, status: res.status, body: "" };
        current = new URL(loc, current).toString();
        continue; // re-validate the redirect target on the next iteration
      }
      const reader = res.body?.getReader();
      if (!reader) {
        const body = await res.text();
        return { ok: res.ok, status: res.status, body: body.slice(0, cap) };
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < cap) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
        }
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      const body = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks)).slice(0, cap);
      return { ok: res.ok, status: res.status, body };
    } catch {
      return { ok: false, status: 0, body: "" };
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, status: 0, body: "" }; // too many redirects
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// --- tiny HTML helpers (regex-based; good enough for head/meta signals) ---
function head(html: string): string {
  const m = html.match(/<head[\s\S]*?<\/head>/i);
  return m ? m[0] : html.slice(0, 60_000);
}
function metaContent(html: string, attr: "name" | "property", value: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/i)?.[1]?.trim() ?? "";
}
function ldJsonTypes(html: string): Set<string> {
  const types = new Set<string>();
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const collect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") types.add(t);
    if (Array.isArray(t)) for (const x of t) if (typeof x === "string") types.add(x);
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === "object") collect(v);
    }
  };
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      collect(JSON.parse(raw));
    } catch {
      // Loose detection if the JSON is malformed — at least catch the @type strings.
      for (const t of raw.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) types.add(t[1]);
    }
  }
  return types;
}

function mk(o: { key: string; label: string; weight: number; frac: number; pass: string; gap: string; why: string }): VisibilityCheck {
  const frac = Math.max(0, Math.min(1, o.frac));
  const status: CheckStatus = frac >= 0.999 ? "pass" : frac <= 0.5 ? "fail" : "warn";
  return {
    key: o.key,
    label: o.label,
    weight: o.weight,
    earned: Math.round(o.weight * frac),
    status,
    detail: status === "pass" ? o.pass : o.gap,
    why: o.why,
  };
}

function clamp(n: number): number {
  return Math.max(2, Math.min(100, Math.round(n)));
}
function scoreStatus(v: number): CheckStatus {
  return v >= 75 ? "pass" : v >= 50 ? "warn" : "fail";
}

/** robots.txt analysis — is each AI crawler allowed to read the store? */
function analyzeRobots(robots: string | null, host: string): { frac: number; pass: string; gap: string } {
  if (robots == null) {
    return {
      frac: 0.7,
      pass: "",
      gap: `No robots.txt found on ${host} — crawlers are allowed by default, but you're not explicitly welcoming AI agents.`,
    };
  }
  const txt = robots.toLowerCase();
  // Find groups that disallow "/" for our AI bots, or a global "User-agent: *" block.
  const blocked: string[] = [];
  const groups = txt.split(/(?=user-agent:)/i);
  const blocksRoot = (group: string) =>
    /disallow:\s*\/\s*($|\n)/i.test(group) || /disallow:\s*\/(\s|$)/i.test(group.split("\n").map((l) => l.trim()).join("\n"));
  for (const bot of AI_BOTS) {
    const lb = bot.toLowerCase();
    const g = groups.find((grp) => grp.includes(`user-agent: ${lb}`) || grp.includes(`user-agent:${lb}`));
    if (g && blocksRoot(g)) blocked.push(bot);
  }
  // Global wildcard block also stops most AI crawlers.
  const wildcard = groups.find((grp) => /user-agent:\s*\*/i.test(grp));
  const wildcardBlocks = wildcard ? blocksRoot(wildcard) : false;
  if (wildcardBlocks) blocked.push("* (all crawlers)");

  if (blocked.length) {
    return {
      frac: 0,
      pass: "",
      gap: `robots.txt blocks ${blocked.slice(0, 4).join(", ")}${blocked.length > 4 ? "…" : ""} — these AI agents can't read your store at all.`,
    };
  }
  return { frac: 1, pass: "robots.txt allows AI crawlers — agents can read your store.", gap: "" };
}

export async function runVisibilityCheck(rawUrl: string): Promise<{ ok: true; report: VisibilityReport } | { ok: false; error: string }> {
  const norm = normalizeUrl(rawUrl);
  if (!norm) return { ok: false, error: "That doesn't look like a valid store URL. Try something like yourstore.com." };

  const [page, robotsRes, sitemapRes, llmsRes] = await Promise.all([
    fetchText(norm.url),
    fetchText(`${norm.origin}/robots.txt`, 200_000),
    fetchText(`${norm.origin}/sitemap.xml`, 50_000),
    fetchText(`${norm.origin}/llms.txt`, 50_000),
  ]);

  if (!page.ok || !page.body) {
    return { ok: false, error: `We couldn't reach ${norm.host}. Make sure the store is public and the URL is correct.` };
  }

  const html = page.body;
  const h = head(html);

  // Product schema usually lives on product pages, not the homepage. On Shopify
  // every product is /products/<handle>, so sample the first one we can find for a
  // fairer structured-data read.
  let productHtml = "";
  const prodHref = html.match(/href=["']([^"']*\/products\/[a-z0-9][^"'#?]*)/i)?.[1];
  if (prodHref && !/\/products\/?$/.test(prodHref)) {
    let pUrl = prodHref;
    if (pUrl.startsWith("//")) pUrl = `https:${pUrl}`;
    else if (pUrl.startsWith("/")) pUrl = `${norm.origin}${pUrl}`;
    if (pUrl.startsWith("http")) {
      const pr = await fetchText(pUrl);
      if (pr.ok) productHtml = pr.body;
    }
  }

  // --- head/meta signals ---
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const metaDesc = metaContent(h, "name", "description") ?? "";
  const ogTitle = metaContent(h, "property", "og:title");
  const ogDesc = metaContent(h, "property", "og:description");
  const ogImage = metaContent(h, "property", "og:image");
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  const viewport = metaContent(h, "name", "viewport");
  const robotsMeta = (metaContent(h, "name", "robots") ?? "").toLowerCase();
  const noindex = robotsMeta.includes("noindex");

  const types = ldJsonTypes(html);
  const prodTypes = productHtml ? ldJsonTypes(productHtml) : new Set<string>();
  const allTypes = new Set([...types, ...prodTypes]);
  const hasProductSchema = allTypes.has("Product") || allTypes.has("Offer") || allTypes.has("AggregateOffer") || allTypes.has("ProductGroup");
  const hasBrandSchema = allTypes.has("Organization") || allTypes.has("WebSite") || allTypes.has("Store") || allTypes.has("LocalBusiness");
  const hasAnySchema = allTypes.size > 0;

  const h1s = html.match(/<h1[\s\S]*?<\/h1>/gi) ?? [];

  // image alt ratio (cap the sample so big pages stay fast; prefer product page if found)
  const imgs = ((productHtml || html).match(/<img\b[^>]*>/gi) ?? []).slice(0, 60);
  const withAlt = imgs.filter((t) => /\salt=["'][^"']+["']/i.test(t)).length;
  const altRatio = imgs.length ? withAlt / imgs.length : 1;

  const sitemapOk = sitemapRes.ok && /<urlset|<sitemapindex/i.test(sitemapRes.body);
  const sitemapInRobots = /sitemap:/i.test(robotsRes.body || "");
  const hasLlms = llmsRes.ok && llmsRes.body.trim().length > 20;

  const robots = analyzeRobots(robotsRes.ok || robotsRes.status === 404 ? (robotsRes.ok ? robotsRes.body : null) : null, norm.host);

  const checks: VisibilityCheck[] = [
    mk({
      key: "ai-crawlers", label: "AI crawlers allowed", weight: 18, frac: noindex ? 0 : robots.frac,
      pass: robots.pass || "Agents are free to read your store.",
      gap: noindex ? "This page sets meta robots=noindex — you're asking search and AI to ignore it." : robots.gap,
      why: "If robots.txt (or a noindex tag) blocks AI bots, assistants literally cannot read your store — you're invisible before any other signal matters.",
    }),
    mk({
      key: "product-schema", label: "Structured product data", weight: 18, frac: hasProductSchema ? 1 : hasAnySchema ? 0.5 : 0,
      pass: "Product structured data (JSON-LD) detected — agents can read prices, specs and availability.",
      gap: hasAnySchema ? "Some structured data exists, but no Product/Offer schema — agents can't reliably read prices or specs." : "No JSON-LD structured data — agents have to guess your products from raw HTML.",
      why: "Product schema is how an AI reliably knows what you sell, the price, and whether it's in stock. It's the single biggest AEO signal.",
    }),
    mk({
      key: "title", label: "Descriptive page title", weight: 10, frac: title.length >= 15 ? 1 : title ? 0.5 : 0,
      pass: `Title set: “${title.slice(0, 60)}${title.length > 60 ? "…" : ""}”.`,
      gap: title ? `Title is very short (“${title}”) — add what you sell and your brand.` : "No <title> tag — agents have no headline to identify the store.",
      why: "The title is the primary label an agent uses to understand and name your store and products.",
    }),
    mk({
      key: "meta-desc", label: "Meta description", weight: 10, frac: metaDesc.length >= 50 ? 1 : metaDesc ? 0.5 : 0,
      pass: "A meta description is set — agents have a concise summary to quote.",
      gap: metaDesc ? "Meta description is thin — expand it to ~120–155 chars." : "No meta description — agents have no ready summary of your store.",
      why: "The meta description is the short, machine-readable summary agents quote when they recommend you.",
    }),
    mk({
      key: "brand-schema", label: "Organization / brand schema", weight: 8, frac: hasBrandSchema ? 1 : 0,
      pass: "Organization/WebSite schema detected — agents understand your brand identity.",
      gap: "No Organization or WebSite schema — agents can't confidently attribute products to your brand.",
      why: "Brand schema tells agents who you are, so they can attribute reviews, products and trust to the right store.",
    }),
    mk({
      key: "og", label: "Social / Open Graph tags", weight: 8, frac: ogCount >= 3 ? 1 : ogCount > 0 ? 0.5 : 0,
      pass: "Open Graph tags present — your store renders richly when shared or cited.",
      gap: ogCount > 0 ? "Only some Open Graph tags are set — add og:title, og:description and og:image." : "No Open Graph tags — links to your store look bare when shared or referenced.",
      why: "Open Graph data gives agents and social platforms a clean title, summary and image to represent your store.",
    }),
    mk({
      key: "alt", label: "Image alt text", weight: 8, frac: altRatio,
      pass: "Images carry alt text — agents can read what your photos show.",
      gap: `${Math.round((1 - altRatio) * 100)}% of sampled images have no alt text — agents can't tell what they show.`,
      why: "Alt text is how multimodal AI and image search understand your product photos and match them to shopper queries.",
    }),
    mk({
      key: "sitemap", label: "XML sitemap", weight: 6, frac: sitemapOk || sitemapInRobots ? 1 : 0,
      pass: "An XML sitemap is published — crawlers can discover every page.",
      gap: "No reachable sitemap.xml — crawlers may miss pages and never index your full catalog.",
      why: "A sitemap helps crawlers and AI agents find every product and page instead of stumbling through links.",
    }),
    mk({
      key: "h1", label: "Clear page heading (H1)", weight: 6, frac: h1s.length === 1 ? 1 : h1s.length > 1 ? 0.5 : 0,
      pass: "A single, clear H1 anchors the page.",
      gap: h1s.length > 1 ? `Found ${h1s.length} H1 tags — multiple H1s muddy what the page is about.` : "No H1 heading — agents have no clear statement of what this page is.",
      why: "A single H1 gives agents an unambiguous statement of what the page is about.",
    }),
    mk({
      key: "viewport", label: "Mobile-ready", weight: 4, frac: viewport ? 1 : 0,
      pass: "A responsive viewport is set — the store is mobile-ready.",
      gap: "No viewport meta tag — the store may not be mobile-friendly, which agents and Google penalize.",
      why: "Most shopping (and agent traffic) is mobile; a missing viewport signals an outdated, lower-ranked store.",
    }),
    mk({
      key: "llms", label: "llms.txt guidance file", weight: 4, frac: hasLlms ? 1 : 0,
      pass: "An llms.txt file is published — you're explicitly guiding AI agents. Ahead of the curve. 🎉",
      gap: "No llms.txt — the emerging standard for telling AI agents what your store is and what to recommend.",
      why: "llms.txt is the new robots.txt for AI: a plain-language guide that tells assistants exactly how to represent you.",
    }),
  ];

  const score = clamp(checks.reduce((a, c) => a + c.earned, 0));
  const passCount = checks.filter((c) => c.status === "pass").length;
  const topGaps = checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((c) => c.label);

  return {
    ok: true,
    report: {
      url: norm.url,
      host: norm.host,
      score,
      status: scoreStatus(score),
      passCount,
      total: checks.length,
      checks: checks.sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === "fail" ? -1 : b.status === "fail" ? 1 : a.status === "warn" ? -1 : 1)),
      topGaps,
    },
  };
}
