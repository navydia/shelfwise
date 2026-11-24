export function parseDollars(input: string): number | null {
  const m = /^\$?(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const cents = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  return Number(m[1]) * 100 + cents;
}

export function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  return `$${dollars}.${String(cents % 100).padStart(2, '0')}`;
}
