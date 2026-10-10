import { cn } from "../lib/cn";

interface SkeletonProps {
  /** Size and shape, from the final layout (`h-48 w-full`, `size-12 rounded-full`). */
  className?: string;
}

/**
 * A placeholder with the shape of the content it stands for (docs/DESIGN.md, 3.8). It
 * waits 150 ms before it appears and pulses for 1.2 s; with reduced motion it is
 * static. Hidden from assistive technology: the loading region carries `aria-busy`.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-skeleton rounded-md bg-surface-sunken", className)}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Paragraph-shaped skeleton: full lines and a shorter last one. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4", index === lines - 1 && lines > 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
