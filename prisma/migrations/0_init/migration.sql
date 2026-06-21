-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    "plan" TEXT,
    "anthropicApiKey" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "plan" TEXT,
    "model" TEXT,
    "kind" TEXT,
    "costUsd" DOUBLE PRECISION,
    "billedUsd" DOUBLE PRECISION,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopProfile" (
    "shop" TEXT NOT NULL,
    "onboardedAt" TIMESTAMP(3),
    "dataConsentAt" TIMESTAMP(3),
    "goals" TEXT,
    "data" TEXT,
    "recommendations" TEXT,
    "brandKit" TEXT,
    "memory" TEXT,
    "agentSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopProfile_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "StoreReport" (
    "shop" TEXT NOT NULL,
    "hash" TEXT,
    "scores" TEXT,
    "health" INTEGER,
    "breakdowns" TEXT,
    "history" TEXT,
    "issues" TEXT,
    "findings" TEXT,
    "summary" TEXT,
    "recommendations" TEXT,
    "model" TEXT,
    "costUsd" DOUBLE PRECISION,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreReport_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ContentPlan" (
    "shop" TEXT NOT NULL,
    "strategy" TEXT,
    "perDay" INTEGER NOT NULL DEFAULT 1,
    "days" INTEGER NOT NULL DEFAULT 30,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "draftTitle" TEXT,
    "draftBody" TEXT,
    "draftMeta" TEXT,
    "draftTopic" TEXT,
    "draftDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPlan_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "BrainDoc" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "brain" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrainDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "params" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "perDay" INTEGER NOT NULL DEFAULT 50,
    "dedupeKey" TEXT NOT NULL,
    "lastRunOn" TEXT,
    "doneToday" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "type" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_shop_idx" ON "UsageEvent"("shop");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrainDoc_shop_brain_key" ON "BrainDoc"("shop", "brain");

-- CreateIndex
CREATE INDEX "Job_shop_idx" ON "Job"("shop");

-- CreateIndex
CREATE INDEX "Job_dedupeKey_idx" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "AppEvent_createdAt_idx" ON "AppEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AppEvent_level_idx" ON "AppEvent"("level");

