import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { purgeShopData } from "../lib/shop-data.server";

/**
 * Mandatory Shopify privacy/compliance webhooks (required for App Store review):
 *   - customers/data_request — return the customer data we hold
 *   - customers/redact       — delete a customer's data
 *   - shop/redact            — delete ALL data for an uninstalled shop (48h later)
 *
 * `authenticate.webhook` verifies the HMAC and rejects forged requests. ShopHero
 * stores no customer PII (only shop-scoped operational data), so the customer
 * topics have nothing to return/erase. shop/redact purges everything we hold for
 * the shop: sessions, profile, reports, content plans, brain docs, jobs, usage,
 * events, and the local theme workspace.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const norm = topic.replace(/\//g, "_").toUpperCase();
  console.log(`Received ${topic} compliance webhook for ${shop}`);

  switch (norm) {
    case "CUSTOMERS_DATA_REQUEST":
      // No customer PII stored — nothing to return.
      break;
    case "CUSTOMERS_REDACT":
      // No customer PII stored — nothing to erase.
      break;
    case "SHOP_REDACT":
      await purgeShopData(shop);
      break;
  }

  return new Response();
};
