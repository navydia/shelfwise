// Ruling 4: a first guess at a staple name from a raw receipt line. No DOM access.
const PRICE_END = /\s*\$?\d+\.\d{2}(\s+[A-Za-z])?\s*$/;
const COUNT = /^\d+(ct|pk|x)?$/i;
const SIZE = /^\d+(?:\.\d+)?\s*(?:oz|fl|lbs?|g|kg|ml|l|gal|qt|pt|ct|pk)\.?$/i;
const UNIT_ONLY = /^(?:oz|fl|lbs?|g|kg|ml|l|gal|qt|pt|ct|pk)\.?$/i;
const NUMBER = /^\d+(?:\.\d+)?$/;
const SMALL = new Set(['in', 'of', 'and', 'with', 'the', 'a', 'to', 'for']);

function titleWord(w, first) {
  const letters = w.replace(/[^A-Za-z]/g, '');
  if (!letters) return w;
  const mixed = /[a-z]/.test(letters) && /[A-Z]/.test(letters.slice(1)); // StarKist, McCain: leave alone
  if (mixed) return w;
  const lower = w.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  return lower.replace(/[a-z]/, (c) => c.toUpperCase());
}

export function guessName(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  let s = text.replace(PRICE_END, '').replace(/\$\d+\.\d{2}/g, ' ');
  let tokens = s.split(/\s+/).filter(Boolean);
  // Leading counts ("1ct", "2") and one- or two-letter codes ("Gm").
  while (tokens.length > 1 && (COUNT.test(tokens[0]) || /^[A-Za-z]{1,2}$/.test(tokens[0]))) tokens.shift();
  // Size tokens anywhere: "24oz", or "5 oz" as two tokens.
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/,+$/, '');
    if (SIZE.test(t)) continue;
    if (NUMBER.test(t) && tokens[i + 1] && UNIT_ONLY.test(tokens[i + 1].replace(/,+$/, ''))) { i++; continue; }
    out.push(t);
  }
  const name = out.join(' ').replace(/[\s,]+$/, '').trim();
  if (!name) return text;
  return name.split(' ').map((w, i) => titleWord(w, i === 0)).join(' ');
}
