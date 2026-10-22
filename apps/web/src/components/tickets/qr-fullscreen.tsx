"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TicketBody } from "@vira/shared";
import { IconButton } from "@vira/ui";

import { TicketQr } from "./ticket-qr";

/**
 * "Tela cheia" (docs/DESIGN.md, 3.10): only the QR, the holder and the code on white,
 * for a quick read at the door. A native modal `<dialog>`: Esc closes it, the page
 * behind is inert and focus goes back to the button that opened it.
 */
export function QrFullscreen({
  ticket,
  open,
  onClose,
}: {
  ticket: TicketBody;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`QR Code em tela cheia, ${ticket.code}`}
      onClose={onClose}
      // Chrome may swallow a second Esc as "close watcher" abuse: close it ourselves.
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-ink backdrop:bg-white"
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <TicketQr
          token={ticket.qrToken}
          code={ticket.code}
          className="aspect-square w-full max-w-md"
        />
        <p className="text-h3">{ticket.holderName}</p>
        <p className="font-mono text-body tracking-widest tabular-nums">{ticket.code}</p>
        <IconButton
          icon={X}
          label="Sair da tela cheia"
          className="absolute top-4 right-4"
          onClick={onClose}
        />
      </div>
    </dialog>
  );
}
