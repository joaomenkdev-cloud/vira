"use client";

import { CircleAlert, CircleCheck, X, type LucideIcon } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { Icon } from "./icon";

export interface ToastOptions {
  title: string;
  description?: string;
  /** `danger` interrupts the screen reader; the others wait for it to finish. */
  tone?: "neutral" | "success" | "danger";
  /** Milliseconds on screen. The timer pauses on hover and focus. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
  open: boolean;
}

interface ToastApi {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICONS: Record<NonNullable<ToastOptions["tone"]>, LucideIcon | null> = {
  neutral: null,
  success: CircleCheck,
  danger: CircleAlert,
};

const DEFAULT_DURATION = 5000;

/** Shows a toast. Must be called under a `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside a <ToastProvider>.");
  return api;
}

/**
 * Toasts (docs/DESIGN.md, 3.7): ink on white, bottom centre on a phone and bottom right
 * on a desktop, five seconds, paused while hovered or focused, always closable. A toast
 * is never the only place for an important message: repeat errors inline.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    setToasts((current) => {
      // Closed toasts have already left the screen; this is the moment to forget them.
      const alive = current.filter((item) => item.open);
      const id = (current.at(-1)?.id ?? 0) + 1;
      return [...alive, { ...options, id, open: true }];
    });
  }, []);

  const close = useCallback((id: number) => {
    setToasts((current) =>
      current.map((item) => (item.id === id ? { ...item, open: false } : item)),
    );
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastContext value={api}>
      <ToastPrimitive.Provider
        swipeDirection="right"
        duration={DEFAULT_DURATION}
        label="Notificações"
      >
        {children}
        {toasts.map((item) => {
          const tone = item.tone ?? "neutral";
          const glyph = TONE_ICONS[tone];
          return (
            <ToastPrimitive.Root
              key={item.id}
              open={item.open}
              onOpenChange={(open) => {
                if (!open) close(item.id);
              }}
              type={tone === "danger" ? "foreground" : "background"}
              duration={item.duration ?? DEFAULT_DURATION}
              className="pointer-events-auto flex w-full items-start gap-3 rounded-md bg-ink p-4 text-surface shadow-float data-[state=closed]:animate-fade-out data-[state=open]:animate-rise-in data-[swipe=end]:animate-fade-out sm:w-96"
            >
              {glyph ? <Icon icon={glyph} className="mt-0.5" /> : null}
              <div className="flex flex-1 flex-col gap-1">
                <ToastPrimitive.Title className="text-body font-semibold">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="text-body-sm">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label="Fechar notificação"
                className="-m-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-surface transition-colors duration-fast hover:bg-ink-muted active:bg-ink-muted"
              >
                <Icon icon={X} />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          label="Notificações ({hotkey})"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-toast m-0 flex list-none flex-col items-center gap-2 p-4 outline-none sm:inset-x-auto sm:right-0 sm:items-end"
        />
      </ToastPrimitive.Provider>
    </ToastContext>
  );
}
