import { describe, expect, it } from 'vitest';
import { addRelation, emptyOrder } from '@/engine/order.js';
import {
  IllegalMoveError,
  applyMove,
  canPass,
  legalPlays,
} from '@/engine/rules.js';
import { WRESTLER_COUNT, type GameState, type Hand } from '@/engine/types.js';

const [TIGRE, ROSA, FANTASMA, TRUENO] = [0, 1, 2, 3];

function hand(counts: Partial<Record<number, number>>): Hand {
  const h = new Array<number>(WRESTLER_COUNT).fill(0);
  for (const [k, v] of Object.entries(counts)) h[Number(k)] = v ?? 0;
  return h;
}

interface StateOptions {
  hands: Hand[];
  claim?: { wrestler: number; count: number; seat: number } | null;
  order?: GameState['order'];
  debuted?: number[];
  turnSeat?: number;
  hostSeat?: number;
  passed?: number[];
}

function makeState(opts: StateOptions): GameState {
  const debuted = new Array<boolean>(WRESTLER_COUNT).fill(false);
  for (const w of opts.debuted ?? []) debuted[w] = true;
  const passed = new Array<boolean>(opts.hands.length).fill(false);
  for (const seat of opts.passed ?? []) passed[seat] = true;

  // A standing claim implies its cards are already on the table.
  const pile = new Array<number>(WRESTLER_COUNT).fill(0);
  if (opts.claim) pile[opts.claim.wrestler] = opts.claim.count;

  return {
    players: opts.hands.map((h, seat) => ({
      seat,
      hand: h,
      finishedAt: null,
      score: 0,
      seasonWins: 0,
    })),
    seasonNo: 1,
    maxSeasons: 4,
    order: opts.order ?? emptyOrder(),
    debuted,
    round: {
      hostSeat: opts.hostSeat ?? 0,
      turnSeat: opts.turnSeat ?? 0,
      passed,
      claim: opts.claim ?? null,
      pile,
    },
    finishOrder: [],
    discarded: new Array<number>(WRESTLER_COUNT).fill(0),
    phase: 'playing',
    lastSeasonWinner: null,
    nextSeasonHost: null,
    log: [],
  };
}

describe('the host opening a round', () => {
  it('may play only one copy of a wrestler that has not appeared this season', () => {
    const state = makeState({ hands: [hand({ [TIGRE]: 3 }), hand({ [ROSA]: 3 })] });
    expect(legalPlays(state, 0)).toEqual([{ wrestler: TIGRE, count: 1, kind: 'host' }]);
  });

  it('may play up to three copies of a wrestler already seen this season', () => {
    const state = makeState({ hands: [hand({ [TIGRE]: 5 }), hand({ [ROSA]: 3 })], debuted: [TIGRE] });
    expect(legalPlays(state, 0).map((p) => p.count)).toEqual([1, 2, 3]);
  });

  it('is capped by what it actually holds', () => {
    const state = makeState({ hands: [hand({ [TIGRE]: 2 }), hand({ [ROSA]: 3 })], debuted: [TIGRE] });
    expect(legalPlays(state, 0).map((p) => p.count)).toEqual([1, 2]);
  });

  it('may not throw in the towel', () => {
    const state = makeState({ hands: [hand({ [TIGRE]: 3 }), hand({ [ROSA]: 3 })] });
    expect(canPass(state, 0)).toBe(false);
    expect(() => applyMove(state, 0, { kind: 'pass' })).toThrow(IllegalMoveError);
  });
});

