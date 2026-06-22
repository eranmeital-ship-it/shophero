-- Per-shop encrypted stock-image (Pexels/Unsplash) API key + provider.
ALTER TABLE "Session" ADD COLUMN "stockKey" TEXT;
ALTER TABLE "Session" ADD COLUMN "stockProvider" TEXT;
