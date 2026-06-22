import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { searchStock, importToShopify } from "../lib/stock-images.server";

/**
 * Stock-image search + import. op=search returns license-clean results from the
 * shop's configured provider; op=import pulls a chosen image into Shopify Files.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Bad request." }, { status: 400 });
  const op = String(form.get("op") ?? "search");

  if (op === "search") {
    const res = await searchStock(session.shop, String(form.get("q") ?? ""));
    return Response.json(res);
  }

  if (op === "import") {
    const res = await importToShopify(admin, session.shop, {
      full: String(form.get("full") ?? ""),
      alt: String(form.get("alt") ?? "") || undefined,
      downloadLocation: String(form.get("downloadLocation") ?? "") || undefined,
    });
    if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
    return Response.json({ ok: true, id: res.id });
  }

  return Response.json({ error: "Unknown op" }, { status: 400 });
}
