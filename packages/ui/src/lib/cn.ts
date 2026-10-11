import { clsx, type ClassValue } from "clsx";

/**
 * Joins class names. There is deliberately no tailwind-merge here: it cannot tell
 * `text-label` (a size) from `text-ink` (a colour) because both are Vira tokens, so
 * components resolve conflicts with disjoint `cva` variants instead.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
