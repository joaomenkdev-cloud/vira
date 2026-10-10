"use client";

import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode, Ref } from "react";

import { cn } from "../lib/cn";
import { IconButton } from "./button";

/** The dialog, its trigger and its close control come straight from Radix. */
export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

/*
 * Below 640 px the modal is a bottom sheet: full width, glued to the bottom, round only
 * at the top (docs/DESIGN.md, 3.5). From 640 px it is a centred card. The sheet slides
 * with `translateY`, the centring uses the separate `translate` property, so the two
 * never fight over the same transform.
 */
const contentStyles = cva(
  "fixed inset-x-0 bottom-0 z-modal flex max-h-5/6 w-full flex-col overflow-y-auto rounded-t-lg bg-surface p-6 text-ink shadow-float data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-dvh sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:data-[state=closed]:animate-overlay-out sm:data-[state=open]:animate-overlay-in",
  {
    variants: {
      size: {
        /** 480 px: confirmations. */
        sm: "sm:max-w-dialog",
        /** 640 px: content. */
        md: "sm:max-w-dialog-wide",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface ModalContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons for the actions. The primary one goes last: on the right, and on top on a phone. */
  footer?: ReactNode;
  size?: "sm" | "md";
  closeLabel?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The panel of a modal (docs/DESIGN.md, 3.5). Focus is trapped inside, Esc closes it,
 * focus returns to the control that opened it and the page behind does not scroll.
 * The close button comes last in the DOM, so the first thing a keyboard user lands on
 * is the content, not the exit.
 */
export function ModalContent({
  title,
  description,
  children,
  footer,
  size,
  closeLabel = "Fechar",
  className,
  ref,
}: ModalContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-scrim data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
      <DialogPrimitive.Content
        ref={ref}
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(contentStyles({ size }), className)}
      >
        <span
          aria-hidden="true"
          className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden"
        />
        <DialogPrimitive.Title className="pr-10 text-h3">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-2 text-body text-ink-muted">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? (
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
        <DialogPrimitive.Close asChild>
          <IconButton icon={X} label={closeLabel} className="absolute top-3 right-3" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
