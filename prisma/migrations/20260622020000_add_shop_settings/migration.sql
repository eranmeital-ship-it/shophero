-- App-owned per-shop settings, separate from the Shopify-managed Session row.
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "plan" TEXT,
    "anthropicApiKey" TEXT,
    "themeToken" TEXT,
    "stockKey" TEXT,
    "stockProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- Backfill from existing Session columns (one row per shop, first non-null wins).
INSERT INTO "ShopSettings" ("shop","plan","anthropicApiKey","themeToken","stockKey","stockProvider","createdAt","updatedAt")
SELECT shop,
  (array_remove(array_agg("plan"), NULL))[1],
  (array_remove(array_agg("anthropicApiKey"), NULL))[1],
  (array_remove(array_agg("themeToken"), NULL))[1],
  (array_remove(array_agg("stockKey"), NULL))[1],
  (array_remove(array_agg("stockProvider"), NULL))[1],
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Session" GROUP BY shop
ON CONFLICT ("shop") DO NOTHING;
