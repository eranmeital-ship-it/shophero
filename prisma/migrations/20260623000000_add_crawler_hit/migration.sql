-- Real AI-crawler fetches of the hosted agent-ready files, captured at the App Proxy.
CREATE TABLE "CrawlerHit" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "bot" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrawlerHit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrawlerHit_shop_createdAt_idx" ON "CrawlerHit"("shop", "createdAt");
CREATE INDEX "CrawlerHit_shop_bot_idx" ON "CrawlerHit"("shop", "bot");
