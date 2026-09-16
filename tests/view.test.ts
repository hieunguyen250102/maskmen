import { describe, expect, it } from 'vitest';
import { applyMove, createGame, handTotal, legalPlays } from '@/engine/index.js';
import { toGameView } from '@/server/view.js';
import type { GameState } from '@/engine/types.js';

/** Play a handful of legal moves so the state is genuinely mid-game. */
function midGame(): GameState {
  let state = createGame(4, { seed: 4242 });
  for (let i = 0; i < 12 && state.phase === 'playing'; i++) {
    const seat = state.round.turnSeat;
    const [play] = legalPlays(state, seat);
    state = play
      ? applyMove(state, seat, { kind: 'play', wrestler: play.wrestler, count: play.count })
      : applyMove(state, seat, { kind: 'pass' });
  }
  return state;
}

describe('redaction', () => {
  it('gives a seated player their own hand and nobody else', () => {
    const state = midGame();
    const view = toGameView(state, 1);

    expect(view.yourSeat).toBe(1);
    expect(view.yourHand).toEqual(state.players[1]!.hand);

    // Opponents are reduced to a total, which is all the table can actually see.
    for (const p of view.players) {
      if (p.seat === 1) continue;
      expect(p.cardsLeft).toBe(handTotal(state.players[p.seat]!.hand));
      expect(p).not.toHaveProperty('hand');
    }
  });

  it('gives spectators no hand at all', () => {
    const view = toGameView(midGame(), null);
    expect(view.yourSeat).toBeNull();
    expect(view.yourHand).toBeNull();
    expect(view.yourLegalPlays).toEqual([]);
    expect(view.youMayPass).toBe(false);
  });

  it('never serializes an opponent hand that differs from the viewer', () => {
    const state = midGame();

    // Make one opponent's hand unmistakable, then assert that fingerprint never
    // reaches a viewer who is not that player.
    const marker = [7, 0, 0, 0, 0, 3];
    state.players[2]!.hand = marker.slice();

    for (const viewer of [0, 1, 3, null]) {
      const json = JSON.stringify(toGameView(state, viewer));
      expect(json).not.toContain(JSON.stringify(marker));
    }
    // ...while seat 2 itself still receives it.
    expect(toGameView(state, 2).yourHand).toEqual(marker);
  });

  it('exposes only public table information', () => {
    const state = midGame();
    const view = toGameView(state, null);
    expect(view.pile).toEqual(state.round.pile);
    expect(view.discarded).toEqual(state.discarded);
    expect(view.claim).toEqual(state.round.claim);
    expect(view.lines.flat().every((w) => state.debuted[w])).toBe(true);
    // The log is a tail; logStart places it within the full match log.
    expect(view.logStart + view.log.length).toBe(state.log.length);
  });

  it('reports legal plays only for the viewer whose turn it is', () => {
    const state = midGame();
    const onTurn = state.round.turnSeat;
    expect(toGameView(state, onTurn).yourLegalPlays).toEqual(legalPlays(state, onTurn));

    const other = state.players.find((p) => p.seat !== onTurn)!.seat;
    expect(toGameView(state, other).yourLegalPlays).toEqual([]);
  });
});
