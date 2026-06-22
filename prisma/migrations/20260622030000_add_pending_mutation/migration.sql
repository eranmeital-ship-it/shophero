-- Server-held proposed Admin mutations awaiting merchant approval (replayed exactly).
CREATE TABLE "PendingMutation" (
    "shop" TEXT NOT NULL,
    "mutations" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingMutation_pkey" PRIMARY KEY ("shop")
);
