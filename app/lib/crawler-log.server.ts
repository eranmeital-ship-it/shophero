import db from "../db.server";

/**
 * Detect known AI crawlers by User-Agent and log real fetches of the hosted
 * agent-ready files. This is the honest scorecard data — "GPTBot fetched your
 * feed 47× this month" comes from these rows, not a guess.
 */
const BOTS: [RegExp, string][] = [
  [/GPTBot/i, "GPTBot"],
  [/OAI-SearchBot/i, "OAI-SearchBot"],
  [/ChatGPT-User/i, "ChatGPT-User"],
  [/ClaudeBot/i, "ClaudeBot"],
  [/Claude-Web/i, "Claude-Web"],
  [/anthropic-ai/i, "anthropic-ai"],
  [/PerplexityBot/i, "PerplexityBot"],
  [/Perplexity-User/i, "Perplexity-User"],
  [/Google-Extended/i, "Google-Extended"],
  [/Googlebot/i, "Googlebot"],
  [/Applebot-Extended/i, "Applebot-Extended"],
  [/Applebot/i, "Applebot"],
  [/Bingbot|BingPreview/i, "Bingbot"],
  [/Amazonbot/i, "Amazonbot"],
  [/Bytespider/i, "Bytespider"],
  [/meta-externalagent|FacebookBot/i, "Meta-AI"],
  [/CCBot/i, "CCBot"],
  [/cohere-ai/i, "cohere-ai"],
  [/DuckAssistBot/i, "DuckAssistBot"],
  [/YouBot/i, "YouBot"],
];

export function identifyBot(userAgent: string | null): string | null {
  if (!userAgent) return null;
  for (const [re, name] of BOTS) if (re.test(userAgent)) return name;
  return null;
}

/** Fire-and-forget: log an AI-crawler fetch (no-op for human/other traffic). */
export function logCrawlerHit(request: Request, shop: string, path: "llms.txt" | "feed.json"): void {
  const bot = identifyBot(request.headers.get("user-agent"));
  if (!bot || !shop) return;
  void db.crawlerHit.create({ data: { shop, bot, path } }).catch(() => {});
}
