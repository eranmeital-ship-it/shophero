import db from "../db.server";

/**
 * Per-shop "brain bible" — custom knowledge a merchant feeds a brain module.
 * Stored once, read only when that brain's tool is actually called (so it never
 * bloats normal prompts) and appended as highest-priority context.
 */
export async function getBrainDoc(shop: string, brain: string): Promise<string | null> {
  const r = await db.brainDoc.findUnique({ where: { shop_brain: { shop, brain } }, select: { content: true } });
  return r?.content?.trim() ? r.content : null;
}

export async function setBrainDoc(shop: string, brain: string, content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) {
    await db.brainDoc.deleteMany({ where: { shop, brain } });
    return;
  }
  await db.brainDoc.upsert({
    where: { shop_brain: { shop, brain } },
    create: { shop, brain, content: trimmed },
    update: { content: trimmed },
  });
}

export async function getAllBrainDocs(shop: string): Promise<{ brain: string; content: string }[]> {
  return db.brainDoc.findMany({ where: { shop }, select: { brain: true, content: true } });
}
