// Sanitizes user-submitted SVG so the page can safely render it via
// dangerouslySetInnerHTML. Allowlist is intentionally tiny: only the tags and
// attributes produced by GuestbookCanvas (svg, g, path, viewBox, width,
// height, fill, stroke, stroke-width, d, opacity). Everything else is dropped.
//
// Anything that could execute code (script tags, on* handlers, javascript:
// URLs, foreignObject, external href/xlink:href) is stripped. If the result
// doesn't parse as our expected shape we return null and the API rejects it.

const ALLOWED_TAGS = new Set(["svg", "g", "path"]);
// Map lowercased attribute name → canonical SVG casing. Anything not in this
// map is rejected. SVG attribute names are case-sensitive in XML mode; HTML
// parsers auto-fix a handful (like viewBox) but preserving casing keeps the
// serialized output correct regardless of how the browser rehydrates it.
const ATTR_CASING: Record<string, string> = {
  viewbox: "viewBox",
  width: "width",
  height: "height",
  xmlns: "xmlns",
  fill: "fill",
  stroke: "stroke",
  "stroke-width": "stroke-width",
  "stroke-linecap": "stroke-linecap",
  "stroke-linejoin": "stroke-linejoin",
  d: "d",
  opacity: "opacity",
  transform: "transform",
};

const MAX_BYTES = 60_000;

export function sanitizeGuestbookSvg(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_BYTES) return null;
  if (!/^<svg[\s>]/i.test(trimmed)) return null;

  let out = "";
  let i = 0;
  let sawPath = false;

  while (i < trimmed.length) {
    const lt = trimmed.indexOf("<", i);
    if (lt === -1) break;
    const gt = trimmed.indexOf(">", lt);
    if (gt === -1) return null;

    const raw = trimmed.slice(lt + 1, gt);
    if (raw.startsWith("!") || raw.startsWith("?")) {
      // Comments, DOCTYPEs, processing instructions — drop.
      i = gt + 1;
      continue;
    }

    const isClose = raw.startsWith("/");
    const body = isClose ? raw.slice(1) : raw;
    const selfClose = body.endsWith("/");
    const inner = selfClose ? body.slice(0, -1) : body;
    const parts = inner.trim().split(/\s+/);
    const tag = (parts[0] || "").toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown/dangerous element (script, foreignObject, style, etc.) — bail
      // rather than silently drop, so callers know the input was malicious.
      return null;
    }

    if (isClose) {
      out += `</${tag}>`;
      i = gt + 1;
      continue;
    }

    const attrs = parseAttrs(inner.slice(tag.length));
    let attrStr = "";
    for (const [k, v] of attrs) {
      const canonical = ATTR_CASING[k.toLowerCase()];
      if (!canonical) continue;
      if (/^(javascript|data|vbscript):/i.test(v.trim())) continue;
      attrStr += ` ${canonical}="${escapeAttr(v)}"`;
    }
    out += `<${tag}${attrStr}${selfClose ? "/" : ""}>`;
    if (tag === "path") sawPath = true;
    i = gt + 1;
  }

  if (!sawPath) return null;
  return out;
}

function parseAttrs(source: string): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    attrs.push([m[1], m[3] ?? m[4] ?? ""]);
  }
  return attrs;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
