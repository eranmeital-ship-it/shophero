import type { MetaFunction } from "react-router";

import { LegalPage } from "../components/legal-page";

export const meta: MetaFunction = () => [
  { title: "Terms of Service — ShopHero" },
  { name: "description", content: "The terms that govern your use of ShopHero." },
];

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="June 2026">
      <p>
        These Terms govern your use of ShopHero. By installing or using the app, you agree to
        them. If you don't agree, please don't use ShopHero.
      </p>

      <h2>The service</h2>
      <p>
        ShopHero is an AI assistant that analyzes your Shopify store and, with your approval,
        helps you make changes - including theme edits, product and page content, SEO, and
        related optimizations.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You control your store and are responsible for reviewing and approving changes before they go live</li>
        <li>You keep your Shopify account and credentials secure</li>
        <li>You use ShopHero in compliance with Shopify's terms and all applicable laws</li>
      </ul>

      <h2>AI output</h2>
      <p>
        ShopHero generates content and edits using AI, which may occasionally be inaccurate or
        imperfect. Every change is <strong>staged for your approval</strong> and is
        <strong> reversible</strong> through version history. You are responsible for reviewing
        output before publishing. We do not guarantee specific business results, such as
        particular increases in sales, traffic, or rankings.
      </p>

      <h2>Billing</h2>
      <p>
        ShopHero is $49/month, billed through Shopify Billing, and includes $15 of AI usage
        each billing period. Usage beyond the included amount is billed pay-as-you-go in
        capped top-ups, so you're only charged for what you use. You can cancel anytime from
        Shopify; charges already incurred are non-refundable except where required by law or
        Shopify policy.
      </p>
      <p>
        <strong>How AI usage is measured.</strong> AI tasks consume third-party model usage
        as they run. You are charged for the AI compute actually used by a task — <strong>including
        tasks that you stop, that time out, or that don&apos;t finish or fully apply</strong> — because
        that compute is consumed regardless of the outcome. We meter usage transparently; you can
        review it any time on the <strong>Usage</strong> page, and per-shop daily and monthly
        spend caps protect you from runaway cost. To keep usage low, prefer small, focused
        operations and let large, catalog-wide work run through the one-click bulk tools and
        scheduled jobs, which process your whole store cheaply in the background.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don't use ShopHero for unlawful, infringing, harmful, or abusive purposes, and don't
        attempt to disrupt or misuse the service or its AI.
      </p>

      <h2>Intellectual property</h2>
      <p>
        ShopHero and its software remain our property. Your store and your content remain
        yours, and content generated for your store is yours to use for your store.
      </p>

      <h2>Disclaimers &amp; liability</h2>
      <p>
        The service is provided “as is,” without warranties of any kind. To the maximum extent
        permitted by law, ShopHero is not liable for indirect, incidental, or consequential
        damages, or for losses arising from changes you approve and publish.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using ShopHero at any time by uninstalling it. We may suspend or end the
        service for violations of these Terms.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms as the service evolves; we'll post changes here with a new
        “last updated” date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Reach us through our <a href="/contact">contact page</a>.
      </p>
    </LegalPage>
  );
}
