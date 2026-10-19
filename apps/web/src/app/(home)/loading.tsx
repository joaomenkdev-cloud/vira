import { Skeleton } from "@vira/ui";

import { EventGridSkeleton } from "@/components/catalog/event-grid-skeleton";

export default function HomeLoading() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8">
      <p role="status" className="sr-only">
        Carregando eventos…
      </p>
      <div className="pt-12 pb-12 md:pt-16 md:pb-16 lg:pt-24 lg:pb-24">
        <Skeleton className="h-11 w-4/5 max-w-2xl md:h-15" />
        <Skeleton className="mt-6 h-7 w-3/5 max-w-xl" />
        <Skeleton className="mt-10 h-12 w-full max-w-xl" />
      </div>
      <div className="pb-24 md:pb-32">
        <Skeleton className="h-8 w-48" />
        <div className="mt-8">
          <EventGridSkeleton />
        </div>
      </div>
    </div>
  );
}
