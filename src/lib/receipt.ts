export type ParsedLine = { raw: string; priceCents: number };

const PRICE_AT_END = /\$?(\d+)\.(\d{2})\s*[a-z]?\s*$/i;
const SKIP_WORDS = /\b(subtotal|total|tax|balance|change|cash|visa|mastercard|debit|credit)\b/i;
const NEGATIVE = /-\s*\$?\d+\.\d{2}|\d+\.\d{2}\s*-/;

export function parseReceiptText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw || SKIP_WORDS.test(raw) || NEGATIVE.test(raw)) continue;
    const m = PRICE_AT_END.exec(raw);
    if (!m || !/[a-z]/i.test(raw.slice(0, m.index))) continue;
    out.push({ raw, priceCents: Number(m[1]) * 100 + Number(m[2]) });
  }
  return out;
}

export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s*\$?\d+\.\d{2}\s*[a-z]?\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
