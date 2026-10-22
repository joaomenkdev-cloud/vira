import { useMemo } from "react";
import { cn } from "@vira/ui";

import { qrPath } from "@/lib/tickets/qr";

/**
 * The ticket's QR Code (docs/DESIGN.md, 3.10): ink modules on white with a 16 px quiet
 * zone, nothing over it, named for screen readers by the code printed below it.
 */
export function TicketQr({
  token,
  code,
  className,
}: {
  token: string;
  code: string;
  className?: string;
}) {
  const { size, d } = useMemo(() => qrPath(token), [token]);
  return (
    <div className={cn("bg-white p-4", className)}>
      <svg
        role="img"
        aria-label={`QR Code do ingresso ${code}`}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        shapeRendering="crispEdges"
        className="block size-full"
      >
        <path d={d} fill="#0b0b0c" />
      </svg>
    </div>
  );
}
