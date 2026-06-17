import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Theme operations via the Admin REST Asset API. We use REST here because the
 * asset get/put endpoints are stable and simple. Two notes:
 *
 *  1. The Shopify App template wires up the Shopify Dev MCP. Before you ship,
 *     validate the exact theme-create / asset calls against it (or the current
 *     Admin API docs) for your API version — names and shapes drift between
 *     versions.
 *  2. "Ensure dev copy" here creates a fresh UNPUBLISHED theme and copies every
 *     live asset into it. That's the naive-but-safe bootstrap (one request per
 *     asset). Fine for v0; optimize later (bulk, or a native duplicate call).
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-07";
const WORKING_THEME_NAME = "Drift Working Copy";

interface Ctx {
  shop: string; // e.g. my-store.myshopify.com
  accessToken: string; // session.accessToken from authenticate.admin
}

function base(shop: string): string {
  return `https://${shop}/admin/api/${API_VERSION}`;
}

async function rest<T>(ctx: Ctx, p: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base(ctx.shop)}${p}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": ctx.accessToken,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Shopify ${init?.method ?? "GET"} ${p} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

interface Theme { id: number; name: string; role: string; }

async function listThemes(ctx: Ctx): Promise<Theme[]> {
  const { themes } = await rest<{ themes: Theme[] }>(ctx, "/themes.json");
  return themes;
}

export async function liveThemeId(ctx: Ctx): Promise<number> {
  const live = (await listThemes(ctx)).find((t) => t.role === "main");
  if (!live) throw new Error("No published (main) theme found");
  return live.id;
}

/** Get the Drift working copy, creating it from the live theme if absent. */
export async function ensureWorkingTheme(ctx: Ctx): Promise<number> {
  const themes = await listThemes(ctx);
  const existing = themes.find((t) => t.name === WORKING_THEME_NAME);
  if (existing) return existing.id;

  // Create a blank unpublished theme...
  const { theme } = await rest<{ theme: Theme }>(ctx, "/themes.json", {
    method: "POST",
    body: JSON.stringify({ theme: { name: WORKING_THEME_NAME, role: "unpublished" } }),
  });

  // ...then copy every live asset into it.
  const liveId = themes.find((t) => t.role === "main")!.id;
  const keys = await listAssetKeys(ctx, liveId);
  for (const key of keys) {
    const value = await getAsset(ctx, liveId, key);
    await putAsset(ctx, theme.id, key, value);
  }
  return theme.id;
}

async function listAssetKeys(ctx: Ctx, themeId: number): Promise<string[]> {
  const { assets } = await rest<{ assets: { key: string }[] }>(
    ctx,
    `/themes/${themeId}/assets.json`,
  );
  return assets.map((a) => a.key);
}

async function getAsset(ctx: Ctx, themeId: number, key: string): Promise<string> {
  const { asset } = await rest<{ asset: { value?: string; attachment?: string } }>(
    ctx,
    `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
  );
  // Text assets come back as `value`; binary as base64 `attachment`.
  return asset.value ?? asset.attachment ?? "";
}

async function putAsset(ctx: Ctx, themeId: number, key: string, value: string): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await rest(ctx, `/themes/${themeId}/assets.json`, {
        method: "PUT",
        body: JSON.stringify({ asset: { key, value } }),
      });
      return;
    } catch (err) {
      const isLast = attempt === maxRetries - 1;
      if (isLast) throw err;
      // Theme not ready yet — wait and retry
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/** Pull all of the working theme's assets onto disk under `dir`. */
export async function pullThemeToWorkspace(ctx: Ctx, themeId: number, dir: string): Promise<void> {
  const keys = await listAssetKeys(ctx, themeId);
  for (const key of keys) {
    const value = await getAsset(ctx, themeId, key);
    const filePath = path.join(dir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, value, "utf8");
  }
}

/** Push the given changed asset keys from disk up to the working theme. */
export async function pushWorkspaceChanges(
  ctx: Ctx,
  themeId: number,
  dir: string,
  keys: string[],
): Promise<number> {
  for (const key of keys) {
    const value = await readFile(path.join(dir, key), "utf8");
    await putAsset(ctx, themeId, key, value);
  }
  return keys.length;
}

export function previewUrl(shop: string, themeId: number): string {
  return `https://${shop}/?preview_theme_id=${themeId}`;
}
