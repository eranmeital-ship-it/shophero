import db from "../db.server";
import type { ActionPlanData, PlanItem } from "./plan-routes";

/** Persistence for the routed action-plan checklist. */

function serialize(row: { id: string; goal: string; status: string; items: string; createdAt: Date; updatedAt: Date }): ActionPlanData {
  let items: PlanItem[] = [];
  try {
    items = JSON.parse(row.items) as PlanItem[];
  } catch {
    items = [];
  }
  return { id: row.id, goal: row.goal, status: row.status, items, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** The shop's current (most-recently-updated, non-archived) plan, if any. */
export async function getCurrentPlan(shop: string): Promise<ActionPlanData | null> {
  const row = await db.actionPlan.findFirst({ where: { shop, status: { not: "archived" } }, orderBy: { updatedAt: "desc" } });
  return row ? serialize(row) : null;
}

export async function createPlan(shop: string, goal: string, items: PlanItem[]): Promise<ActionPlanData> {
  // Archive any prior active plan so there's a single current roadmap.
  await db.actionPlan.updateMany({ where: { shop, status: "active" }, data: { status: "archived" } }).catch(() => {});
  const row = await db.actionPlan.create({ data: { shop, goal: goal.slice(0, 500), status: "active", items: JSON.stringify(items) } });
  return serialize(row);
}

/** Patch a single item (status / ship record / actual cost) and re-derive plan status. */
export async function updatePlanItem(shop: string, planId: string, itemId: string, patch: Partial<PlanItem>): Promise<ActionPlanData | null> {
  const row = await db.actionPlan.findFirst({ where: { id: planId, shop } });
  if (!row) return null;
  let items: PlanItem[] = [];
  try {
    items = JSON.parse(row.items) as PlanItem[];
  } catch {
    items = [];
  }
  items = items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
  const allResolved = items.length > 0 && items.every((it) => it.status === "done" || it.status === "skipped");
  const status = allResolved ? "done" : "active";
  const updated = await db.actionPlan.update({ where: { id: planId }, data: { items: JSON.stringify(items), status } });
  return serialize(updated);
}

export async function archivePlan(shop: string, planId: string): Promise<void> {
  await db.actionPlan.updateMany({ where: { id: planId, shop }, data: { status: "archived" } }).catch(() => {});
}
