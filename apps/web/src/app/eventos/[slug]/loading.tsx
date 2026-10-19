import { Skeleton, SkeletonText } from "@vira/ui";

export default function EventLoading() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-event pb-24 md:px-6 md:pt-8 lg:px-8">
      <p role="status" className="sr-only">
        Carregando evento…
      </p>
      <Skeleton className="aspect-banner-sm w-full rounded-none md:aspect-banner md:rounded-lg" />
      <div className="mt-8 grid gap-12 px-4 md:px-0 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-10 w-4/5" />
          <SkeletonText lines={3} className="mt-8 max-w-sm" />
          <SkeletonText lines={5} className="mt-12" />
        </div>
        <div className="lg:col-span-5">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-6 h-20 w-full" />
          <Skeleton className="mt-3 h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
