"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn, Icon } from "@vira/ui";

/**
 * The event description: HTML rendered and sanitized by the API from the organizer's
 * markdown (N8). On a phone it folds after six lines behind "Ler mais" (docs/DESIGN.md,
 * 4.2); the button only stays when there is more to read.
 */
export function EventDescription({ html }: { html: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    // Also called once right away, when observing starts.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div
        id={id}
        ref={ref}
        className={cn(
          "mt-4 max-w-reading text-body-lg text-pretty text-ink",
          "[&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-4 [&_a:hover]:text-accent-ink",
          "[&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-ink-muted",
          "[&_h3]:mt-8 [&_h3]:text-h3 [&_h4]:mt-6 [&_h4]:font-semibold",
          "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1",
          "[&_p]:mt-4 [&>:first-child]:mt-0",
          !expanded && "max-md:line-clamp-6",
        )}
        // Sanitized by the API (an allowlist of tags, https and mailto links only).
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {!expanded && overflows ? (
        <button
          type="button"
          aria-expanded={false}
          aria-controls={id}
          onClick={() => {
            setExpanded(true);
          }}
          className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-sm text-label text-ink underline decoration-1 underline-offset-4 md:hidden"
        >
          Ler mais
          <Icon icon={ChevronDown} size={16} />
        </button>
      ) : null}
    </>
  );
}
