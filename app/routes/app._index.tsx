import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopProfile } from "../lib/onboarding.server";

/**
 * Post-install entry. First-time installs land on the scan-first onboarding
 * (which extracts the store, scores AI-readiness, and shows the fix-and-grow
 * plan). Returning merchants go straight to the AI-Readiness dashboard.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const profile = await getShopProfile(session.shop).catch(() => null);
  if (!profile?.onboardedAt) return redirect(`/app/onboarding?${qs}`);
  return redirect(`/app/readiness?${qs}`);
}

export default function Index() {
  return null;
}
