import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { cleanEmoji, GROCERY_EMOJI } from '../public/lib/emoji.js';

describe('cleanEmoji', () => {
  it('takes_the_first_emoji_from_typed_text', () => {
    expect(cleanEmoji('🥛')).toBe('🥛');
    expect(cleanEmoji('  🥛milk ')).toBe('🥛');
    expect(cleanEmoji('🍎🍌')).toBe('🍎');
  });
  it('rejects_text_with_no_emoji', () => {
    expect(cleanEmoji('milk')).toBeNull();
    expect(cleanEmoji('')).toBeNull();
    expect(cleanEmoji('12')).toBeNull();
  });
  it('rejects_an_emoji_over_the_server_limit_of_16_bytes', () => {
    expect(cleanEmoji('👨‍👩‍👧‍👦')).toBeNull();
    expect(cleanEmoji('🇺🇸')).toBe('🇺🇸');
  });
  it('grid_has_about_thirty_distinct_valid_emoji', () => {
    expect(GROCERY_EMOJI.length).toBeGreaterThanOrEqual(28);
    expect(new Set(GROCERY_EMOJI).size).toBe(GROCERY_EMOJI.length);
    for (const e of GROCERY_EMOJI) expect(cleanEmoji(e)).toBe(e);
  });
});
