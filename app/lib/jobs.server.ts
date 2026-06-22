import { createHash } from "node:crypto";
import type { Job } from "@prisma/client";

import db from "../db.server";
import { gql } from "./onboarding.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  JOB_TYPES,
  ACTIVE_STATUSES,
  todayKey,
  projectEta,
  isBulkRequest,
  classifyBulk,
  parseCount,
  type JobType,
} from "./jobs-types";

/**
 * Scheduled jobs = slow-release bulk work spread over days. Server-only (DB +
 * Shopify Admin API). Pure constants/helpers live in jobs-types (client-safe)
 * and are re-exported here so server callers have one import.
 */
export {
  JOB_TYPES,
  ACTIVE_STATUSES,
  INLINE_LIMIT,
  todayKey,
  projectEta,
  isBulkRequest,
  classifyBulk,
  parseCount,
} from "./jobs-types";
export type { JobType } from "./jobs-types";

export function dedupeKey(type: string, scope: string): string {
  return createHash("sha1").update(`${type}|${scope.trim().toLowerCase()}`).digest("hex").slice(0, 16);
}

/** Live product count for "treat big shops accordingly". 0 on failure. */
export async function getCatalogSize(admin: AdminApiContext): Promise<number> {
  const data = await gql<{ productsCount?: { count?: number } }>(admin, `{ productsCount { count } }`);
  return data?.productsCount?.count ?? 0;
}

export interface CreateJobInput {
  shop: string;
  type: JobType;
  title: string;
  total: number;
  scope: string; // free text used for dedupe (e.g. the original request)
  params?: unknown;
  perDay?: number;
}

/**
 * Create a job — or, if an identical one is already active, return it flagged as
 * existing ("already scheduled / pending"). This is the repeat-task guard.
 */
export async function getOrCreateJob(input: CreateJobInput): Promise<{ job: Job; existed: boolean }> {
  const key = dedupeKey(input.type, input.scope);
  const existing = await db.job.findFirst({
    where: { shop: input.shop, dedupeKey: key, status: { in: [...ACTIVE_STATUSES] } },
  });
  if (existing) return { job: existing, existed: true };

  const perDay = input.perDay ?? JOB_TYPES[input.type].perDay;
  const job = await db.job.create({
    data: {
      shop: input.shop,
      type: input.type,
      title: input.title,
      total: input.total,
      perDay,
      dedupeKey: key,
      params: input.params ? JSON.stringify(input.params) : null,
    },
  });
  return { job, existed: false };
}

export function listJobs(shop: string): Promise<Job[]> {
  return db.job.findMany({ where: { shop }, orderBy: [{ createdAt: "desc" }] });
}

export async function setJobStatus(shop: string, id: string, status: "paused" | "scheduled" | "canceled"): Promise<void> {
  await db.job.updateMany({ where: { id, shop }, data: { status } });
}

/** How many items of a type a shop may still process today (across all its jobs). */
export async function remainingToday(shop: string, type: JobType): Promise<number> {
  const limit = JOB_TYPES[type].perDay;
  const today = todayKey();
  const jobs = await db.job.findMany({ where: { shop, type, lastRunOn: today } });
  const used = jobs.reduce((a, j) => a + j.doneToday, 0);
  return Math.max(0, limit - used);
}

/** The merchant-facing message when a bulk ask is (or already is) scheduled. */
export function scheduledMessage(job: Job, existed: boolean, type: JobType): string {
  const unit = JOB_TYPES[type].unit;
  const { daysLeft, eta } = projectEta(job.total, job.completed, job.perDay);
  if (existed) {
    return (
      `📅 You already have this scheduled — **${job.title}**. ` +
      `It's ${job.completed.toLocaleString()}/${job.total.toLocaleString()} done, about ${daysLeft} day${daysLeft === 1 ? "" : "s"} left ` +
      `(done by ${eta}). I won't start a duplicate — track it under **Scheduled Jobs**.`
    );
  }
  return (
    `That's a big one — **${job.total.toLocaleString()} ${unit}**. Doing it all at once would be slow, costly, and risky for your ` +
    `live store, so I've **scheduled it to roll out safely at ${job.perDay}/day** — projected done by ~**${eta}**.\n\n` +
    `Why a slow rollout is better for your shop: gradual changes let Google re-index cleanly (big overnight rewrites can hurt rankings), ` +
    `let you watch results and catch anything off *before* it's live everywhere, and keep your store fast and stable. ` +
    `You can pause or cancel anytime under **Scheduled Jobs**.`
  );
}

/**
 * If the request is bulk AND bigger than a single day's quota, schedule it and
 * return the merchant message. Returns null to let the request run inline.
 */
export async function maybeScheduleBulk(prompt: string, admin: AdminApiContext, shop: string): Promise<string | null> {
  if (!isBulkRequest(prompt) && !parseCount(prompt)) return null;
  const type = classifyBulk(prompt);
  if (!type) return null;

  const perDay = JOB_TYPES[type].perDay;
  const explicit = parseCount(prompt);
  let total = explicit ?? 0;
  if (!total && type !== "content_articles") total = await getCatalogSize(admin).catch(() => 0);
  if (!total || total <= perDay) return null; // small enough → run inline now

  const title = `${JOB_TYPES[type].label} — ${total.toLocaleString()} ${JOB_TYPES[type].unit}`;
  // Dedupe on a STABLE scope, not the raw prompt — otherwise re-phrasing the same
  // ask ("rewrite all descriptions" vs "redo every product description") would
  // slip past the guard and create duplicate jobs for the same work.
  const scope = explicit ? `${type}:${total}` : `${type}:catalog`;
  const { job, existed } = await getOrCreateJob({ shop, type, title, total, scope, params: { prompt } });
  return scheduledMessage(job, existed, type);
}
