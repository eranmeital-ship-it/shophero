import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Scan-first onboarding: the app's landing is the AI-Readiness Score — the hook,
 * not a plan gate or questionnaire. /app simply redirects there. (Pricing and
 * onboarding apply later, when the merchant goes to work in the Editor.)
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  return redirect(`/app/readiness?${url.searchParams.toString()}`);
}

export default function Index() {
  return null;
}
