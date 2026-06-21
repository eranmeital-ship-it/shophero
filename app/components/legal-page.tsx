import { type ReactNode } from "react";
import { Link } from "react-router";

import styles from "./legal-page.module.css";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link to="/" className={styles.brand}>
          <img src="/ShopHero.png" alt="" className={styles.logo} /> ShopHero
        </Link>
        <nav className={styles.navLinks}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <h1 className={styles.h1}>{title}</h1>
        {updated && <p className={styles.updated}>Last updated: {updated}</p>}
        <div className={styles.body}>{children}</div>
      </main>

      <footer className={styles.footer}>
        <nav className={styles.footLinks}>
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <p className={styles.copy}>© {new Date().getFullYear()} ShopHero · shophero.io</p>
      </footer>
    </div>
  );
}
