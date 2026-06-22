import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { decrypt } from "./crypto.server";

/**
 * Stock-image connector (Pexels / Unsplash). The merchant pastes a free API key
 * in Settings (encrypted at rest); we search license-clean photos and, on pick,
 * import the chosen image into Shopify Files so it's a permanent CDN asset
 * usable in the theme editor, sections and product media. Attribution metadata
 * is preserved and Unsplash's required download trigger is fired on import.
 */

export type StockProvider = "pexels" | "unsplash";

export interface StockImage {
  id: string;
  thumb: string; // small preview
  full: string; // full-res source for import
  alt: string;
  photographer: string;
  photographerUrl: string;
  downloadLocation?: string; // Unsplash: must be pinged on use
}

export interface StockConfig {
  provider: StockProvider;
  key: string;
}

export async function getStockConfig(shop: string): Promise<StockConfig | null> {
  const row = await db.session.findFirst({ where: { shop }, select: { stockKey: true, stockProvider: true } });
  if (!row?.stockKey || !row.stockProvider) return null;
  try {
    return { provider: row.stockProvider as StockProvider, key: decrypt(row.stockKey) };
  } catch {
    return null;
  }
}

export function attribution(provider: StockProvider): string {
  return provider === "unsplash" ? "Photos via Unsplash — credit the photographer where shown." : "Photos via Pexels — credit the photographer where shown.";
}

/** Search the configured provider. Returns [] (never throws) on any error. */
export async function searchStock(shop: string, query: string, perPage = 24): Promise<{ images: StockImage[]; provider?: StockProvider; error?: string }> {
  const cfg = await getStockConfig(shop);
  if (!cfg) return { images: [], error: "No stock-image key set. Add one in Settings." };
  const q = query.trim();
  if (!q) return { images: [], provider: cfg.provider };

  try {
    if (cfg.provider === "pexels") {
      const r = await fetch(`https://api.pexels.com/v1/search?per_page=${perPage}&query=${encodeURIComponent(q)}`, {
        headers: { Authorization: cfg.key },
      });
      if (!r.ok) return { images: [], provider: cfg.provider, error: r.status === 401 ? "Pexels key rejected." : `Pexels error ${r.status}.` };
      const d = (await r.json()) as { photos?: { id: number; alt?: string; photographer?: string; photographer_url?: string; src?: { medium?: string; large2x?: string; original?: string } }[] };
      const images = (d.photos ?? []).map((p) => ({
        id: String(p.id),
        thumb: p.src?.medium ?? p.src?.original ?? "",
        full: p.src?.large2x ?? p.src?.original ?? "",
        alt: p.alt || q,
        photographer: p.photographer ?? "",
        photographerUrl: p.photographer_url ?? "",
      })).filter((i) => i.full);
      return { images, provider: cfg.provider };
    }
    // unsplash
    const r = await fetch(`https://api.unsplash.com/search/photos?per_page=${perPage}&query=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Client-ID ${cfg.key}` },
    });
    if (!r.ok) return { images: [], provider: cfg.provider, error: r.status === 401 ? "Unsplash key rejected." : `Unsplash error ${r.status}.` };
    const d = (await r.json()) as { results?: { id: string; alt_description?: string; urls?: { small?: string; regular?: string; full?: string }; user?: { name?: string; links?: { html?: string } }; links?: { download_location?: string } }[] };
    const images = (d.results ?? []).map((p) => ({
      id: p.id,
      thumb: p.urls?.small ?? p.urls?.regular ?? "",
      full: p.urls?.full ?? p.urls?.regular ?? "",
      alt: p.alt_description || q,
      photographer: p.user?.name ?? "",
      photographerUrl: p.user?.links?.html ?? "",
      downloadLocation: p.links?.download_location,
    })).filter((i) => i.full);
    return { images, provider: cfg.provider };
  } catch (e) {
    return { images: [], provider: cfg.provider, error: e instanceof Error ? e.message : "Search failed." };
  }
}

/** Import a chosen stock image into Shopify Files (CDN). Returns the file GID. */
export async function importToShopify(admin: AdminApiContext, shop: string, image: { full: string; alt?: string; downloadLocation?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const cfg = await getStockConfig(shop);
  // Unsplash ToS: trigger the download endpoint when an image is actually used.
  if (cfg?.provider === "unsplash" && image.downloadLocation) {
    fetch(image.downloadLocation, { headers: { Authorization: `Client-ID ${cfg.key}` } }).catch(() => {});
  }
  try {
    const r = await admin.graphql(
      `mutation($files:[FileCreateInput!]!){ fileCreate(files:$files){ files{ id fileStatus } userErrors{ message } } }`,
      { variables: { files: [{ originalSource: image.full, contentType: "IMAGE", alt: (image.alt ?? "").slice(0, 512) }] } },
    );
    const d = (await r.json()) as { data?: { fileCreate?: { files?: { id?: string }[]; userErrors?: { message?: string }[] } } };
    const err = d.data?.fileCreate?.userErrors?.[0]?.message;
    if (err) return { ok: false, error: err };
    const id = d.data?.fileCreate?.files?.[0]?.id;
    return id ? { ok: true, id } : { ok: false, error: "Shopify didn't accept the image." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}

export function isLikelyStockKey(provider: string, key: string): boolean {
  const k = key.trim();
  if (provider === "pexels") return k.length >= 30 && /^[A-Za-z0-9]+$/.test(k);
  if (provider === "unsplash") return k.length >= 20 && /^[A-Za-z0-9_-]+$/.test(k);
  return false;
}
