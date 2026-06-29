import { Form } from "react-router";

export function AdminNav({ active }: { active: "dashboard" | "shops" | "network" }) {
  return (
    <div className="sh-admin-nav">
      <div className="sh-admin-tabs">
        <a href="/admin" className={`sh-tab ${active === "dashboard" ? "sh-tab-on" : ""}`}>
          Dashboard
        </a>
        <a href="/admin/shops" className={`sh-tab ${active === "shops" ? "sh-tab-on" : ""}`}>
          Shops
        </a>
        <a href="/admin/links" className={`sh-tab ${active === "network" ? "sh-tab-on" : ""}`}>
          Link Network
        </a>
      </div>
      <Form method="post" action="/admin">
        <button className="sh-btn" style={{ background: "linear-gradient(180deg,#fff,#eef1f5)", color: "var(--sh-ink)" }}>
          Sign out
        </button>
      </Form>
    </div>
  );
}
