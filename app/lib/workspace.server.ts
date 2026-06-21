import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, access } from "node:fs/promises";
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

/**
 * True if the workspace exists as its OWN git repo. We check for `dir/.git`
 * directly rather than `git rev-parse --is-inside-work-tree`, because the
 * latter returns true when the workspace merely sits inside an ancestor repo
 * (e.g. when DRIFT_WORKSPACE_ROOT is under the project repo) — which would make
 * us skip the theme pull and leave the workspace empty.
 */
export async function isInitialized(dir: string): Promise<boolean> {
  try {
    await access(path.join(dir, ".git"));
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

/** Unified diff of all pending changes vs the baseline (incl. new files). */
export async function workspaceDiff(dir: string): Promise<string> {
  // intent-to-add marks new files so they appear in the diff; non-destructive.
  await git(dir, "add", "-A", "-N").catch(() => {});
  const { stdout } = await git(dir, "diff");
  return stdout;
}

export interface Version {
  sha: string;
  date: string; // ISO commit date
  label: string; // commit subject (e.g. "applied 3 file(s) to dev theme")
  files: number; // files changed in that commit
}

/**
 * Restore points = the git history of the working copy. Every Apply commits a
 * snapshot (see api.apply), so each commit is a theme state that was once live
 * on the dev theme — exactly what "roll back to" means.
 */
export async function listVersions(dir: string, limit = 40): Promise<Version[]> {
  if (!(await isInitialized(dir))) return [];
  const { stdout } = await git(dir, "log", `-n`, String(limit), "--pretty=format:%H%x09%cI%x09%s");
  const rows = stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, date, ...rest] = l.split("\t");
      return { sha, date, label: rest.join("\t") };
    });
  const out: Version[] = [];
  for (const r of rows) {
    let files = 0;
    try {
      const { stdout: f } = await git(dir, "diff-tree", "--no-commit-id", "--name-only", "-r", r.sha);
      files = f.split("\n").filter(Boolean).length;
    } catch {
      /* root commit etc. */
    }
    out.push({ ...r, files });
  }
  return out;
}

/**
 * Bring the working tree back to the content of `sha`, returning the theme-asset
 * keys that differ from the last-applied state (== what must be pushed to the
 * theme to make the rollback live). Any uncommitted pending work is saved as its
 * own restore point first, so a rollback is always reversible.
 *
 * Note: this restores file CONTENT. Files added after `sha` are left in place
 * (not deleted) — rollback undoes edits; it doesn't remove net-new files.
 */
export async function restoreToVersion(dir: string, sha: string): Promise<string[]> {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error("Invalid version id");
  if ((await changedFiles(dir)).length) await commitBaseline(dir, "auto-saved before rollback");
  await git(dir, "checkout", sha, "--", ".");
  return changedFiles(dir);
}

/**
 * Undo ONE change in place — reverts just that commit while keeping every later
 * change (a true single-change undo, via `git revert`). Returns the theme-asset
 * keys to push.
 *
 * Conflict-safe: if a LATER change touched the same lines, the revert can't apply
 * cleanly. We detect that, restore the tree to a clean state, and throw
 * Error("CONFLICT") so the caller can tell the merchant to use "Revert to here"
 * (or undo the newer change first) instead of leaving anything half-applied.
 */
export async function undoCommit(dir: string, sha: string): Promise<string[]> {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error("Invalid version id");
  if (!(await isInitialized(dir))) throw new Error("No history yet");
  // Park any pending work so the revert applies to a clean tree (and stays reversible).
  if ((await changedFiles(dir)).length) await commitBaseline(dir, "auto-saved before undo");

  try {
    await git(dir, "revert", "--no-commit", sha);
  } catch {
    // Conflict (or a merge commit): roll the working tree fully back to clean.
    await git(dir, "revert", "--abort").catch(() => {});
    await git(dir, "reset", "--hard", "HEAD").catch(() => {});
    throw new Error("CONFLICT");
  }

  const toPush = await changedFiles(dir);
  await commitBaseline(dir, `undid ${sha.slice(0, 7)}`);
  return toPush;
}
