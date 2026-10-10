import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False on the server and during hydration, true once the component runs in the browser.
 * It lets a component keep an element out of the server HTML when that element would
 * carry an inline `style` attribute, which the strict Content Security Policy blocks.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
