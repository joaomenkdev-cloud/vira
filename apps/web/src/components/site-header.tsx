import Link from "next/link";

/**
 * The header carries only what exists today: the logo. Navigation ("Explorar",
 * "Meus ingressos") and sign-in arrive with the pages and features they lead to.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center px-4 sm:px-6 md:h-16 lg:px-8">
        <Link
          href="/"
          aria-label="Vira, página inicial"
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-2xl font-extrabold tracking-tight text-ink"
        >
          vira
          <span aria-hidden="true" className="mt-1.5 inline-block size-2 rounded-full bg-accent" />
        </Link>
      </div>
    </header>
  );
}
