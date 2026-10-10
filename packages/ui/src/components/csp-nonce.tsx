"use client";

import { setNonce } from "get-nonce";
import { useInsertionEffect } from "react";

/**
 * Hands the page's CSP nonce to the libraries that inject a `<style>` element. Radix
 * locks the page scroll under a modal with one (through react-remove-scroll), and a
 * strict `style-src` blocks it unless it carries the nonce of the response.
 * Render it once, high in the tree, with the nonce the proxy put in the request headers.
 */
export function CspNonce({ nonce }: { nonce: string }) {
  useInsertionEffect(() => {
    setNonce(nonce);
  }, [nonce]);
  return null;
}
