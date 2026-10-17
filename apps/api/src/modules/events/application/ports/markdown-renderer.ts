/**
 * Turns the organizer's markdown into HTML safe to serve as is
 * (docs/SECURITY_MODEL.md: allowlist of tags, links only to `https:` and `mailto:`).
 * The result is stored with the event; pages never sanitize it again.
 */
export interface MarkdownRenderer {
  render(markdown: string): string;
}

export const MARKDOWN_RENDERER = Symbol("MARKDOWN_RENDERER");
