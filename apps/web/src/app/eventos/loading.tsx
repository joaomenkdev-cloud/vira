import { Skeleton } from "@vira/ui";

import { EventGridSkeleton } from "@/components/catalog/event-grid-skeleton";

export default function ExploreLoading() {
  return (
    <div
      aria-busy="true"
      className="mx-auto w-full max-w-page px-4 pt-12 pb-24 sm:px-6 md:pt-16 lg:px-8 lg:pb-32"
    >
      <p role="status" className="sr-only">
        Carregando eventos…
      </p>
      <Skeleton className="h-9 w-64 md:h-11" />
      <Skeleton className="mt-8 h-12 w-full" />
      <div className="mt-12">
        <EventGridSkeleton count={6} />
      </div>
    </div>
  );
}
