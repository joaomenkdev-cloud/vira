import { Skeleton } from "@vira/ui";

/** Cards in the shape they will have, while the list loads (docs/DESIGN.md, 3.8). */
export function EventGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-line bg-surface">
          <Skeleton className="aspect-card w-full rounded-none" />
          <div className="flex flex-col gap-3 p-4 lg:p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-5 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
