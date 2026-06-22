import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import db from "../db.server";
import { decrypt } from "./crypto.server";

// Per-shop theme-write token (a custom-app token the merchant pastes in Settings),
// resolved from the DB and cached briefly so a bootstrap copy doesn't re-read it
// per file. Falls back to the global env token, then the OAuth token.
const themeTokenCache = new Map<string, { token: string | null; at: number }>();
export function clearThemeTokenCache(shop: string): void {
  themeTokenCache.delete(shop);
}
async function shopThemeToken(shop: string): Promise<string | null> {
  const cached = themeTokenCache.get(shop);
  if (cached && Date.now() - cached.at < 30_000) return cached.token;
  let token: string | null = null;
  try {
    const row = await db.shopSettings.findUnique({ where: { shop } });
    token = row?.themeToken ? decrypt(row.themeToken) : null;
  } catch {
    token = null;
  }
  themeTokenCache.set(shop, { token, at: Date.now() });
  return token;
}

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
// The unpublished theme ShopHero edits. We use a stable "ShopHero | " prefix so
// the theme can be renamed with a version + timestamp on each apply (so merchants
// can tell the latest edited version from the original duplicate) while still
// being found reliably by prefix. Override with DRIFT_THEME_NAME to pin an exact
// existing theme (e.g. a native "Duplicate" of the live theme) — in that mode we
// leave the name as-is and don't auto-version it.
export const WORKING_THEME_PREFIX = "ShopHero | ";
const WORKING_THEME_NAME = process.env.DRIFT_THEME_NAME ?? `${WORKING_THEME_PREFIX}Working Copy`;

/** Does this theme name belong to ShopHero's working copy? */
function isWorkingTheme(name: string): boolean {
  const custom = process.env.DRIFT_THEME_NAME;
  if (custom) return name === custom;
  // Match the default name, any versioned "ShopHero | v1.N …" rename, and the
  // legacy "Drift Working Copy" name from earlier installs.
  return name === WORKING_THEME_NAME || name.startsWith(WORKING_THEME_PREFIX) || name === "Drift Working Copy";
}

interface Ctx {
  shop: string; // e.g. my-store.myshopify.com
  accessToken: string; // session.accessToken from authenticate.admin
}

function base(shop: string): string {
  return `https://${shop}/admin/api/${API_VERSION}`;
}

// Shopify's REST Asset API allows only ~2 requests/second. The theme bootstrap
// reads/writes one asset per file, so we serialize every REST call through a
// single chain and space them out — otherwise a theme with many files instantly
// blows the limit and 429s mid-copy, crashing setup. We also retry 429s with the
// server's Retry-After hint.
const REST_MIN_INTERVAL_MS = 550; // ~1.8 req/s — safely under the 2/s cap
let restChain: Promise<unknown> = Promise.resolve();
let lastRestAt = 0;

