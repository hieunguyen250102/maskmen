/**
 * The strength order: a partial order over the 6 wrestler types.
 *
 * This is the heart of maskmen. Nobody knows the wrestlers' strengths at the
 * start of a season; players *establish* relations by out-bidding, and those
 * relations compose transitively. Two wrestlers with no path between them are
 * genuinely incomparable, which is why the physical game sometimes needs a
 * second line of markers.
 */

import { WRESTLER_COUNT, type StrengthOrder, type WrestlerType } from './types.js';

/** A fresh order in which nothing is known about anybody. */
export function emptyOrder(): StrengthOrder {
  return Array.from({ length: WRESTLER_COUNT }, () => new Array<boolean>(WRESTLER_COUNT).fill(false));
}

export function cloneOrder(order: StrengthOrder): StrengthOrder {
  return order.map((row) => row.slice());
}

/** Is `a` known to be stronger than `b`? */
export function isKnownStronger(order: StrengthOrder, a: WrestlerType, b: WrestlerType): boolean {
  return order[a]?.[b] ?? false;
}

/**
 * Do we know anything about how `a` and `b` compare?
 * Incomparable pairs are exactly the ones an Option 1 raise can resolve.
 */
export function areComparable(order: StrengthOrder, a: WrestlerType, b: WrestlerType): boolean {
  return a === b || isKnownStronger(order, a, b) || isKnownStronger(order, b, a);
}

/**
 * Record "stronger beats weaker" and close the result transitively.
 *
 * Returns a new order; the input is not mutated. With only 6 nodes the full
 * Floyd-Warshall closure is 216 operations, so we recompute it outright rather
 * than maintaining an incremental closure -- clarity is worth more than the
 * microseconds here.
 */
export function addRelation(
  order: StrengthOrder,
  stronger: WrestlerType,
  weaker: WrestlerType,
): StrengthOrder {
  if (stronger === weaker) {
    throw new Error(`a wrestler cannot beat itself (${stronger})`);
  }
  if (isKnownStronger(order, weaker, stronger)) {
    // Would create a cycle: the rules forbid playing a known-weaker wrestler,
    // so reaching here means a bug upstream rather than bad user input.
    throw new Error(`contradictory relation: ${weaker} is already known stronger than ${stronger}`);
  }

  const next = cloneOrder(order);
  next[stronger]![weaker] = true;

  for (let k = 0; k < WRESTLER_COUNT; k++) {
    for (let i = 0; i < WRESTLER_COUNT; i++) {
      if (!next[i]![k]) continue;
      for (let j = 0; j < WRESTLER_COUNT; j++) {
        if (next[k]![j]) next[i]![j] = true;
      }
    }
  }
  return next;
}

/**
 * Direct relations only: drop every edge that is implied by a longer path.
 *
 * The stored order is transitively closed, which is right for legality checks
 * but wrong for drawing -- it would put an edge between every pair in a chain.
 */
export function transitiveReduction(
  order: StrengthOrder,
  present: readonly WrestlerType[],
): StrengthOrder {
  const reduced = emptyOrder();
  for (const a of present) {
    for (const b of present) {
      if (a === b || !isKnownStronger(order, a, b)) continue;
      const implied = present.some(
        (c) => c !== a && c !== b && isKnownStronger(order, a, c) && isKnownStronger(order, c, b),
      );
      if (!implied) reduced[a]![b] = true;
    }
  }
  return reduced;
}

/**
 * Lay the markers out the way the table does: as lines.
 *
 * Each returned line is a chain of wrestlers ordered strongest-first, where
 * every wrestler really is known to beat the one below it. Wrestlers whose
 * relative strength is still unknown end up in different lines -- which is
 * exactly the rulebook's "if the correct placement of two markers can't be
 * determined, then another line must be created".
 *
 * A wrestler may appear in more than one line. That is not a bug: the physical
 * game ships five markers per wrestler for precisely this reason.
 */
export function strengthLines(order: StrengthOrder, debuted: readonly boolean[]): WrestlerType[][] {
  const present: WrestlerType[] = [];
  for (let w = 0; w < WRESTLER_COUNT; w++) {
    if (debuted[w]) present.push(w);
  }
  if (present.length === 0) return [];

  const reduced = transitiveReduction(order, present);
  const hasStrongerNeighbour = (w: WrestlerType) => present.some((other) => reduced[other]![w]);
  const tops = present.filter((w) => !hasStrongerNeighbour(w));

  const lines: WrestlerType[][] = [];
  const walk = (path: WrestlerType[]): void => {
    const last = path[path.length - 1]!;
    const weaker = present.filter((w) => reduced[last]![w]);
    if (weaker.length === 0) {
      lines.push(path);
      return;
    }
    for (const next of weaker) walk([...path, next]);
  };
  for (const top of tops) walk([top]);

  // Longest lines first so the most informative chain reads left to right.
  return lines.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
}
