import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";

import { LegalPage } from "../components/legal-page";
import styles from "../components/legal-page.module.css";

export const meta: MetaFunction = () => [
  { title: "Contact — ShopHero" },
  { name: "description", content: "Get in touch with the ShopHero team." },
];

// Recipient lives only on the server — never rendered to the client.
const CONTACT_TO = "hello@shophero.io";

export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const name = String(fd.get("name") || "").trim();
  const email = String(fd.get("email") || "").trim();
  const message = String(fd.get("message") || "").trim();
  const honey = String(fd.get("company") || ""); // spam honeypot

  if (honey) return { ok: true }; // silently drop bots
  if (!email || !message) {
    return { ok: false, error: "Please add your email and a message." };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[contact] RESEND_API_KEY is not set — cannot send contact email");
    return { ok: false, error: "We couldn't send your message right now. Please try again later." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || "ShopHero <noreply@shophero.io>",
        to: [CONTACT_TO],
        reply_to: email,
        subject: `Contact form — ${name || email}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      }),
    });
    if (!res.ok) {
      console.error("[contact] resend error", res.status, await res.text());
      return { ok: false, error: "We couldn't send your message right now. Please try again later." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[contact] send failed", err);
    return { ok: false, error: "We couldn't send your message right now. Please try again later." };
  }
}

export default function Contact() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const sending = nav.state === "submitting";

  return (
    <LegalPage title="Contact us" updated="June 2026">
      <p>
        We'd love to hear from you - a question, a problem, or an idea for ShopHero. Send us a
        message below and we'll get back to you.
      </p>

      <h2>Send a message</h2>
      {data?.ok ? (
        <p className={styles.success}>
          Thanks! Your message is on its way - we'll get back to you soon.
        </p>
      ) : (
        <Form className={styles.form} method="post">
          {/* honeypot — hidden from real users */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ display: "none" }}
          />
          <div className={styles.field}>
            <label htmlFor="name">Your name</label>
            <input className={styles.input} id="name" name="name" type="text" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="email">Your email</label>
            <input className={styles.input} id="email" name="email" type="email" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="message">Message</label>
            <textarea className={styles.textarea} id="message" name="message" required />
          </div>
          {data?.error && <p className={styles.error}>{data.error}</p>}
          <button className={styles.button} type="submit" disabled={sending}>
            {sending ? "Sending…" : "Send message →"}
          </button>
        </Form>
      )}

      <h2>Privacy &amp; data requests</h2>
      <p>
        For privacy questions or data deletion requests, use the form above and we'll handle
        it. See our <a href="/privacy">Privacy Policy</a> for details.
      </p>

      <h2>Billing</h2>
      <p>
        ShopHero is billed through Shopify, so subscription and payment details live in your
        Shopify admin. For anything else, send us a message above.
      </p>

      <h2>More</h2>
      <p>
        Read our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>,
        or head back to the <a href="/">homepage</a>.
      </p>
    </LegalPage>
  );
}
