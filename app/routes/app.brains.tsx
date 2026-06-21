import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { BRAIN_INFO } from "../lib/knowledge-tools.server";
import { getAllBrainDocs, setBrainDoc } from "../lib/brain-docs.server";
import "../styles/shophero.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const docs = await getAllBrainDocs(session.shop);
  const brains = BRAIN_INFO.map((b) => ({ ...b, content: docs.find((d) => d.brain === b.name)?.content ?? "" }));
  return { brains };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await Promise.all(
    BRAIN_INFO.map((b) => setBrainDoc(session.shop, b.name, String(form.get(`brain:${b.name}`) ?? ""))),
  );
  return { saved: true };
}

export default function Brains() {
  const { brains } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const saving = nav.state !== "idle";

  return (
    <div className="sh-docbg">
      <div className="sh-doc">
        <div className="sh-doc-kicker">Brains</div>
        <h1>Train your ShopHero brains</h1>
        <p className="sh-doc-lead">
          Each tool runs on an expert knowledge base. Paste your own best practices, rules, and
          examples — your "brain bible" — for any module. ShopHero treats it as the <strong>highest
          priority</strong> and loads it only when that tool runs (so it stays fast and cheap).
        </p>

        <Form method="post">
          {brains.map((b) => (
            <div className="sh-card" key={b.name}>
              <h3><span className="sh-card-emoji">🧠</span> {b.title}</h3>
              <p style={{ marginTop: -2, marginBottom: 10, color: "var(--sh-ink-soft)", fontSize: 13, lineHeight: 1.5 }}>{b.desc}</p>
              <textarea
                name={`brain:${b.name}`}
                defaultValue={b.content}
                className="sh-ob-input sh-ob-textarea"
                rows={5}
                placeholder={`Paste custom ${b.title} knowledge for your store — frameworks, rules, swipe copy, do/don'ts…`}
              />
            </div>
          ))}
          <div style={{ marginTop: 4 }}>
            <button className="sh-btn sh-btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save brains"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
