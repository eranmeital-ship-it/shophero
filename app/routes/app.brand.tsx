import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { getBrandKit, getMemory, saveBrandKit, setMemory, type BrandKit } from "../lib/brand.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const [kit, memory] = await Promise.all([getBrandKit(session.shop), getMemory(session.shop)]);
  return { kit, memory };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const lines = (k: string) =>
    String(form.get(k) ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const csv = (k: string) =>
    String(form.get(k) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const kit: BrandKit = {
    colors: csv("colors"),
    fonts: csv("fonts"),
    voice: String(form.get("voice") ?? "").trim(),
    audience: String(form.get("audience") ?? "").trim(),
    dos: lines("dos"),
    donts: lines("donts"),
    notes: String(form.get("notes") ?? "").trim(),
  };
  await saveBrandKit(session.shop, kit);
  await setMemory(session.shop, lines("memory"));
  return { saved: true };
}

export default function Brand() {
  const { kit, memory } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const saving = nav.state !== "idle";

  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <div className="sh-doc-kicker">Brand</div>
        <h1>Brand Kit &amp; Memory</h1>
        <p className="sh-doc-lead">
          ShopHero respects these on every change — voice, colors, fonts, and your do/don&apos;t rules —
          so everything it builds stays on-brand. It also remembers durable facts about your store across
          conversations; edit or clear them anytime.
        </p>

        <Form method="post">
          <div className="sh-card">
            <h3><span className="sh-card-emoji">🎨</span> Brand kit</h3>

            <label className="sh-ob-field">
              <span>Voice / tone</span>
              <input name="voice" defaultValue={kit.voice} className="sh-ob-input" placeholder="e.g. warm, premium, confident" />
            </label>
            <label className="sh-ob-field">
              <span>Audience</span>
              <input name="audience" defaultValue={kit.audience} className="sh-ob-input" placeholder="e.g. design-conscious home cooks, 28–45" />
            </label>
            <div className="sh-ob-row">
              <label className="sh-ob-field">
                <span>Brand colors <em>(comma-separated)</em></span>
                <input name="colors" defaultValue={kit.colors.join(", ")} className="sh-ob-input" placeholder="#1a1a1a, #34c759, off-white" />
              </label>
              <label className="sh-ob-field">
                <span>Fonts <em>(comma-separated)</em></span>
                <input name="fonts" defaultValue={kit.fonts.join(", ")} className="sh-ob-input" placeholder="Inter, Playfair Display" />
              </label>
            </div>
            <div className="sh-ob-row">
              <label className="sh-ob-field">
                <span>Always <em>(one per line)</em></span>
                <textarea name="dos" defaultValue={kit.dos.join("\n")} className="sh-ob-input sh-ob-textarea" rows={4} placeholder={"Keep CTAs benefit-led\nUse our green for primary buttons"} />
              </label>
              <label className="sh-ob-field">
                <span>Never <em>(one per line)</em></span>
                <textarea name="donts" defaultValue={kit.donts.join("\n")} className="sh-ob-input sh-ob-textarea" rows={4} placeholder={"No stock-photo people\nNever change checkout"} />
              </label>
            </div>
            <label className="sh-ob-field">
              <span>Notes</span>
              <textarea name="notes" defaultValue={kit.notes} className="sh-ob-input sh-ob-textarea" rows={3} placeholder="Anything else the agent should always keep in mind…" />
            </label>
          </div>

          <div className="sh-card">
            <h3><span className="sh-card-emoji">🧠</span> What ShopHero remembers</h3>
            <p style={{ marginTop: -2, marginBottom: 12 }}>
              Durable facts the agent has saved (or you add). One per line — delete any line to forget it.
            </p>
            <textarea
              name="memory"
              defaultValue={memory.join("\n")}
              className="sh-ob-input sh-ob-textarea"
              rows={Math.min(12, Math.max(4, memory.length + 1))}
              placeholder="Nothing remembered yet — facts you tell the agent to remember will appear here."
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <button className="sh-btn sh-btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save brand kit"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
