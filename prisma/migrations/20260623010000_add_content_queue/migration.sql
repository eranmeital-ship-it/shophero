-- Deep content-strategy plan: a prioritized AI-answer drip queue + strategy summary.
ALTER TABLE "ContentPlan" ADD COLUMN "strategySummary" TEXT;
ALTER TABLE "ContentPlan" ADD COLUMN "queue" TEXT NOT NULL DEFAULT '[]';
