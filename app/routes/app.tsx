import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/* App Bridge nav (ui-nav-menu): renders in the admin chrome and navigates
          client-side via React Router, so the embedded session/token is kept.
          Plain <s-link href> did full reloads that dropped host/id_token and
          dead-ended on the login screen. */}
      <NavMenu>
        <Link to="/app" rel="home">Control Center</Link>
        <Link to="/app/content">Content calendar</Link>
        <Link to="/app/authority">Authority &amp; PR</Link>
        <Link to="/app/pricing">Plans &amp; upgrade</Link>
        <Link to="/app/activity">Activity</Link>
        <Link to="/app/usage">Usage &amp; billing</Link>
        <Link to="/app/tutorials">Learn</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
