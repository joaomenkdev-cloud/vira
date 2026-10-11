import { LoaderCircle } from "lucide-react";

import { cn } from "../lib/cn";
import { Icon, type IconSize } from "./icon";

interface SpinnerProps {
  size?: IconSize;
  /** Announced to screen readers. */
  label?: string;
  /** Inside a control that already says it is busy (a loading button): draws only the icon. */
  decorative?: boolean;
  className?: string;
}

/** With reduced motion the global rule stops the rotation; the arc stays as a static mark. */
export function Spinner({
  size = 20,
  label = "Carregando",
  decorative = false,
  className,
}: SpinnerProps) {
  const icon = <Icon icon={LoaderCircle} size={size} className={cn("animate-spin", className)} />;
  if (decorative) return icon;
  return (
    <span role="status" className="inline-flex">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
