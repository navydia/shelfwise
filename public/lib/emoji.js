// Emoji for staples: the grid in the picker, and cleaning what is typed into its text field. No DOM access.
export const GROCERY_EMOJI = [
  '🥛', '🧀', '🥚', '🍞', '🥩', '🍗', '🥓', '🐟', '🍎', '🍌',
  '🍇', '🍊', '🍋', '🍓', '🥑', '🥕', '🥦', '🥬', '🌽', '🥔',
  '🍅', '🧅', '🥫', '🍝', '🍚', '🥜', '🍪', '🧃', '☕', '🧻',
];

const EMOJI_MAX_BYTES = 16; // the server's limit
const IS_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

// The first emoji in the text, or null when there is none or it is too long for the server to store.
export function cleanEmoji(text) {
  const s = String(text ?? '').trim();
  const parts = typeof Intl !== 'undefined' && Intl.Segmenter
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment)
    : [...s];
  const first = parts.find((p) => IS_EMOJI.test(p));
  if (!first) return null;
  return new TextEncoder().encode(first).length <= EMOJI_MAX_BYTES ? first : null;
}
