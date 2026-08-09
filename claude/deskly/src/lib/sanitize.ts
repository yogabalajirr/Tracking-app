import sanitizeHtmlLib from "sanitize-html";

/**
 * Inbound email and portal replies are attacker-controlled HTML that we render
 * back into an agent's authenticated session. Everything shown in a thread goes
 * through here first.
 */
const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    "p", "br", "div", "span", "blockquote", "pre", "code",
    "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "a", "img",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["dir"],
  },
  // No `javascript:`/`vbscript:`; `cid:` is kept so inline email images resolve.
  allowedSchemes: ["http", "https", "mailto", "cid"],
  allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
  allowProtocolRelative: false,
  // Strip style entirely rather than trying to sanitise CSS.
  allowedStyles: {},
  transformTags: {
    // External links from a customer must not be able to reach back into the app.
    a: sanitizeHtmlLib.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtmlLib(html, OPTIONS);
}

/** Plain-text fallback used for previews, search and the notification body. */
export function htmlToText(html: string): string {
  return sanitizeHtmlLib(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Removes the quoted history most mail clients append, so a thread shows the
 * new text rather than an ever-growing transcript.
 */
export function stripQuotedReply(text: string): string {
  const markers = [
    /^On .+ wrote:$/m,
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{10,}$/m,
    /^From:\s.+$/m,
    /^\s*>{1,}\s?/m,
  ];

  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }

  const trimmed = text.slice(0, cut).trim();
  // If stripping removed essentially everything, the heuristic misfired.
  return trimmed.length > 0 ? trimmed : text.trim();
}

/** Escapes text for safe interpolation into an HTML email body. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Converts a plain-text agent reply into simple, safe HTML. */
export function textToHtml(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}
