import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { insertStructuredData } from "../lib/structured-data.server";

/** Add deterministic JSON-LD structured data to the theme (staged for approval). */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const { dir } = await ensureReady(ctx);
  const res = await insertStructuredData(dir);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ ok: true, alreadyPresent: res.alreadyPresent ?? false });
}
