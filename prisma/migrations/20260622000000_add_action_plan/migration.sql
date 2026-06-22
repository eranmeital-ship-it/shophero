-- Persistent routed action plans (decomposed goals → executable checklist).
CREATE TABLE "ActionPlan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "items" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActionPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActionPlan_shop_idx" ON "ActionPlan"("shop");
