import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigation, Form } from "react-router";
import { isAdmin } from "../lib/admin.server";
import { AdminNav } from "../components/admin-nav";
import { networkStats, buildRings, verifyEdges } from "../lib/link-exchange.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  if (!isAdmin(request)) throw redirect("/admin/login");
  return networkStats();
}

export async function action({ request }: ActionFunctionArgs) {
  if (!isAdmin(request)) throw redirect("/admin/login");
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "rebuild") await buildRings();
  else if (intent === "verify") await verifyEdges();
  return redirect("/admin/links");
}

const short = (s: string) => s.replace(/\.myshopify\.com$/, "");
const statusStyle = (st: string): React.CSSProperties => ({
  fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em",
  color: st === "live" ? "#16a34a" : st === "missing" ? "#e0457f" : "#8a7d1a",
});

export default function AdminLinks() {
  const d = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const stat: React.CSSProperties = { background: "#fff", border: "1px solid #e1e3e5", borderRadius: 14, padding: "16px 18px", minWidth: 120 };
  const num: React.CSSProperties = { fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, Inter, sans-serif" }}>
      <AdminNav active="network" />
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "18px 0 4px" }}>Link Network</h1>
      <p style={{ color: "#6d7175", marginBottom: 18, fontSize: 14 }}>The 3-way (A→B→C→A) link exchange across all member stores.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={stat}><div style={num}>{d.active}</div><div style={{ color: "#6d7175", fontSize: 13 }}>active members</div></div>
        <div style={stat}><div style={num}>{d.rings}</div><div style={{ color: "#6d7175", fontSize: 13 }}>rings</div></div>
        <div style={stat}><div style={{ ...num, color: "#16a34a" }}>{d.live}</div><div style={{ color: "#6d7175", fontSize: 13 }}>links live</div></div>
        <div style={stat}><div style={{ ...num, color: "#e0457f" }}>{d.missing}</div><div style={{ color: "#6d7175", fontSize: 13 }}>links missing</div></div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <Form method="post"><input type="hidden" name="intent" value="rebuild" />
          <button className="sh-btn sh-btn-dark" disabled={busy}>{busy ? "Working…" : "Rebuild rings"}</button>
        </Form>
        <Form method="post"><input type="hidden" name="intent" value="verify" />
          <button className="sh-btn" disabled={busy}>{busy ? "Working…" : "Verify all links"}</button>
        </Form>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>Members ({d.members.length})</h2>
      <div style={{ overflowX: "auto", marginBottom: 28 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: "#6d7175", borderBottom: "1px solid #e1e3e5" }}>
            <th style={{ padding: "8px 10px" }}>Store</th><th style={{ padding: "8px 10px" }}>Status</th><th style={{ padding: "8px 10px" }}>Keywords</th>
          </tr></thead>
          <tbody>
            {d.members.map((m) => (
              <tr key={m.shop} style={{ borderBottom: "1px solid #f0f1f3" }}>
                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{short(m.shop)}</td>
                <td style={{ padding: "8px 10px" }}>{m.status}</td>
                <td style={{ padding: "8px 10px", color: "#6d7175" }}>{m.keywords || "—"}</td>
              </tr>
            ))}
            {d.members.length === 0 && <tr><td colSpan={3} style={{ padding: "14px 10px", color: "#9da2a8" }}>No members yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>Edges ({d.edges.length})</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: "#6d7175", borderBottom: "1px solid #e1e3e5" }}>
            <th style={{ padding: "8px 10px" }}>Gives</th><th style={{ padding: "8px 10px" }}>→ To</th><th style={{ padding: "8px 10px" }}>Anchor</th><th style={{ padding: "8px 10px" }}>Status</th><th style={{ padding: "8px 10px" }}>Ring</th>
          </tr></thead>
          <tbody>
            {d.edges.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid #f0f1f3" }}>
                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{short(e.fromShop)}</td>
                <td style={{ padding: "8px 10px" }}>{short(e.toShop)}</td>
                <td style={{ padding: "8px 10px", color: "#6d7175" }}>{e.anchor}</td>
                <td style={{ padding: "8px 10px" }}><span style={statusStyle(e.status)}>{e.status}</span></td>
                <td style={{ padding: "8px 10px", color: "#9da2a8", fontSize: 11 }}>{e.ringId.slice(0, 14)}</td>
              </tr>
            ))}
            {d.edges.length === 0 && <tr><td colSpan={5} style={{ padding: "14px 10px", color: "#9da2a8" }}>No edges yet — add members and rebuild rings.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
