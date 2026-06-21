import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { workspaceDir, workspaceDiff } from "../lib/workspace.server";

/** Returns the unified diff of pending theme changes for the diff drawer. */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const diff = await workspaceDiff(workspaceDir(session.shop));
  return Response.json({ diff });
}
