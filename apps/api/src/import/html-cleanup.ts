import { convert } from 'html-to-text';

// Heuristic: only invoke the HTML→text converter if the value actually contains
// tags (cheap short-circuit for already-clean text).
const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/i;

export function isProbablyHtml(value: string): boolean {
  if (!value) return false;
  return HTML_TAG_RE.test(value) || /&[a-z#]+;/i.test(value);
}

// WooCommerce exports sometimes contain literal "\n" / "\t" / "\r" sequences
// (backslash + letter, not real control chars) inside the description text.
// Convert those to real whitespace before feeding html-to-text.
function unescapeLiteralWhitespace(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
}

export function cleanDescription(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = unescapeLiteralWhitespace(value).trim();
  if (!normalized) return null;

  const hasHtml = isProbablyHtml(normalized);
  const text = hasHtml
    ? convert(normalized, {
        wordwrap: false,
        selectors: [
          { selector: 'img', format: 'skip' },
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'ul', options: { itemPrefix: '• ' } },
          { selector: 'ol', options: { itemPrefix: '' } },
        ],
      })
    : normalized;

  // Collapse 3+ consecutive newlines into paragraph break (max 2).
  return (
    text
      .replace(/[\t ]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || null
  );
}
