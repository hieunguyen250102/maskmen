/**
 * Redaction: the only path from GameState to the wire.
 *
 * A player's hand is the whole secret in maskmen, so the full GameState must
 * never leave this process. Everything the client receives is built here, and
 * an opponent's per-wrestler counts are simply not present in the output --
 * not hidden by the UI, not filtered later, absent from the payload.
 */

import { strengthLines } from '@/engine/order.js';
import { canPass, handTotal, legalPlays } from '@/engine/rules.js';
import { winners } from '@/engine/game.js';
import type { GameState } from '@/engine/types.js';
import type { GameView, PublicPlayer } from '@/shared/protocol.js';

/** How many trailing log entries to ship. Enough to narrate, not the whole match. */
const LOG_TAIL = 40;

/**
 * Build the view for one viewer.
 *
 * @param viewerSeat the viewer's seat, or null for a spectator.
 */
export function toGameView(state: GameState, viewerSeat: number | null): GameView {
  const players: PublicPlayer[] = state.players.map((p) => ({
    seat: p.seat,
    cardsLeft: handTotal(p.hand),
    finishedAt: p.finishedAt,
    score: p.score,
    seasonWins: p.seasonWins,
    passed: state.round.passed[p.seat] ?? false,
  }));

  const seated = viewerSeat !== null && viewerSeat >= 0 && viewerSeat < state.players.length;
  const own = seated ? state.players[viewerSeat] : undefined;

  return {
    phase: state.phase,
    seasonNo: state.seasonNo,
    maxSeasons: state.maxSeasons,
    players,

    lines: strengthLines(state.order, state.debuted),
    debuted: state.debuted.slice(),
    pile: state.round.pile.slice(),
    discarded: state.discarded.slice(),

    claim: state.round.claim ? { ...state.round.claim } : null,
    hostSeat: state.round.hostSeat,
    turnSeat: state.round.turnSeat,
    finishOrder: state.finishOrder.slice(),

    yourSeat: seated ? viewerSeat : null,
    // The one piece of secret information any viewer ever receives.
    yourHand: own ? own.hand.slice() : null,
    yourLegalPlays: seated ? legalPlays(state, viewerSeat) : [],
    youMayPass: seated ? canPass(state, viewerSeat) : false,

    log: state.log.slice(-LOG_TAIL),
    logStart: Math.max(0, state.log.length - LOG_TAIL),
    winners: state.phase === 'gameOver' ? winners(state) : null,
  };
}
