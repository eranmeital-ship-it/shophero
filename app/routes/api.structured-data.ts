import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { ensureAssetInWorkspace } from "../lib/theme.server";
import { insertStructuredData } from "../lib/structured-data.server";
import { auditSchema } from "../lib/schema-audit.server";

/**
 * Structured-data endpoint:
 *   op=audit  → run the deterministic AI-Readiness audit (score, coverage,
 *               gaps, and live verification of the storefront).
 *   default   → install/refresh the JSON-LD snippet (staged for approval).
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const { themeId, dir } = await ensureReady(ctx);

  const form = await request.formData().catch(() => null);
  const op = String(form?.get("op") ?? "");

  if (op === "audit") {
    try {
      const audit = await auditSchema(admin, dir);
      return Response.json({ ok: true, audit });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Audit failed." }, { status: 500 });
    }
  }

  // Self-heal the layout file the snippet hooks into (partial pulls can miss it).
  await ensureAssetInWorkspace(ctx, themeId, dir, "layout/theme.liquid").catch(() => null);
  const res = await insertStructuredData(dir);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ ok: true, alreadyPresent: res.alreadyPresent ?? false });
}
