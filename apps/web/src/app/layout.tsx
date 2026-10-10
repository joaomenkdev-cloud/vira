import "@fontsource-variable/inter";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { CspNonce } from "@vira/ui";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "Vira — Encontre seu próximo evento", template: "%s · Vira" },
  description: "Descubra eventos, compre seu ingresso e entre com o QR Code.",
};

export const viewport: Viewport = {
  themeColor: "#fafaf8",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The Content Security Policy carries a per-request nonce (see proxy.ts), so pages
  // must be rendered on every request; reading the headers opts them into that.
  const nonce = (await headers()).get("x-nonce");

  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh flex-col bg-bg text-ink antialiased">
        {/* Radix injects a <style> to lock the scroll under a modal; the CSP needs the nonce. */}
        {nonce ? <CspNonce nonce={nonce} /> : null}
        <a
          href="#conteudo"
          className="sr-only rounded-md bg-ink px-4 py-3 text-label text-surface focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-toast"
        >
          Pular para o conteúdo
        </a>
        <SiteHeader />
        <main id="conteudo" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
