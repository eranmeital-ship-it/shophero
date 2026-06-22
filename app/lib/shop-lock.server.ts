/**
 * One in-flight workspace operation PER SHOP. The agent turn, bootstrap/clone,
 * and apply/discard/restore all mutate the same on-disk git workspace, so they
 * MUST be serialized per shop — otherwise concurrent requests (two tabs, a retry,
 * an agent turn racing an Accept) interleave git index/file writes and corrupt
 * the working copy. This is a single-instance lock; it pairs with running ONE
 * Railway instance (see the Wave-3 deployment notes).
 */
const shopChain = new Map<string, Promise<unknown>>();

export async function withShopLock<T>(shop: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!shop) return fn();
  const prev = shopChain.get(shop) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  shopChain.set(shop, run);
  try {
    return await run;
  } finally {
    if (shopChain.get(shop) === run) shopChain.delete(shop);
  }
}
