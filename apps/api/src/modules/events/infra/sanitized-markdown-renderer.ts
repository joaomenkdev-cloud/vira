import { Injectable } from "@nestjs/common";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

import type { MarkdownRenderer } from "../application/ports/markdown-renderer.js";

/** Rel of every link: no access to the opener, no referrer, no SEO credit for user content. */
const LINK_REL = "noopener noreferrer nofollow ugc";

/** The schemes a description may link to (sanitize-html checks them again). */
const SAFE_HREF = /^(https:\/\/|mailto:)/i;

/**
 * Two layers (docs/SECURITY_MODEL.md, "Markdown"): markdown-it with raw HTML off, so a
 * `<script>` in the text becomes text, then sanitize-html with an allowlist, so whatever
 * markdown-it produces beyond it (images, code, tables, headings above h3) is cut down.
 * The page's own title is the h1 and the sections are h2, so the description's headings
 * start at h3.
 */
@Injectable()
export class SanitizedMarkdownRenderer implements MarkdownRenderer {
  private readonly markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });

  private readonly options: sanitizeHtml.IOptions = {
    allowedTags: ["p", "strong", "em", "ul", "ol", "li", "a", "h3", "h4", "blockquote", "br"],
    allowedAttributes: { a: ["href", "rel"] },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    // Tags outside the allowlist go, their text stays ("**x**" in a table cell is kept).
    disallowedTagsMode: "discard",
    transformTags: {
      h1: "h3",
      h2: "h3",
      h5: "h4",
      h6: "h4",
      // A link to anything but https: or mailto: (http:, javascript:, data:) keeps only
      // its text: a <span> is outside the allowlist, so the tag goes and the text stays.
      a: (tagName, attribs) => {
        const href = attribs["href"] ?? "";
        return SAFE_HREF.test(href)
          ? { tagName, attribs: { href, rel: LINK_REL } }
          : { tagName: "span", attribs: {} };
      },
    },
    // A paragraph left empty (it only held an image) goes too.
    exclusiveFilter: (frame) => frame.tag === "p" && frame.text.trim() === "",
  };

  render(markdown: string): string {
    if (markdown.trim() === "") return "";
    return sanitizeHtml(this.markdown.render(markdown), this.options).trim();
  }
}
