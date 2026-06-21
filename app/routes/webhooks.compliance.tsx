import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory Shopify privacy/compliance webhooks (required for App Store review):
 *   - customers/data_request — return the customer data we hold
 *   - customers/redact       — delete a customer's data
 *   - shop/redact            — delete all data for an uninstalled shop (48h later)
 *
 * `authenticate.webhook` verifies the HMAC and rejects forged requests. ShopHero
 * stores no customer PII — only a Session row per shop (tokens + optional BYOK
 * key) — so the customer topics have nothing to return/erase; shop/redact purges
 * the shop's session data.
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
      // Erase everything we hold for this shop.
      await db.session.deleteMany({ where: { shop } });
      break;
  }

  return new Response();
};
