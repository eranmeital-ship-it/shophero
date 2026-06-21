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

export interface MutationGate {
  /** When false, mutations are recorded (not executed) for merchant approval. */
  allowMutations: boolean;
  /** Called with each blocked mutation so the app can surface it for approval. */
  onProposed: (m: { query: string; variables?: unknown }) => void;
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
