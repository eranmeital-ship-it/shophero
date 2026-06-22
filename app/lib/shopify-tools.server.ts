import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * In-process MCP server exposing the Shopify Admin GraphQL API to the agent, so
 * it can manage store resources beyond theme files (products, collections,
 * pages, blogs/articles, discounts, navigation, metafields, ...).
 *
 * SAFETY GATE: Admin mutations write to the LIVE store immediately and are not
 * reversible. So by default mutations are NOT executed — they're recorded as
 * "proposed" and the merchant approves them in the UI, which re-runs the turn
 * with `allowMutations: true`. QUERIES always run (reads are safe), so the agent
 * can still explore and plan in propose mode. Every executed mutation is logged.
 *
 * SCOPES: uses the merchant's OAuth token — limited to the app's granted scopes.
 */
export const SHOPIFY_TOOL_NAME = "mcp__shopify__graphql";

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2025-10";

export interface AdminCtx {
  shop: string;
  accessToken: string;
}

export interface Deliverable {
  type: string; // "article" | "page" | "product" | "collection" | "blog"
  title?: string;
  adminUrl: string;
  storeUrl?: string;
}

export interface MutationGate {
  /** When false, mutations are recorded (not executed) for merchant approval. */
  allowMutations: boolean;
  /** Called with each blocked mutation so the app can surface it for approval. */
  onProposed: (m: { query: string; variables?: Record<string, unknown> }) => void;
  /** Called with each store resource an executed mutation created/updated, so the app can link to it. */
  onDelivered?: (d: Deliverable) => void;
}

// gid type → admin section + storefront path builder.
const RESOURCE_MAP: Record<string, { admin: string; store?: (handle: string, blogHandle?: string) => string }> = {
  Product: { admin: "products", store: (h) => `/products/${h}` },
  Collection: { admin: "collections", store: (h) => `/collections/${h}` },
  Page: { admin: "content/pages", store: (h) => `/pages/${h}` },
  Article: { admin: "content/articles", store: (h, blog) => (blog ? `/blogs/${blog}/${h}` : "") },
  Blog: { admin: "content/blogs", store: (h) => `/blogs/${h}` },
};

/** Walk a mutation's response for created/updated resources and emit view links. */
function collectDeliverables(ctx: AdminCtx, responseText: string, onDelivered: (d: Deliverable) => void): void {
  let json: { data?: unknown };
  try {
    json = JSON.parse(responseText) as { data?: unknown };
  } catch {
    return;
  }
  if (!json.data) return;
  const storeHandle = ctx.shop.replace(/\.myshopify\.com$/, "");
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const obj = node as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : undefined;
    const m = id?.match(/^gid:\/\/shopify\/(Product|Collection|Page|Article|Blog)\/(\d+)/);
    if (m && id && !seen.has(id)) {
      seen.add(id);
      const [, type, numId] = m;
      const meta = RESOURCE_MAP[type];
      const adminUrl = `https://admin.shopify.com/store/${storeHandle}/${meta.admin}/${numId}`;
      let storeUrl: string | undefined =
        typeof obj.onlineStoreUrl === "string" ? obj.onlineStoreUrl
        : typeof obj.onlineStorePreviewUrl === "string" ? obj.onlineStorePreviewUrl
        : undefined;
      if (!storeUrl && typeof obj.handle === "string" && meta.store) {
        const blog = obj.blog as { handle?: string } | undefined;
        const blogHandle = type === "Article" && typeof blog?.handle === "string" ? blog.handle : undefined;
        const path = meta.store(obj.handle, blogHandle);
        if (path) storeUrl = `https://${ctx.shop}${path}`;
      }
      onDelivered({ type: type.toLowerCase(), title: typeof obj.title === "string" ? obj.title : undefined, adminUrl, storeUrl });
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(json.data);
}

/**
 * Replay merchant-APPROVED mutations exactly as the agent proposed them — the
 * server-side execution path for the approval gate. Only runs documents that are
 * actually mutations (defence in depth), against the merchant's own token.
 */
export async function executeApprovedMutations(
  ctx: AdminCtx,
  mutations: { query: string; variables?: Record<string, unknown> }[],
): Promise<{ applied: number; failed: number; deliverables: Deliverable[]; errors: string[] }> {
  let applied = 0;
  let failed = 0;
  const deliverables: Deliverable[] = [];
  const errors: string[] = [];
  for (const m of mutations) {
    if (!m?.query || !/\bmutation\b/.test(m.query)) { failed++; errors.push("skipped a non-mutation document"); continue; }
    try {
      const res = await fetch(`https://${ctx.shop}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": ctx.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ query: m.query, variables: m.variables ?? {} }),
      });
      const text = await res.text();
      console.log(`[approve] ${ctx.shop} mutation -> HTTP ${res.status}`);
      if (res.ok) {
        applied++;
        try { collectDeliverables(ctx, text, (d) => deliverables.push(d)); } catch { /* best-effort */ }
      } else {
        failed++;
        errors.push(`HTTP ${res.status}`);
      }
    } catch (e) {
      failed++;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { applied, failed, deliverables, errors };
}

export function buildShopifyMcp(ctx: AdminCtx, gate: MutationGate) {
  return createSdkMcpServer({
    name: "shopify",
    version: "0.1.0",
    tools: [
      tool(
        "graphql",
        `Run a Shopify Admin GraphQL query or mutation against ${ctx.shop} (Admin API ${API_VERSION}). ` +
          "Use for store resources that are NOT theme files: products, collections, pages, blogs/articles, " +
          "discounts, navigation, metafields, etc. QUERIES run immediately and are safe to explore. " +
          "MUTATIONS require merchant approval: by default a mutation is recorded but NOT executed — when that " +
          "happens, describe to the merchant exactly what it will change and stop; do not retry it. " +
          "Discover correct fields/mutations before writing.",
        {
          query: z.string().describe("The GraphQL query or mutation document."),
          variables: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("GraphQL variables object, if the document uses any."),
        },
        async ({ query, variables }) => {
          const isMutation = /\bmutation\b/.test(query);

          // Gate: hold mutations for approval unless this turn is approved.
          if (isMutation && !gate.allowMutations) {
            gate.onProposed({ query, variables });
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    "BLOCKED: this mutation was NOT executed — it needs the merchant's approval first. " +
                    "Tell the merchant exactly what it will change, then stop and wait for approval. Do not retry it.",
                },
              ],
              isError: false,
            };
          }

          const res = await fetch(
            `https://${ctx.shop}/admin/api/${API_VERSION}/graphql.json`,
            {
              method: "POST",
              headers: {
                "X-Shopify-Access-Token": ctx.accessToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query, variables: variables ?? {} }),
            },
          );
          const text = await res.text();
          if (isMutation) {
            console.log(`[shopify-tool] ${ctx.shop} mutation -> HTTP ${res.status}`);
            // Surface what was created/updated so the app can link to it.
            if (res.ok && gate.onDelivered) {
              try {
                collectDeliverables(ctx, text, gate.onDelivered);
              } catch {
                /* best-effort */
              }
            }
          }
          return {
            content: [
              { type: "text" as const, text: res.ok ? text : `HTTP ${res.status}: ${text}` },
            ],
            isError: !res.ok,
          };
        },
      ),
    ],
  });
}
