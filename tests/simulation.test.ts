import { describe, expect, it } from 'vitest';
import {
  COPIES_PER_WRESTLER,
  WRESTLER_COUNT,
  applyMove,
  canPass,
  createGame,
  createRng,
  handTotal,
  isMatchOver,
  legalPlays,
  startNextSeason,
  startingHandSize,
  winners,
  type GameState,
  type Move,
} from '@/engine/index.js';

/** Cards accounted for, per wrestler type: hands + this round's pile + set aside. */
function cardsInPlay(state: GameState): number[] {
  const totals = new Array<number>(WRESTLER_COUNT).fill(0);
  for (let w = 0; w < WRESTLER_COUNT; w++) {
    let sum = (state.discarded[w] ?? 0) + (state.round.pile[w] ?? 0);
    for (const p of state.players) sum += p.hand[w] ?? 0;
    totals[w] = sum;
  }
  return totals;
}

/** Picks uniformly at random from whatever the engine says is legal. */
function randomMove(state: GameState, seat: number, rng: () => number): Move {
  const plays = legalPlays(state, seat);
  const options: Move[] = plays.map((p) => ({
    kind: 'play' as const,
    wrestler: p.wrestler,
    count: p.count,
  }));
  if (canPass(state, seat)) options.push({ kind: 'pass' });
  if (options.length === 0) {
    throw new Error(`seat ${seat} has no legal move at all -- the game is deadlocked`);
  }
  return options[Math.floor(rng() * options.length)]!;
}

function playMatch(playerCount: number, seed: number): GameState {
  const rng = createRng(seed);
  let state = createGame(playerCount, { seed });
  const dealt = cardsInPlay(state);

  // Every type must total the full 10 copies at the moment of the deal only if
  // all cards were dealt; otherwise the undealt remainder is simply absent.
  const expectedDealt = startingHandSize(playerCount) * playerCount;
  expect(dealt.reduce((a, b) => a + b, 0)).toBe(expectedDealt);

  let guard = 0;
  while (state.phase !== 'gameOver') {
    if (++guard > 200_000) throw new Error('match failed to terminate');

    if (state.phase === 'seasonEnd') {
      const seasonTotals = cardsInPlay(state);
      expect(seasonTotals.reduce((a, b) => a + b, 0)).toBe(expectedDealt);
      state = startNextSeason(state, seed + state.seasonNo);
      continue;
    }

    const seat = state.round.turnSeat;
    const before = cardsInPlay(state);
    state = applyMove(state, seat, randomMove(state, seat, rng));
    // Cards only ever move between a hand and the pile; none are created or lost.
    if (state.phase === 'playing') {
      expect(cardsInPlay(state)).toEqual(before);
    }

    // Invariants that must hold at every step.
    for (const p of state.players) {
      expect(handTotal(p.hand)).toBeGreaterThanOrEqual(0);
      expect(p.hand.every((n) => n >= 0)).toBe(true);
      // A player holding cards is never marked finished, and vice versa.
      expect(p.finishedAt === null).toBe(handTotal(p.hand) > 0);
    }
    for (let w = 0; w < WRESTLER_COUNT; w++) {
      expect(cardsInPlay(state)[w]!).toBeLessThanOrEqual(COPIES_PER_WRESTLER);
    }
  }
  return state;
}

describe('full-match simulation', () => {
  for (let playerCount = 2; playerCount <= 6; playerCount++) {
    it(`completes ${playerCount}-player matches from many seeds without deadlocking`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const final = playMatch(playerCount, seed * 7919 + playerCount);

        expect(final.phase).toBe('gameOver');
        expect(isMatchOver(final)).toBe(true);
        expect(winners(final).length).toBeGreaterThanOrEqual(1);

        if (playerCount === 2) {
          // No season cap: someone must have reached three season wins.
          expect(Math.max(...final.players.map((p) => p.seasonWins))).toBe(3);
        } else {
          expect(final.seasonNo).toBe(4);
        }

        // Scoring is zero-sum only when there are exactly three players
        // (+2, +1, -1); with more, the middle finishers score nothing, and with
        // two the -1 and +2 leave a net +1. Just assert nothing absurd happened.
        const totals = final.players.map((p) => p.score);
        expect(totals.every((s) => Number.isInteger(s))).toBe(true);
      }
    });
  }

  it('is deterministic for a given seed', () => {
    const a = playMatch(4, 12345);
    const b = playMatch(4, 12345);
    expect(a.players.map((p) => p.score)).toEqual(b.players.map((p) => p.score));
    expect(a.log.length).toBe(b.log.length);
  });
});
