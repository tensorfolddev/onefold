// Ordered lists (board order, lists, products…) are saved with a fractional `position`, so reordering rewrites only
// the rows that actually moved: items that kept their relative order keep their old positions (the longest run that's
// still in order), and the rest get positions between their new neighbours.

/** Indexes of a longest strictly increasing subsequence of `values` (undefined entries are skipped). */
function longestIncreasing(values: (number | undefined)[]): Set<number> {
  const tails: number[] = []; // tails[k] = index in `values` of the smallest tail of an increasing run of length k+1
  const prev = new Map<number, number>();
  values.forEach((v, i) => {
    if (v === undefined) return;
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((values[tails[mid]] as number) < v) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) prev.set(i, tails[lo - 1]);
    tails[lo] = i;
  });
  const keep = new Set<number>();
  for (let i: number | undefined = tails[tails.length - 1]; i !== undefined; i = prev.get(i)) keep.add(i);
  return keep;
}

/** Smallest gap we split; below it everything is renumbered once (rare: needs ~50 inserts at the same spot). */
const MIN_GAP = 1e-9;

/** New positions for `order` (ids, first to last), reusing `old` positions wherever the relative order holds. */
export function assignPositions(order: string[], old: ReadonlyMap<string, number>): Map<string, number> {
  const known = order.map((id) => old.get(id));
  const keep = longestIncreasing(known);
  const out = new Map<string, number>();
  let i = 0;
  let left: number | undefined;
  while (i < order.length) {
    if (keep.has(i)) {
      left = known[i]!;
      out.set(order[i], left);
      i++;
      continue;
    }
    // A run of items that need new positions, between `left` and the next kept item (if any).
    let end = i;
    while (end < order.length && !keep.has(end)) end++;
    const right = end < order.length ? known[end]! : undefined;
    const count = end - i;
    const from = left ?? (right === undefined ? 0 : right - count - 1);
    const to = right ?? from + count + 1;
    const step = (to - from) / (count + 1);
    if (step < MIN_GAP) return new Map(order.map((id, n) => [id, n + 1]));
    for (let k = 0; k < count; k++) out.set(order[i + k], from + step * (k + 1));
    left = from + step * count;
    i = end;
  }
  return out;
}
