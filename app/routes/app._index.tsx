import { useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureReady } from "../lib/bootstrap.server";
import { previewUrl } from "../lib/theme.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const ctx = { shop: session.shop, accessToken: session.accessToken! };
  const { themeId } = await ensureReady(ctx);
  return { shop: session.shop, themeId, preview: previewUrl(session.shop, themeId) };
}

interface Msg { role: "user" | "assistant"; text: string; tools?: string[] }
interface ChatData { assistantText: string; toolEvents: string[]; pending: string[] }
interface ApplyData { applied: number; message?: string }

export default function Index() {
  const { shop, preview } = useLoaderData<typeof loader>();
  const chat = useFetcher<ChatData>();
  const apply = useFetcher<ApplyData>();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [frameKey, setFrameKey] = useState(0); // bump to reload the iframe
  const scroller = useRef<HTMLDivElement>(null);

  const thinking = chat.state !== "idle";
  const applying = apply.state !== "idle";

  // Fold each completed chat turn into the transcript + pending changes.
  useEffect(() => {
    if (chat.state === "idle" && chat.data) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: chat.data!.assistantText, tools: chat.data!.toolEvents },
      ]);
      setPending(chat.data.pending ?? []);
    }
  }, [chat.state, chat.data]);

  // After a successful apply, refresh the preview and clear the pending list.
  useEffect(() => {
    if (apply.state === "idle" && apply.data?.applied) {
      setPending([]);
      setFrameKey((k) => k + 1);
    }
  }, [apply.state, apply.data]);

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [messages, thinking]);

  function send() {
    const prompt = input.trim();
    if (!prompt || thinking) return;
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    chat.submit({ prompt }, { method: "post", action: "/api/chat" });
  }

  return (
    <div style={S.shell}>
      {/* Left: chat */}
      <div style={S.panel}>
        <div style={S.header}>Drift — editing a copy of {shop}</div>

        <div ref={scroller} style={S.transcript}>
          {messages.length === 0 && (
            <p style={S.hint}>
              Describe a change to your store. e.g. “Add trust badges under the
              add-to-cart button on the product page.”
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={m.role === "user" ? S.user : S.assistant}>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
              {m.tools && m.tools.length > 0 && (
                <div style={S.tools}>{m.tools.join("  ·  ")}</div>
              )}
            </div>
          ))}
          {thinking && <div style={S.assistant}>Working…</div>}
        </div>

        {pending.length > 0 && (
          <div style={S.pendingBar}>
            <span>{pending.length} change(s) ready</span>
            <button
              style={S.apply}
              disabled={applying}
              onClick={() => apply.submit({}, { method: "post", action: "/api/apply" })}
            >
              {applying ? "Applying…" : "Apply to dev theme"}
            </button>
          </div>
        )}

        <div style={S.composer}>
          <textarea
            style={S.textarea}
            value={input}
            placeholder="Ask Drift to change something…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button style={S.send} onClick={send} disabled={thinking}>Send</button>
        </div>
      </div>

      {/* Right: live preview of the dev theme */}
      <div style={S.previewWrap}>
        <div style={S.previewHeader}>
          <span>Preview (dev theme)</span>
          <a href={preview} target="_blank" rel="noreferrer" style={S.openLink}>
            Open in new tab ↗
          </a>
        </div>
        {/* If the storefront refuses to be framed, the "Open in new tab" link
            is the fallback. */}
        <iframe key={frameKey} title="preview" src={preview} style={S.iframe} />
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: { display: "grid", gridTemplateColumns: "380px 1fr", height: "100vh" },
  panel: { display: "flex", flexDirection: "column", borderRight: "1px solid #e1e3e5", minWidth: 0 },
  header: { padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid #e1e3e5" },
  transcript: { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  hint: { color: "#6d7175", fontSize: 14 },
  user: { alignSelf: "flex-end", background: "#1a1a1a", color: "#fff", padding: "8px 12px", borderRadius: 12, maxWidth: "85%" },
  assistant: { alignSelf: "flex-start", background: "#f1f1f1", padding: "8px 12px", borderRadius: 12, maxWidth: "85%", fontSize: 14 },
  tools: { marginTop: 6, fontSize: 12, color: "#6d7175", fontFamily: "monospace" },
  pendingBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid #e1e3e5", background: "#fafafa", fontSize: 14 },
  apply: { background: "#008060", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
  composer: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e1e3e5" },
  textarea: { flex: 1, resize: "none", height: 60, padding: 8, borderRadius: 8, border: "1px solid #c9cccf", fontFamily: "inherit", fontSize: 14 },
  send: { background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", cursor: "pointer" },
  previewWrap: { display: "flex", flexDirection: "column", minWidth: 0 },
  previewHeader: { display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e1e3e5", fontSize: 14 },
  openLink: { color: "#2c6ecb", textDecoration: "none" },
  iframe: { flex: 1, width: "100%", border: "none" },
};
