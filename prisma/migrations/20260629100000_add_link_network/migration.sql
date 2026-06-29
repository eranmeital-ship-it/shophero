-- ShopHero Link Network
CREATE TABLE "LinkMember" (
  "shop" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "keywords" TEXT NOT NULL DEFAULT '',
  "storeUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LinkMember_pkey" PRIMARY KEY ("shop")
);
CREATE TABLE "LinkEdge" (
  "id" TEXT NOT NULL,
  "ringId" TEXT NOT NULL,
  "fromShop" TEXT NOT NULL,
  "toShop" TEXT NOT NULL,
  "anchor" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "placementUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMP(3),
  CONSTRAINT "LinkEdge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LinkEdge_fromShop_idx" ON "LinkEdge"("fromShop");
CREATE INDEX "LinkEdge_toShop_idx" ON "LinkEdge"("toShop");
CREATE INDEX "LinkEdge_ringId_idx" ON "LinkEdge"("ringId");
