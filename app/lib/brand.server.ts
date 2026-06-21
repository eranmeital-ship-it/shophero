import db from "../db.server";
import type { OnboardingAnswers, StoreSnapshot } from "./onboarding.server";

/**
 * Brand Kit + long-term memory — the agent's persistent per-shop identity.
 *
 * The brand kit (colors, fonts, voice, do/don'ts) is injected into every agent
 * turn so output stays on-brand. Memory holds durable facts the agent learns
 * (via the `remember` tool) or the merchant adds. Both live on ShopProfile so
 * they survive restarts — unlike the old in-process session map.
 */

export interface BrandKit {
  colors: string[];
  fonts: string[];
  voice: string;
  audience: string;
  dos: string[];
  donts: string[];
  notes: string;
}

export const EMPTY_KIT: BrandKit = { colors: [], fonts: [], voice: "", audience: "", dos: [], donts: [], notes: "" };

function parseKit(raw: string | null | undefined): BrandKit {
  if (!raw) return { ...EMPTY_KIT };
  try {
    const k = JSON.parse(raw) as Partial<BrandKit>;
    return {
      colors: Array.isArray(k.colors) ? k.colors : [],
      fonts: Array.isArray(k.fonts) ? k.fonts : [],
      voice: typeof k.voice === "string" ? k.voice : "",
      audience: typeof k.audience === "string" ? k.audience : "",
      dos: Array.isArray(k.dos) ? k.dos : [],
      donts: Array.isArray(k.donts) ? k.donts : [],
      notes: typeof k.notes === "string" ? k.notes : "",
    };
  } catch {
    return { ...EMPTY_KIT };
  }
}

function parseMemory(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const m = JSON.parse(raw);
    return Array.isArray(m) ? (m as string[]).filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getBrandKit(shop: string): Promise<BrandKit> {
  const p = await db.shopProfile.findUnique({ where: { shop }, select: { brandKit: true } });
  return parseKit(p?.brandKit);
}

export async function saveBrandKit(shop: string, kit: BrandKit): Promise<void> {
  const brandKit = JSON.stringify(kit);
  await db.shopProfile.upsert({ where: { shop }, create: { shop, brandKit }, update: { brandKit } });
}

export async function getMemory(shop: string): Promise<string[]> {
  const p = await db.shopProfile.findUnique({ where: { shop }, select: { memory: true } });
  return parseMemory(p?.memory);
}

/** Append a fact the agent (or merchant) wants remembered. De-duped, capped at 50. */
export async function addMemory(shop: string, fact: string): Promise<void> {
  const f = fact.trim();
  if (!f) return;
  const existing = await getMemory(shop);
  if (existing.some((m) => m.toLowerCase() === f.toLowerCase())) return;
  const memory = JSON.stringify([...existing, f].slice(-50));
  await db.shopProfile.upsert({ where: { shop }, create: { shop, memory }, update: { memory } });
}

export async function setMemory(shop: string, facts: string[]): Promise<void> {
  const memory = JSON.stringify(facts.map((f) => f.trim()).filter(Boolean).slice(-50));
  await db.shopProfile.upsert({ where: { shop }, create: { shop, memory }, update: { memory } });
}

/** Compose the brand kit + memory into a compact block for the agent's system prompt. */
export async function buildBrandContext(shop: string): Promise<string> {
  const [kit, mem] = await Promise.all([getBrandKit(shop), getMemory(shop)]);
  const lines: string[] = [];

  const hasKit = kit.voice || kit.audience || kit.colors.length || kit.fonts.length || kit.dos.length || kit.donts.length || kit.notes;
  if (hasKit) {
    lines.push("BRAND KIT — always honor these in any content or design you produce:");
    if (kit.voice) lines.push(`- Voice/tone: ${kit.voice}`);
    if (kit.audience) lines.push(`- Audience: ${kit.audience}`);
    if (kit.colors.length) lines.push(`- Brand colors: ${kit.colors.join(", ")} (reuse the theme's color schemes; don't invent new palettes)`);
    if (kit.fonts.length) lines.push(`- Fonts: ${kit.fonts.join(", ")}`);
    if (kit.dos.length) lines.push(`- Always: ${kit.dos.join("; ")}`);
    if (kit.donts.length) lines.push(`- Never: ${kit.donts.join("; ")}`);
    if (kit.notes) lines.push(`- Notes: ${kit.notes}`);
  }
  if (mem.length) {
    lines.push("", "REMEMBERED ABOUT THIS STORE (apply when relevant):");
    for (const m of mem.slice(-20)) lines.push(`- ${m}`);
  }
  return lines.join("\n");
}

/** Build an initial brand kit from onboarding answers (only fills blanks). */
export async function seedBrandKitFromOnboarding(shop: string, answers: OnboardingAnswers, _snapshot: StoreSnapshot): Promise<void> {
  const current = await getBrandKit(shop);
  const seeded: BrandKit = {
    ...current,
    voice: current.voice || answers.voice || "",
    audience: current.audience || answers.audience || "",
    notes: current.notes || [answers.sells ? `Sells: ${answers.sells}` : "", answers.admire ? `Admires: ${answers.admire}` : ""].filter(Boolean).join(". "),
  };
  await saveBrandKit(shop, seeded);
}

// ── Agent session persistence (DB-backed resume) ─────────────────────────────

export async function getAgentSession(shop: string): Promise<string | undefined> {
  const p = await db.shopProfile.findUnique({ where: { shop }, select: { agentSessionId: true } });
  return p?.agentSessionId ?? undefined;
}

export async function setAgentSession(shop: string, sessionId: string): Promise<void> {
  await db.shopProfile
    .upsert({ where: { shop }, create: { shop, agentSessionId: sessionId }, update: { agentSessionId: sessionId } })
    .catch(() => {});
}

export async function clearAgentSession(shop: string): Promise<void> {
  await db.shopProfile.update({ where: { shop }, data: { agentSessionId: null } }).catch(() => {});
}