describe('answering a standing claim', () => {
  const base = (over: Partial<StateOptions> = {}) =>
    makeState({
      hands: [hand({ [TIGRE]: 5 }), hand({ [TIGRE]: 3, [ROSA]: 3, [FANTASMA]: 3, [TRUENO]: 3 })],
      claim: { wrestler: TIGRE, count: 1, seat: 0 },
      debuted: [TIGRE],
      turnSeat: 1,
      ...over,
    });

  it('rejects the same wrestler type', () => {
    expect(legalPlays(base(), 1).some((p) => p.wrestler === TIGRE)).toBe(false);
  });

  it('requires exactly one more card when the wrestler is incomparable', () => {
    const plays = legalPlays(base(), 1).filter((p) => p.wrestler === ROSA);
    expect(plays).toEqual([{ wrestler: ROSA, count: 2, kind: 'raise' }]);
  });

  it('requires exactly the same count when the wrestler is already known stronger', () => {
    const order = addRelation(emptyOrder(), ROSA, TIGRE);
    const plays = legalPlays(base({ order, debuted: [TIGRE, ROSA] }), 1).filter(
      (p) => p.wrestler === ROSA,
    );
    expect(plays).toEqual([{ wrestler: ROSA, count: 1, kind: 'beat' }]);
  });

  it('rejects a wrestler already known to be weaker', () => {
    const order = addRelation(emptyOrder(), TIGRE, ROSA);
    const plays = legalPlays(base({ order, debuted: [TIGRE, ROSA] }), 1);
    expect(plays.some((p) => p.wrestler === ROSA)).toBe(false);
  });

  it('rejects a wrestler transitively known to be weaker', () => {
    // TIGRE > ROSA > TRUENO, so TRUENO cannot answer a TIGRE claim.
    let order = addRelation(emptyOrder(), ROSA, TRUENO);
    order = addRelation(order, TIGRE, ROSA);
    const plays = legalPlays(base({ order, debuted: [TIGRE, ROSA, TRUENO] }), 1);
    expect(plays.some((p) => p.wrestler === TRUENO)).toBe(false);
  });

  it('leaves only known-stronger answers when the claim is three cards', () => {
    // A raise would need 4 cards, which exceeds the cap of 3.
    const order = addRelation(emptyOrder(), ROSA, TIGRE);
    const state = base({
      order,
      claim: { wrestler: TIGRE, count: 3, seat: 0 },
      debuted: [TIGRE, ROSA],
    });
    expect(legalPlays(state, 1)).toEqual([{ wrestler: ROSA, count: 3, kind: 'beat' }]);
  });

  it('yields no plays at all when the hand cannot answer, leaving only the towel', () => {
    const state = base({
      hands: [hand({ [TIGRE]: 5 }), hand({ [ROSA]: 1 })],
      claim: { wrestler: TIGRE, count: 2, seat: 0 },
    });
    expect(legalPlays(state, 1)).toEqual([]);
    expect(canPass(state, 1)).toBe(true);
  });

  it('is not open to a player who is not on turn', () => {
    expect(legalPlays(base(), 0)).toEqual([]);
    expect(() => applyMove(base(), 0, { kind: 'pass' })).toThrow(/not seat 0's turn/);
  });
});

describe('applying a play', () => {
  it('records the new relation when a raise succeeds', () => {
    const state = makeState({
      hands: [hand({ [TIGRE]: 5 }), hand({ [ROSA]: 3 })],
      claim: { wrestler: TIGRE, count: 1, seat: 0 },
      debuted: [TIGRE],
      turnSeat: 1,
    });
    const next = applyMove(state, 1, { kind: 'play', wrestler: ROSA, count: 2 });
    expect(next.order[ROSA]![TIGRE]).toBe(true);
    expect(next.players[1]!.hand[ROSA]).toBe(1);
    expect(next.round.claim).toMatchObject({ wrestler: ROSA, count: 2, seat: 1 });
  });

  it('does not add a relation for a known-stronger answer', () => {
    // The relation already exists; playing on it must not change the order.
    const order = addRelation(emptyOrder(), ROSA, TIGRE);
    const state = makeState({
      hands: [hand({ [TIGRE]: 5 }), hand({ [ROSA]: 3 })],
      claim: { wrestler: TIGRE, count: 1, seat: 0 },
      order,
      debuted: [TIGRE, ROSA],
      turnSeat: 1,
    });
    const next = applyMove(state, 1, { kind: 'play', wrestler: ROSA, count: 1 });
    expect(next.order).toEqual(order);
  });

  it('never mutates the state it was given', () => {
    const state = makeState({
      hands: [hand({ [TIGRE]: 5 }), hand({ [ROSA]: 3 })],
      claim: { wrestler: TIGRE, count: 1, seat: 0 },
      debuted: [TIGRE],
      turnSeat: 1,
    });
    applyMove(state, 1, { kind: 'play', wrestler: ROSA, count: 2 });
    expect(state.players[1]!.hand[ROSA]).toBe(3);
    expect(state.round.claim).toMatchObject({ wrestler: TIGRE });
  });
});

describe('ending a round', () => {
  it('hands the next round to the last player who played', () => {
    // Three players: 0 opened, 1 answered, then 2 and 0 both throw in the towel.
    const state = makeState({
      hands: [hand({ [TIGRE]: 5 }), hand({ [ROSA]: 5 }), hand({ [FANTASMA]: 5 })],
      claim: { wrestler: ROSA, count: 2, seat: 1 },
      debuted: [TIGRE, ROSA],
      turnSeat: 2,
    });
    const afterTwo = applyMove(state, 2, { kind: 'pass' });
    const afterZero = applyMove(afterTwo, 0, { kind: 'pass' });

    expect(afterZero.round.hostSeat).toBe(1);
    expect(afterZero.round.claim).toBeNull();
    expect(afterZero.round.passed.every((p) => !p)).toBe(true);
    // The cards played this round have been set aside.
    expect(afterZero.discarded[ROSA]).toBe(2);
  });

  it('moves hosting on when the round winner has just gone out', () => {
    const state = makeState({
      hands: [hand({ [TIGRE]: 5 }), hand({ [ROSA]: 2 }), hand({ [FANTASMA]: 5 })],
      claim: { wrestler: TIGRE, count: 1, seat: 0 },
      debuted: [TIGRE],
      turnSeat: 1,
    });
    // Seat 1 empties their hand to win the round...
    const played = applyMove(state, 1, { kind: 'play', wrestler: ROSA, count: 2 });
    expect(played.players[1]!.finishedAt).toBe(0);
    // ...so seats 2 and 0 fold and hosting skips past the finished player.
    const afterTwo = applyMove(played, 2, { kind: 'pass' });
    const afterZero = applyMove(afterTwo, 0, { kind: 'pass' });
    expect(afterZero.round.hostSeat).toBe(2);
  });
});

describe('ending a season', () => {
  it('scores +2 / +1 / -1 and sends the next season to the last-place player', () => {
    // Seats 0 and 1 are one card from going out; seat 2 will be left holding cards.
    let state = makeState({
      hands: [hand({ [TIGRE]: 1 }), hand({ [ROSA]: 2 }), hand({ [FANTASMA]: 5 })],
      debuted: [TIGRE, ROSA],
      turnSeat: 0,
    });
    state = applyMove(state, 0, { kind: 'play', wrestler: TIGRE, count: 1 });
    expect(state.players[0]!.finishedAt).toBe(0);

    state = applyMove(state, 1, { kind: 'play', wrestler: ROSA, count: 2 });

    expect(state.phase).toBe('seasonEnd');
    expect(state.players.map((p) => p.score)).toEqual([2, 1, -1]);
    expect(state.players[0]!.seasonWins).toBe(1);
    expect(state.lastSeasonWinner).toBe(0);
    expect(state.nextSeasonHost).toBe(2);
  });

  it('refuses further moves once the season is over', () => {
    let state = makeState({
      hands: [hand({ [TIGRE]: 1 }), hand({ [ROSA]: 1 })],
      debuted: [TIGRE],
      turnSeat: 0,
    });
    state = applyMove(state, 0, { kind: 'play', wrestler: TIGRE, count: 1 });
    expect(state.phase).toBe('seasonEnd');
    expect(() => applyMove(state, 1, { kind: 'pass' })).toThrow(/not in play/);
  });
});
