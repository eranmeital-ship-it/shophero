import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { gatherStoreSnapshot, gatherCatalogSignals } from "./onboarding.server";

/**
 * ShopHero Link Network — opt-in 3-way (A→B→C→A) link exchange.
 *
 * Every member GIVES one link and RECEIVES one — but never to/from the same store
 * (3-way, not reciprocal), so the exchange reads as organic to search & AI. The
 * algorithm matches by keyword relevance: you give to the most relevant store
 * that still needs an inbound link, and receive from the most relevant store that
 * still needs an outbound. Outbound links are served from each member's hosted
 * llms.txt (which AI crawls), and we monitor that they stay live.
 */

export interface RingPartner { shop: string; anchor: string; url: string; status: string }
export interface Membership {
  member: { shop: string; status: string; keywords: string[] } | null;
  giving: RingPartner | null;   // the store YOU link to
  receiving: RingPartner | null; // the store that links to YOU
}

const llmsUrl = (shop: string) => `https://${shop}/apps/shophero/llms.txt`;
const kw = (s: string): string[] => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Relevance between two keyword sets (Jaccard overlap, 0..1). */
function relevance(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export async function getMember(shop: string) {
  return db.linkMember.findUnique({ where: { shop } });
}

/** Enroll (or re-activate) a store — derives its niche keywords from the catalog. */
export async function enroll(admin: AdminApiContext, shop: string): Promise<void> {
  const snap = await gatherStoreSnapshot(admin).catch(() => ({}) as Awaited<ReturnType<typeof gatherStoreSnapshot>>);
  const signals = await gatherCatalogSignals(admin).catch(() => null);
  const productTypes = signals?.productTypes ?? [];
  const words = [...new Set([...productTypes, ...(snap.name ? snap.name.split(/\s+/) : [])])]
    .map((w) => w.toLowerCase()).filter((w) => w.length > 2).slice(0, 12);
  const storeUrl = snap.domain ? `https://${snap.domain}` : `https://${shop}`;
  await db.linkMember.upsert({
    where: { shop },
    create: { shop, status: "active", keywords: words.join(", "), storeUrl },
    update: { status: "active", keywords: words.join(", "), storeUrl },
  });
}

export async function setMemberStatus(shop: string, status: "active" | "paused"): Promise<void> {
  await db.linkMember.update({ where: { shop }, data: { status } }).catch(() => {});
}

/** The merchant's view: who they link to + who links to them. */
export async function getMembership(shop: string): Promise<Membership> {
  const member = await db.linkMember.findUnique({ where: { shop } });
  const [out, inb] = await Promise.all([
    db.linkEdge.findFirst({ where: { fromShop: shop, status: { in: ["pending", "live", "missing"] } }, orderBy: { createdAt: "desc" } }),
    db.linkEdge.findFirst({ where: { toShop: shop, status: { in: ["pending", "live", "missing"] } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    member: member ? { shop: member.shop, status: member.status, keywords: kw(member.keywords) } : null,
    giving: out ? { shop: out.toShop, anchor: out.anchor, url: out.targetUrl, status: out.status } : null,
    receiving: inb ? { shop: inb.toShop, anchor: inb.anchor, url: inb.targetUrl, status: inb.status } : null,
  };
}

/** Outbound partner links a member currently gives — injected into their llms.txt. */
export async function outboundLinks(shop: string): Promise<{ anchor: string; url: string }[]> {
  const edges = await db.linkEdge.findMany({ where: { fromShop: shop, status: { in: ["pending", "live", "missing"] } } });
  return edges.map((e) => ({ anchor: e.anchor, url: e.targetUrl }));
}

/**
 * Match active, unringed members into 3-way rings. Greedy by relevance: seed with
 * a member, pick its most-relevant unringed peer (B), then the peer most relevant
 * to B that isn't A (C), and wire A→B→C→A.
 */
export async function buildRings(): Promise<{ ringsCreated: number; matched: number }> {
  const active = await db.linkMember.findMany({ where: { status: "active" } });
  // Members already in a live/pending ring are skipped.
  const inRing = new Set(
    (await db.linkEdge.findMany({ where: { status: { in: ["pending", "live"] } }, select: { fromShop: true } })).map((e) => e.fromShop),
  );
  const pool = active.filter((m) => !inRing.has(m.shop)).map((m) => ({ shop: m.shop, kws: kw(m.keywords), url: m.storeUrl || `https://${m.shop}` }));

  const used = new Set<string>();
  const anchorFor = (m: { kws: string[]; shop: string }) => (m.kws[0] ? `${m.kws[0]} store` : m.shop.replace(/\.myshopify\.com$/, ""));
  let ringsCreated = 0, matched = 0;

  const mostRelevant = (seed: { kws: string[] }, exclude: Set<string>) =>
    pool
      .filter((m) => !used.has(m.shop) && !exclude.has(m.shop))
      .map((m) => ({ m, score: relevance(seed.kws, m.kws) }))
      .sort((x, y) => y.score - x.score)[0]?.m;

  for (const a of pool) {
    if (used.has(a.shop)) continue;
    const b = mostRelevant(a, new Set([a.shop]));
    if (!b) break;
    const c = mostRelevant(b, new Set([a.shop, b.shop]));
    if (!c) break;
    used.add(a.shop); used.add(b.shop); used.add(c.shop);
    const ringId = `ring_${a.shop}_${Date.now()}_${ringsCreated}`;
    const trio = [a, b, c];
    // A→B, B→C, C→A
    for (let i = 0; i < 3; i++) {
      const giver = trio[i], receiver = trio[(i + 1) % 3];
      await db.linkEdge.create({
        data: { ringId, fromShop: giver.shop, toShop: receiver.shop, anchor: anchorFor(receiver), targetUrl: receiver.url, placementUrl: llmsUrl(giver.shop), status: "pending" },
      });
    }
    ringsCreated++; matched += 3;
  }
  return { ringsCreated, matched };
}

/** Monitor: confirm each giver's hosted llms.txt still contains the partner link. */
export async function verifyEdges(limit = 100): Promise<{ checked: number; live: number; missing: number }> {
  const edges = await db.linkEdge.findMany({ where: { status: { in: ["pending", "live", "missing"] } }, take: limit });
  let live = 0, missing = 0;
  for (const e of edges) {
    let ok = false;
    try {
      const res = await fetch(e.placementUrl || llmsUrl(e.fromShop), { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const body = (await res.text()).toLowerCase();
        ok = body.includes(e.targetUrl.toLowerCase().replace(/^https?:\/\//, ""));
      }
    } catch { ok = false; }
    if (ok) live++; else missing++;
    await db.linkEdge.update({ where: { id: e.id }, data: { status: ok ? "live" : "missing", lastCheckedAt: new Date() } }).catch(() => {});
  }
  return { checked: edges.length, live, missing };
}

/** Admin: full network snapshot. */
export async function networkStats() {
  const [members, edges] = await Promise.all([
    db.linkMember.findMany({ orderBy: { createdAt: "desc" } }),
    db.linkEdge.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  const rings = new Set(edges.map((e) => e.ringId)).size;
  const live = edges.filter((e) => e.status === "live").length;
  const missing = edges.filter((e) => e.status === "missing").length;
  return { members, edges, rings, live, missing, active: members.filter((m) => m.status === "active").length };
}
