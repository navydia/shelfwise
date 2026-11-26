const NUM = /^\d+$/;

// Same ordering as compareAisles in public/lib/list-groups.js: numbers numerically, then text; empty last.
export function compareAisles(a: string | null, b: string | null): number {
  const an = a == null || a === '';
  const bn = b == null || b === '';
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  const aNum = NUM.test(a!.trim());
  const bNum = NUM.test(b!.trim());
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a!.localeCompare(b!, undefined, { sensitivity: 'base' });
}
