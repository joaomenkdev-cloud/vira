import "@fontsource-variable/inter";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { CspNonce } from "@vira/ui";
import type { ReactNode } from "react";

import { CheckoutHeader } from "@/components/checkout/checkout-header";
import { HeaderSwitch } from "@/components/checkout/header-switch";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveSiteUrl } from "@/config/api-origin";
import { SESSION_HINT_COOKIE } from "@/lib/session/hint";
import { SessionProvider } from "@/lib/session/session-provider";

export const metadata: Metadata = {
  // Makes the canonical and Open Graph addresses absolute.
  metadataBase: new URL(resolveSiteUrl(process.env)),
  title: { default: "Vira — Encontre seu próximo evento", template: "%s · Vira" },
  description: "Descubra eventos, compre seu ingresso e entre com o QR Code.",
  openGraph: { type: "website", locale: "pt_BR", siteName: "Vira" },
};

export const viewport: Viewport = {
  themeColor: "#fafaf8",
  // Lets the checkout's fixed bar reach the bottom edge, padded by the safe area.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The Content Security Policy carries a per-request nonce (see proxy.ts), so pages
  // must be rendered on every request; reading the headers opts them into that.
  const nonce = (await headers()).get("x-nonce");
  const hinted = (await cookies()).has(SESSION_HINT_COOKIE);

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
        <SessionProvider hinted={hinted}>
          {/* A printed ticket carries no header or footer (docs/DESIGN.md, 3.10). */}
          <div className="contents print:hidden">
            <HeaderSwitch site={<SiteHeader />} checkout={<CheckoutHeader />} />
          </div>
          <main id="conteudo" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <div className="contents print:hidden">
            <SiteFooter />
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
