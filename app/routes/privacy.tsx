import type { MetaFunction } from "react-router";

import { LegalPage } from "../components/legal-page";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — ShopHero" },
  { name: "description", content: "How ShopHero collects, uses, and protects your data." },
];

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="June 2026">
      <p>
        ShopHero (“ShopHero,” “we,” “us”) is an AI assistant for Shopify merchants. This
        policy explains what data we access, how we use it, and the choices you have. By
        installing or using ShopHero, you agree to this policy.
      </p>

      <h2>What we access</h2>
      <p>
        ShopHero connects to your store through Shopify's official Admin API, using only the
        permissions (scopes) you approve at install. Depending on those scopes, this can
        include your theme files, products, collections, pages and blog content, and store
        metadata. We act on your store on your behalf to produce and - with your approval -
        apply the changes you request.
      </p>

      <h2>How we use AI</h2>
      <p>
        To generate recommendations and edits, relevant store content and metadata are sent
        to our AI provider, <strong>Anthropic</strong> (the Claude API). Anthropic processes
        this data to return results and <strong>does not use API data to train its models</strong>.
        We select the appropriate Claude model for each task to balance quality and cost.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your store domain and access token (stored securely / encrypted)</li>
        <li>Your settings, Brand Kit, and any long-term “memory” you provide</li>
        <li>Drafts, generated content, and version history of changes</li>
        <li>Usage and billing events needed to operate and bill the service</li>
      </ul>
      <p>
        We deliberately avoid processing your customers' personal data and do not require
        access to orders or buyer information to run ShopHero.
      </p>

      <h2>Service providers (subprocessors)</h2>
      <ul>
        <li><strong>Shopify</strong> — the platform your store and our app run on</li>
        <li><strong>Anthropic</strong> — AI processing (Claude)</li>
        <li>Our cloud hosting and database providers, used to run the service</li>
        <li>Billing is handled through <strong>Shopify Billing</strong></li>
      </ul>

      <h2>Data retention &amp; deletion</h2>
      <p>
        We retain your data while ShopHero is installed. When you uninstall, we delete your
        store's data in response to Shopify's app-uninstalled webhook, and we honor Shopify's
        mandatory customer data-request and erasure webhooks. You can request deletion at any
        time through our <a href="/contact">contact page</a>.
      </p>

      <h2>Security</h2>
      <p>
        We use Shopify's official APIs with least-privilege scopes, encrypt sensitive
        credentials, and transmit data over secure connections. No system is perfectly
        secure, but we work to protect your information.
      </p>

      <h2>Your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your data. Contact us and
        we'll respond within a reasonable timeframe.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy as the service evolves. Material changes will be posted on
        this page with a new “last updated” date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Reach us through our <a href="/contact">contact page</a>.
      </p>
    </LegalPage>
  );
}
