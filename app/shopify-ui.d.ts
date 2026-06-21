// Minimal React JSX typings for the Shopify Polaris web components this app uses.
// @shopify/polaris-types only augments Preact's JSX namespace, so in a React
// (React Router) project these custom elements aren't recognized without this.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type SElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": SElement;
      "s-link": SElement;
      "s-page": SElement;
      "s-section": SElement;
      "s-text-field": SElement;
      "s-button": SElement;
    }
  }
}

// Vite ?raw imports (e.g. knowledge markdown bundled as a string).
declare module "*.md?raw" {
  const content: string;
  export default content;
}

export {};
