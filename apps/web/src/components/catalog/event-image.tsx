import { getImageProps } from "next/image";

import { cn } from "@vira/ui";

export interface EventImageProps {
  image: { url: string; alt: string; width: number; height: number; blurDataUrl: string };
  /** Which width the photo takes at each breakpoint, so the browser picks the right file. */
  sizes: string;
  /** The largest photo above the fold (the event banner, the hero): loaded at once. */
  eager?: boolean;
  className?: string;
}

/**
 * An event photo through the Next.js image optimizer (docs/DESIGN.md, 2.8): resized to
 * the slot, served from this origin, with the blurred preview made at upload underneath
 * while it loads. Built from `getImageProps` rather than `<Image>`, because `<Image>`
 * writes inline styles, which the page's Content Security Policy forbids.
 */
export function EventImage({ image, sizes, eager = false, className }: EventImageProps) {
  const {
    props: { style: _style, ...props },
  } = getImageProps({
    src: image.url,
    alt: image.alt,
    width: image.width,
    height: image.height,
    sizes,
    quality: 75,
    ...(eager ? { loading: "eager", fetchPriority: "high" } : {}),
  });
  const blur = image.blurDataUrl.startsWith("data:image/") ? image.blurDataUrl : null;

  return (
    <div className={cn("relative size-full overflow-hidden bg-surface-sunken", className)}>
      {blur ? (
        // Decorative: the same picture, blurred, until the real one arrives on top.
        <img
          src={blur}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full scale-110 object-cover blur-lg"
        />
      ) : null}
      <img {...props} alt={image.alt} className="relative size-full object-cover" />
    </div>
  );
}
