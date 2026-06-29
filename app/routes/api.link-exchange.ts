import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { tierAllows } from "../lib/billing.server";
import { enroll, setMemberStatus, getMembership } from "../lib/link-exchange.server";

/** Merchant control for the ShopHero Link Network. Pro+ only. */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  // The link network is part of the content/authority program — Pro and up.
  if (!(await tierAllows(admin, "dailyContent").catch(() => false))) {
    return { ok: false, error: "The ShopHero Link Network is a Pro feature. Upgrade to join.", upgrade: true };
  }

  if (intent === "join") {
    await enroll(admin, shop);
  } else if (intent === "pause") {
    await setMemberStatus(shop, "paused");
  } else if (intent === "resume") {
    await setMemberStatus(shop, "active");
  }
  return { ok: true, membership: await getMembership(shop) };
}
