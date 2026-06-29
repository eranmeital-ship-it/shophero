-- Add auto-publish flag to ContentPlan
ALTER TABLE "ContentPlan" ADD COLUMN "autoPublish" BOOLEAN NOT NULL DEFAULT false;
