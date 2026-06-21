import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Owner-only admin console auth. This is NOT the Shopify merchant session — it's
 * the app operator's god-view across all shops, so it has its own gate:
 *   ADMIN_PASSWORD=...   in .env
 * A correct password sets a signed, httpOnly cookie scoped to /admin.
 *
 * If ADMIN_PASSWORD is unset, the console is locked (no access) by design.
 */
const COOKIE = "sh_admin";
const SECRET = process.env.ADMIN_PASSWORD ?? "";

function expectedToken(): string {
  return createHmac("sha256", SECRET).update("shophero-admin-v1").digest("hex");
}

export function adminConfigured(): boolean {
  return SECRET.length > 0;
}

export function checkPassword(pw: string): boolean {
  if (!SECRET) return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminSetCookie(): string {
  return `${COOKIE}=${expectedToken()}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function adminClearCookie(): string {
  return `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAdmin(request: Request): boolean {
  if (!SECRET) return false;
  const cookie = request.headers.get("Cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]+)`));
  if (!m) return false;
  const got = Buffer.from(m[1]);
  const want = Buffer.from(expectedToken());
  return got.length === want.length && timingSafeEqual(got, want);
}