async function doRest<T>(ctx: Ctx, p: string, init: RequestInit | undefined, attempt: number): Promise<T> {
  const wait = REST_MIN_INTERVAL_MS - (Date.now() - lastRestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const res = await fetch(`${base(ctx.shop)}${p}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": ctx.accessToken,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  lastRestAt = Date.now();

  if (res.status === 429 && attempt < 6) {
    const retryAfter = Number(res.headers.get("Retry-After")) || attempt + 1;
    await new Promise((r) => setTimeout(r, Math.ceil(retryAfter * 1000)));
    return doRest<T>(ctx, p, init, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Shopify ${init?.method ?? "GET"} ${p} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function rest<T>(ctx: Ctx, p: string, init?: RequestInit): Promise<T> {
  // Chain so REST calls run one at a time, evenly spaced under the rate limit.
  const run = restChain.then(() => doRest<T>(ctx, p, init, 0));
  restChain = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Admin GraphQL call. Theme-asset *writes* must go through GraphQL
 * (`themeFilesUpsert`) — the REST asset PUT endpoint was removed and now 404s.
 */
async function graphql<T>(ctx: Ctx, query: string, variables: Record<string, unknown>): Promise<T> {
  // Theme-file writes need write_themes WITHOUT the App-Store exemption that
  // gates public-app OAuth tokens. A custom-app token (Settings > Develop apps)
  // is not App-Store-distributed, so it can write themes. Use it when provided;
  // fall back to the OAuth session token (works once an exemption is granted).
  const token = (await shopThemeToken(ctx.shop)) || process.env.DRIFT_THEME_TOKEN || ctx.accessToken;
  const res = await fetch(`${base(ctx.shop)}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL -> ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

const THEME_FILES_UPSERT = `
  mutation ThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      userErrors { field message code }
    }
  }`;

interface Theme { id: number; name: string; role: string; created_at?: string; updated_at?: string; }

async function listThemes(ctx: Ctx): Promise<Theme[]> {
  const { themes } = await rest<{ themes: Theme[] }>(ctx, "/themes.json");
  return themes;
}

export async function liveThemeId(ctx: Ctx): Promise<number> {
  const live = (await listThemes(ctx)).find((t) => t.role === "main");
  if (!live) throw new Error("No published (main) theme found");
  return live.id;
}

/**
 * Rename the working theme (metadata only — no theme-file-write exemption needed).
 * Used to stamp the current version + timestamp onto the theme name after an apply.
 */
export async function renameTheme(ctx: Ctx, themeId: number, name: string): Promise<void> {
  await rest(ctx, `/themes/${themeId}.json`, {
    method: "PUT",
    body: JSON.stringify({ theme: { id: themeId, name } }),
  });
}

/** Get the Drift working copy, creating it from the live theme if absent. */
export async function ensureWorkingTheme(ctx: Ctx): Promise<Theme> {
  const themes = await listThemes(ctx);
  const existing = themes.find((t) => isWorkingTheme(t.name));
  if (existing) {
    // Self-heal: an earlier failed/partial bootstrap can leave this theme
    // empty or incomplete (=> "missing layout/theme.liquid" and unpreviewable).
    // If the required layout is absent, (re)copy the live assets — putAsset is
    // idempotent, so this also completes a partial copy.
    const keys = await listAssetKeys(ctx, existing.id);
    if (!keys.includes("layout/theme.liquid")) {
      await copyLiveAssets(ctx, themes, existing.id);
    }
    return existing;
  }

  // Create a blank unpublished theme, then copy every live asset into it.
  const { theme } = await rest<{ theme: Theme }>(ctx, "/themes.json", {
    method: "POST",
    body: JSON.stringify({ theme: { name: WORKING_THEME_NAME, role: "unpublished" } }),
  });
  await copyLiveAssets(ctx, themes, theme.id);
  return theme;
}

/** Copy every asset from the live (main) theme into the target theme. */
async function copyLiveAssets(ctx: Ctx, themes: Theme[], targetId: number): Promise<void> {
  const liveId = themes.find((t) => t.role === "main")!.id;
  const keys = await listAssetKeys(ctx, liveId);
  // Reads are rate-limited one-by-one (REST); writes are batched (GraphQL accepts
  // many files per call) so the whole copy is read-bound, not 2× per asset.
  const files: { key: string; value: string }[] = [];
  for (const key of keys) {
    files.push({ key, value: await getAsset(ctx, liveId, key) });
  }
  await putAssets(ctx, targetId, files);
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

async function writeAssetToWorkspace(ctx: Ctx, themeId: number, dir: string, key: string): Promise<string | null> {
  const value = await getAsset(ctx, themeId, key).catch(() => "");
  if (!value.trim()) return null;
  const fp = path.join(dir, key);
  await mkdir(path.dirname(fp), { recursive: true });
  await writeFile(fp, value, "utf8");
  return key;
}

/**
 * Self-heal a single missing asset in the workspace (e.g. layout/theme.liquid).
 * The first-time theme pull can be incomplete (one rate-limited request per
 * asset), which later surfaces as "Couldn't open …". Fetches the live asset and
 * writes it. Returns the key it ensured, or null if the theme lacks it.
 */
export async function ensureAssetInWorkspace(ctx: Ctx, themeId: number, dir: string, key: string): Promise<string | null> {
  try {
    const cur = await readFile(path.join(dir, key), "utf8");
    if (cur.trim()) return key;
  } catch { /* not present */ }
  return writeAssetToWorkspace(ctx, themeId, dir, key);
}

/**
 * Repair the workspace just before a push so an INCOMPLETE first pull can't block
 * a valid merchant change. For each changed JSON template / section group:
 *  - if it's empty or unparseable (a truncated pull), restore it from the live theme;
 *  - fetch any section it references that's missing locally (the section exists on
 *    the live theme but wasn't pulled — otherwise validation false-fails with
 *    "references section X which doesn't exist").
 * Returns the keys it pulled from live (so the caller can commit them as a baseline
 * repair, separate from the merchant's actual change).
 */
export async function repairWorkspaceForPush(ctx: Ctx, themeId: number, dir: string, keys: string[]): Promise<string[]> {
  const repaired: string[] = [];
  let liveKeys: string[] | null = null;
  const live = async () => (liveKeys ??= await listAssetKeys(ctx, themeId).catch(() => []));
  for (const key of keys) {
    if (!key.endsWith(".json")) continue;
    const isTemplate = key.startsWith("templates/");
    const isGroup = /^sections\/.*\.json$/.test(key);
    if (!isTemplate && !isGroup) continue;

    let content = "";
    try { content = await readFile(path.join(dir, key), "utf8"); } catch { /* missing */ }
    let parsed: { sections?: Record<string, { type?: unknown }> } | null = null;
    try { parsed = content.trim() ? JSON.parse(content) : null; } catch { parsed = null; }

    // Empty/corrupt (bad pull) → restore the real file from live.
    if (parsed == null) {
      if ((await live()).includes(key)) {
        const w = await writeAssetToWorkspace(ctx, themeId, dir, key);
        if (w) { repaired.push(w); try { parsed = JSON.parse(await readFile(path.join(dir, key), "utf8")); } catch { /* still bad */ } }
      }
    }

    // Ensure every referenced section exists locally (fetch the missing ones).
    const sections = parsed?.sections;
    if (sections && typeof sections === "object") {
      for (const s of Object.values(sections)) {
        const type = s?.type;
        if (typeof type !== "string" || !type || type.startsWith("shopify://")) continue;
        if (existsSync(path.join(dir, "sections", `${type}.liquid`)) || existsSync(path.join(dir, "sections", `${type}.json`))) continue;
        const lk = await live();
        const want = lk.includes(`sections/${type}.liquid`) ? `sections/${type}.liquid`
          : lk.includes(`sections/${type}.json`) ? `sections/${type}.json` : null;
        if (want) { const w = await writeAssetToWorkspace(ctx, themeId, dir, want); if (w) repaired.push(w); }
      }
    }
  }
  return [...new Set(repaired)];
}

/**
 * Self-heal a missing template file in the workspace. Tries `templates/<target>.json`
 * then `.liquid`, then any contextual variant (e.g. templates/product.custom.json),
 * fetching it live from the working theme. Returns the key ensured, or null.
 */
export async function ensureTemplateInWorkspace(
  ctx: Ctx,
  themeId: number,
  dir: string,
  target: string,
): Promise<string | null> {
  const preferred = [`templates/${target}.json`, `templates/${target}.liquid`];
  // Already on disk (and non-empty)? Nothing to do.
  for (const key of preferred) {
    try {
      const cur = await readFile(path.join(dir, key), "utf8");
      if (cur.trim()) return key;
    } catch { /* not present */ }
  }
  // Find it on the live theme: exact default first, else a contextual variant.
  let keys: string[] = [];
  try { keys = await listAssetKeys(ctx, themeId); } catch { return null; }
  const match =
    preferred.find((k) => keys.includes(k)) ??
    keys.find((k) => new RegExp(`^templates/${target}(\\.|$)`).test(k) && (k.endsWith(".json") || k.endsWith(".liquid")));
  if (!match) return null;
  return writeAssetToWorkspace(ctx, themeId, dir, match);
}

async function putAsset(ctx: Ctx, themeId: number, key: string, value: string): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const data = await graphql<{
        themeFilesUpsert: { userErrors: { field: string[]; message: string; code: string }[] };
      }>(ctx, THEME_FILES_UPSERT, {
        themeId: `gid://shopify/OnlineStoreTheme/${themeId}`,
        files: [{ filename: key, body: { type: "TEXT", value } }],
      });
      const errs = data.themeFilesUpsert.userErrors;
      if (errs.length) {
        throw new Error(errs.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; "));
      }
      return;
    } catch (err) {
      const isLast = attempt === maxRetries - 1;
      if (isLast) throw err;
      // Theme not ready yet — wait and retry
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/** Upsert many theme files in batches (themeFilesUpsert accepts an array). */
async function putAssets(ctx: Ctx, themeId: number, files: { key: string; value: string }[]): Promise<void> {
  const CHUNK = 20;
  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    const input = chunk.map((f) => ({ filename: f.key, body: { type: "TEXT", value: f.value } }));
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const data = await graphql<{
          themeFilesUpsert: { userErrors: { field: string[]; message: string; code: string }[] };
        }>(ctx, THEME_FILES_UPSERT, { themeId: `gid://shopify/OnlineStoreTheme/${themeId}`, files: input });
        const errs = data.themeFilesUpsert.userErrors;
        if (errs.length) throw new Error(errs.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; "));
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
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

export interface PushResult {
  applied: string[]; // keys pushed successfully
  failed: { key: string; reason: string }[]; // keys that were rejected/invalid
}

/** Validate one theme file's CONTENTS before it ever hits the API. Returns an
 * error reason, or null if it's safe to push. Catches the malformed-Liquid/JSON
 * class that used to break the theme on apply (e.g. a section group missing
 * `name`, or a template referencing a section that doesn't exist). */
function validateThemeFile(dir: string, key: string, value: string): string | null {
  // Liquid: if it declares a {% schema %}, the schema body must be valid JSON.
  if (key.endsWith(".liquid")) {
    const m = value.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i);
    if (m) {
      try { JSON.parse(m[1].trim()); }
      catch (e) { return `invalid {% schema %} JSON — ${e instanceof Error ? e.message : "parse error"}`; }
    }
    return null;
  }
  if (!key.endsWith(".json")) return null;

  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch (e) { return `invalid JSON — ${e instanceof Error ? e.message : "parse error"}`; }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const isTemplate = key.startsWith("templates/");
  const isSectionGroup = /^sections\/.*\.json$/.test(key);
  // Section GROUPS require these top-level keys (the past "missing required key name" crash).
  if (isSectionGroup) {
    for (const req of ["name", "type", "sections", "order"]) {
      if (!(req in obj)) return `section group is missing required key "${req}"`;
    }
  }
  // Templates / groups with a sections map: order must be an array and every
  // referenced section TYPE must resolve to a section file (on disk or in this push).
  if ((isTemplate || isSectionGroup) && obj.sections && typeof obj.sections === "object") {
    if (obj.order !== undefined && !Array.isArray(obj.order)) return `"order" must be an array`;
    const sections = obj.sections as Record<string, { type?: unknown }>;
    for (const [id, s] of Object.entries(sections)) {
      const type = s?.type;
      if (typeof type !== "string" || !type) return `section "${id}" is missing a "type"`;
      // App-embedded / theme app extension blocks (shopify://) aren't local files.
      if (type.startsWith("shopify://")) continue;
      if (!existsSync(path.join(dir, "sections", `${type}.liquid`)) && !existsSync(path.join(dir, "sections", `${type}.json`))) {
        return `references section "${type}" which doesn't exist`;
      }
    }
  }
  return null;
}

/**
 * Strip blank-string defaults from a section's {% schema %} — Shopify rejects
 * `"default":""` ("setting … default can't be blank"), which fails the push.
 * Omitting the key keeps the setting optional. Non-string blank-ish defaults
 * (false, 0) are untouched. No-ops if there's no schema or it isn't valid JSON.
 */
function sanitizeSchemaDefaults(liquid: string): string {
  return liquid.replace(/(\{%-?\s*schema\s*-?%\})([\s\S]*?)(\{%-?\s*endschema\s*-?%\})/i, (whole, open: string, body: string, close: string) => {
    let schema: unknown;
    try { schema = JSON.parse(body.trim()); } catch { return whole; }
    let changed = false;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        if (obj.default === "") { delete obj.default; changed = true; }
        for (const v of Object.values(obj)) walk(v);
      }
    };
    walk(schema);
    if (!changed) return whole;
    return `${open}\n${JSON.stringify(schema, null, 2)}\n${close}`;
  });
}

/**
 * Push the changed asset keys to the working theme — ATOMIC and dependency-safe:
 *  - every file's CONTENTS are validated first (JSON + section-group shape +
 *    {% schema %} + cross-references); if ANY file is invalid we push NOTHING
 *    and leave everything staged, so the theme is never left half-consistent;
 *  - valid files are pushed sections/snippets FIRST, then templates/groups, so
 *    even a mid-flight API failure can't leave a template pointing at a section
 *    that didn't get pushed.
 * Returns which keys applied and which failed (with reasons).
 */
export async function pushWorkspaceChanges(
  ctx: Ctx,
  themeId: number,
  dir: string,
  keys: string[],
): Promise<PushResult> {
  // 1. Read + validate everything up front.
  const files: { key: string; value: string }[] = [];
  const failed: { key: string; reason: string }[] = [];
  for (const key of keys) {
    let value: string;
    try { value = await readFile(path.join(dir, key), "utf8"); }
    catch (e) { failed.push({ key, reason: e instanceof Error ? e.message : String(e) }); continue; }
    // Sanitize known Shopify-rejected patterns (e.g. blank schema defaults) so a
    // stale/agent-written section can't block the push. Write the fix back so the
    // committed baseline is clean too.
    if (key.endsWith(".liquid")) {
      const fixed = sanitizeSchemaDefaults(value);
      if (fixed !== value) { value = fixed; await writeFile(path.join(dir, key), value, "utf8").catch(() => {}); }
    }
    const invalid = validateThemeFile(dir, key, value);
    if (invalid) failed.push({ key, reason: invalid });
    else files.push({ key, value });
  }
  // All-or-nothing: if anything is invalid/unreadable, push nothing and keep it
  // all staged for the merchant to discard/retry — never ship a partial change.
  if (failed.length) {
    return { applied: [], failed: [...failed, ...files.map((f) => ({ key: f.key, reason: "held back — another file in this change was invalid" }))] };
  }

  // 2. Push dependencies (sections/snippets) before the templates that use them.
  const rank = (k: string) => (k.startsWith("sections/") && k.endsWith(".liquid") ? 0 : k.startsWith("snippets/") ? 1 : k.endsWith(".json") ? 3 : 2);
  files.sort((a, b) => rank(a.key) - rank(b.key));

  const applied: string[] = [];
  try {
    for (const f of files) {
      await putAsset(ctx, themeId, f.key, f.value);
      applied.push(f.key);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[theme] push failed: ${reason}`);
    // Whatever didn't apply stays staged. Dependency ordering means anything that
    // DID apply (sections/snippets) is safe to leave — no template references it yet.
    const remaining = files.map((f) => f.key).filter((k) => !applied.includes(k));
    return { applied, failed: remaining.map((k) => ({ key: k, reason })) };
  }
  return { applied, failed: [] };
}

export function previewUrl(shop: string, themeId: number): string {
  return `https://${shop}/?preview_theme_id=${themeId}`;
}
