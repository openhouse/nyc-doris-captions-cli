import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'NYC Collections Browser',
  description:
    'Browse, search, and review archival items from the NYC Department of Records and Information Services.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div>
              <Link href="/" className="text-xl font-semibold text-brand">
                NYC Collections Browser
              </Link>
              <p className="text-sm text-slate-600">
                Local-first research access to archives, transcripts, and media
              </p>
            </div>
            <nav className="flex gap-4 text-sm font-medium">
              <Link href="/search">Search</Link>
              <Link href="/about">About access & content</Link>
            </nav>
          </div>
        </header>
        <main id="main-content" className="mx-auto min-h-[70vh] max-w-6xl px-6 py-10">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <p>
              © {new Date().getFullYear()} NYC DORIS Research Toolkit — local-first and offline friendly.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/about">Access & harmful content statement</Link>
              <Link href="/report">Report an issue</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
