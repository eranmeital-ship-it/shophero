-- Add per-shop encrypted theme token for theme writes.
ALTER TABLE "Session" ADD COLUMN "themeToken" TEXT;
