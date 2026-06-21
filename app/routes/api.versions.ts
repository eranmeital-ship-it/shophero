import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listVersions, workspaceDir } from "../lib/workspace.server";

/** Version history (restore points) for the History drawer. */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const versions = await listVersions(workspaceDir(session.shop)).catch(() => []);
  return { versions };
}
