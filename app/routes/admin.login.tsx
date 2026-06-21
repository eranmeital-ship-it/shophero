import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useLoaderData, Form } from "react-router";
import { adminConfigured, checkPassword, isAdmin, adminSetCookie } from "../lib/admin.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  if (isAdmin(request)) throw redirect("/admin");
  return { configured: adminConfigured() };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const pw = String(form.get("password") ?? "");
  if (!checkPassword(pw)) {
    return data({ error: "Incorrect password." }, { status: 401 });
  }
  return redirect("/admin", { headers: { "Set-Cookie": adminSetCookie() } });
}

export default function AdminLogin() {
  const { configured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="sh-docbg" style={{ display: "grid", placeItems: "center" }}>
      <div style={{ width: 360, maxWidth: "90vw" }}>
        <div className="sh-card">
          <div className="sh-doc-kicker">ShopHero</div>
          <h3 style={{ fontSize: 20, marginTop: 4 }}>Admin console</h3>
          {configured ? (
            <Form method="post" className="sh-field" style={{ marginTop: 14 }}>
              <label className="sh-label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="sh-text-input" autoComplete="off" autoFocus required />
              {actionData?.error && <div className="sh-err">{actionData.error}</div>}
              <div>
                <button className="sh-btn sh-btn-dark" type="submit">Sign in</button>
              </div>
            </Form>
          ) : (
            <p style={{ marginTop: 10 }} className="sh-hint">
              The admin console is locked. Set <code>ADMIN_PASSWORD</code> in your environment to enable it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
