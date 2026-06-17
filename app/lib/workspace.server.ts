import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);

const ROOT = process.env.DRIFT_WORKSPACE_ROOT ?? path.resolve(".drift-workspaces");

/**
 * A workspace is a scratch git repo holding the pulled dev-theme files for one
 * shop. git is what gives us a clean "what did the agent change this turn" diff:
 * after pulling the theme we commit a baseline, the agent edits the working tree,
 * and uncommitted changes == the proposed change to apply.
 */

function safeShop(shop: string): string {
  return shop.replace(/[^a-z0-9.-]/gi, "_");
}

export function workspaceDir(shop: string): string {
  return path.join(ROOT, safeShop(shop));
}

async function git(dir: string, ...args: string[]) {
  return exec("git", ["-C", dir, ...args]);
}

/** True if the workspace already exists as a git repo. */
export async function isInitialized(dir: string): Promise<boolean> {
  try {
    await git(dir, "rev-parse", "--is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Commit everything currently in the working tree as the new baseline. */
export async function commitBaseline(dir: string, message: string): Promise<void> {
  if (!(await isInitialized(dir))) {
    await git(dir, "init", "-q");
    await git(dir, "config", "user.email", "drift@local");
    await git(dir, "config", "user.name", "Drift");
  }
  await git(dir, "add", "-A");
  // `commit` fails if there is nothing staged; ignore that case.
  try {
    await git(dir, "commit", "-q", "-m", message);
  } catch {
    /* nothing to commit */
  }
}

/** Theme-asset keys (e.g. "sections/header.liquid") changed since the baseline. */
export async function changedFiles(dir: string): Promise<string[]> {
  const { stdout } = await git(dir, "status", "--porcelain");
  return stdout
    .split("\n")
    .map((line) => line.slice(3).trim()) // strip the XY status prefix
    .filter(Boolean);
}
