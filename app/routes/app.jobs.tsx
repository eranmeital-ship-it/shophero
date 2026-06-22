import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

/** Scheduled Jobs was merged into Activity. Keep the URL working for old links. */
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  return redirect(`/app/activity?${url.searchParams.toString()}`);
}
