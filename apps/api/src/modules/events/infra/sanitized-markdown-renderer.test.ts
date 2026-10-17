import { describe, expect, it } from "vitest";

import { SanitizedMarkdownRenderer } from "./sanitized-markdown-renderer.js";

const renderer = new SanitizedMarkdownRenderer();
const render = (markdown: string) => renderer.render(markdown);

const ALLOWED_TAGS = new Set([
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "h3",
  "h4",
  "blockquote",
  "br",
]);

/**
 * The elements and attributes in the output. Text is escaped (`&lt;`), so every `<`
 * left in the HTML opens a real element.
 */
function elementsOf(html: string): { tag: string; attributes: string[]; href?: string }[] {
  return [...html.matchAll(/<([a-z0-9]+)([^>]*)>/gi)].map(([, tag = "", rest = ""]) => {
    const attributes = [...rest.matchAll(/([^\s=]+)="([^"]*)"/g)];
    const href = attributes.find(([, name]) => name === "href")?.[2];
    return {
      tag: tag.toLowerCase(),
      attributes: attributes.map(([, name = ""]) => name),
      ...(href === undefined ? {} : { href }),
    };
  });
}

describe("SanitizedMarkdownRenderer", () => {
  it("renders the allowed formatting", () => {
    expect(render("**Atenção:** traga *documento*.\n\n- Pista\n- Camarote")).toBe(
      "<p><strong>Atenção:</strong> traga <em>documento</em>.</p>\n<ul>\n<li>Pista</li>\n<li>Camarote</li>\n</ul>",
    );
  });

  it("starts headings at h3, below the page's own", () => {
    expect(render("# Programação\n\n## Line-up\n\n###### Nota")).toBe(
      "<h3>Programação</h3>\n<h3>Line-up</h3>\n<h4>Nota</h4>",
    );
  });

  it("keeps https and mailto links, with a rel that cuts the opener and the referrer", () => {
    expect(render("[site](https://vira.example/x) e <mailto:ana@exemplo.com>")).toBe(
      '<p><a href="https://vira.example/x" rel="noopener noreferrer nofollow ugc">site</a> e ' +
        '<a href="mailto:ana@exemplo.com" rel="noopener noreferrer nofollow ugc">mailto:ana@exemplo.com</a></p>',
    );
  });

  it("is empty for an empty description", () => {
    expect(render("   \n ")).toBe("");
  });

  // Classic payloads (OWASP XSS filter evasion cheat sheet and friends).
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg/onload=alert(1)>",
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">clique</a>',
    "[clique](javascript:alert(1))",
    "[clique](JaVaScRiPt:alert(1))",
    "[clique](javascript&#58;alert(1))",
    "[clique](&#106;avascript:alert(1))",
    "[clique](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[clique](vbscript:msgbox(1))",
    "![x](https://evil.example/x.png)",
    '![x" onerror="alert(1)](https://evil.example/x.png)',
    '<div style="background:url(javascript:alert(1))">x</div>',
    "<style>body{display:none}</style>",
    '<form action="https://evil.example"><input name=senha></form>',
    "<<script>script>alert(1)<</script>/script>",
    '<a href="https://ok.example" onclick="alert(1)">x</a>',
    '[x](https://ok.example "title" onmouseover=alert(1))',
    "```html\n<script>alert(1)</script>\n```",
    "`<img src=x onerror=alert(1)>`",
    "<details open ontoggle=alert(1)>",
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
  ])("neutralizes %s", (payload) => {
    // Whatever else survives is inert text: escaped markup, never an element or attribute.
    for (const element of elementsOf(render(payload))) {
      expect(ALLOWED_TAGS).toContain(element.tag);
      expect(["href", "rel"]).toEqual(expect.arrayContaining(element.attributes));
      if (element.href !== undefined) expect(element.href).toMatch(/^(https:\/\/|mailto:)/);
    }
  });

  it("shows raw HTML as text instead of dropping it", () => {
    expect(render("<b>oi</b>")).toBe("<p>&lt;b&gt;oi&lt;/b&gt;</p>");
  });

  it("drops plain http links (only https), keeping their text", () => {
    expect(render("[site](http://vira.example)")).toBe("<p>site</p>");
  });

  it("drops images, which the description does not show", () => {
    expect(render("Antes\n\n![palco](https://vira.example/palco.png)\n\nDepois")).toBe(
      "<p>Antes</p>\n\n<p>Depois</p>",
    );
  });

  it("never lets an attribute other than href and rel through", () => {
    const html = render('[x](https://ok.example "um título")');
    expect(html).toBe(
      '<p><a href="https://ok.example" rel="noopener noreferrer nofollow ugc">x</a></p>',
    );
  });
});
