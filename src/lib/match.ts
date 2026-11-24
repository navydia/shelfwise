import { normalizeLabel, type ParsedLine } from './receipt';

export type Proposal = { lineIndex: number; itemId: number | null; reason: 'alias' | 'name' | 'none' };

export function proposeMatches(
  lines: ParsedLine[],
  items: { id: number; name: string }[],
  aliases: { itemId: number; label: string }[],
): Proposal[] {
  const aliasMap = new Map(aliases.map((a) => [a.label, a.itemId]));
  const itemTokens = items.map((i) => ({ id: i.id, tokens: normalizeLabel(i.name).split(' ').filter(Boolean) }));
  const claimed = new Set<number>();

  return lines.map((line, lineIndex): Proposal => {
    const norm = normalizeLabel(line.raw);
    const aliasId = aliasMap.get(norm);
    if (aliasId !== undefined && !claimed.has(aliasId)) {
      claimed.add(aliasId);
      return { lineIndex, itemId: aliasId, reason: 'alias' };
    }
    const lineTokens = norm.split(' ').filter(Boolean);
    let best: { id: number; count: number; chars: number } | null = null;
    for (const it of itemTokens) {
      if (claimed.has(it.id) || it.tokens.length === 0) continue;
      const ok = it.tokens.every((t) => t.length >= 3 && lineTokens.some((l) => l.startsWith(t)));
      if (!ok) continue;
      const cand = { id: it.id, count: it.tokens.length, chars: it.tokens.join('').length };
      if (!best || cand.count > best.count || (cand.count === best.count && cand.chars > best.chars)) best = cand;
    }
    if (best) {
      claimed.add(best.id);
      return { lineIndex, itemId: best.id, reason: 'name' };
    }
    return { lineIndex, itemId: null, reason: 'none' };
  });
}
