// Money helpers. parseDollars mirrors src/lib/money.ts exactly.
export function parseDollars(input) {
  const m = /^\$?(\d+)(?:\.(\d{1,2}))?$/.exec(String(input).trim());
  if (!m) return null;
  const cents = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  return Number(m[1]) * 100 + cents;
}

export function fmt(cents) {
  const { dollars, cents: c } = priceParts(cents);
  return `$${dollars}.${c}`;
}

export function priceParts(cents) {
  return { dollars: String(Math.floor(cents / 100)), cents: String(cents % 100).padStart(2, '0') };
}
