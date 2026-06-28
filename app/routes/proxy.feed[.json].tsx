import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildProductFeed } from "../lib/agent-feed.server";
import { logCrawlerHit } from "../lib/crawler-log.server";

/**
 * Served at {shop}/apps/shophero/feed.json via Shopify App Proxy — the
 * retrieval-tuned product feed AI agents read to answer specific questions.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session?.shop || !admin) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  logCrawlerHit(request, session.shop, "feed.json");
  let feed: object;
  try {
    feed = await buildProductFeed(admin, session.shop);
  } catch {
    feed = { shop: { name: session.shop }, products: [], note: "Catalog is being prepared." };
  }
  return new Response(JSON.stringify(feed), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
