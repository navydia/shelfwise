import { describe, it, expect } from 'vitest';
import { parseDollars, formatCents } from '../src/lib/money';

describe('money', () => {
  it('parses_common_inputs', () => {
    expect(parseDollars('9.49')).toBe(949);
    expect(parseDollars('$9.49')).toBe(949);
    expect(parseDollars('9')).toBe(900);
    expect(parseDollars(' 75 ')).toBe(7500);
    expect(parseDollars('9.5')).toBe(950);
  });
  it('rejects_junk', () => {
    for (const s of ['', 'abc', '-3', '1.234', '$']) expect(parseDollars(s)).toBeNull();
  });
  it('formats_cents', () => {
    expect(formatCents(949)).toBe('$9.49');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(10000)).toBe('$100.00');
  });
});
