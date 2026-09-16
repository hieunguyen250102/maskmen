/**
 * Move legality and move application.
 *
 * `legalPlays` is the single authority on what a player may do. The UI calls it
 * to light up affordances and the server calls it to validate submissions, so
 * the rules live in exactly one place.
 */

import { addRelation, isKnownStronger } from './order.js';
import {
  MAX_PLAY_SIZE,
  WRESTLER_COUNT,
  type GameState,
  type LegalPlay,
  type Move,
  type PlayerState,
  type WrestlerType,
} from './types.js';

export function handTotal(hand: readonly number[]): number {
  let total = 0;
  for (const n of hand) total += n;
  return total;
}

export function isFinished(player: PlayerState): boolean {
  return player.finishedAt !== null;
}

/** Can this seat still act in the current round? */
export function isActive(state: GameState, seat: number): boolean {
  const player = state.players[seat];
  if (!player) return false;
  return !isFinished(player) && !state.round.passed[seat];
}

/** Seats that can still act this round. */
export function activeSeats(state: GameState): number[] {
  return state.players.map((p) => p.seat).filter((seat) => isActive(state, seat));
}

/** Seats still holding cards this season. */
export function seatsWithCards(state: GameState): number[] {
  return state.players.filter((p) => handTotal(p.hand) > 0).map((p) => p.seat);
}

/**
 * Every play the given seat may legally submit right now.
 *
 * Returns an empty array when it is not that seat's turn, when the game is not
 * in play, or when the player has no legal option (in which case their only
 * move is to throw in the towel).
 */
export function legalPlays(state: GameState, seat: number): LegalPlay[] {
  if (state.phase !== 'playing') return [];
  if (state.round.turnSeat !== seat) return [];
  if (!isActive(state, seat)) return [];

  const player = state.players[seat];
  if (!player) return [];
  const hand = player.hand;
  const { claim } = state.round;
  const plays: LegalPlay[] = [];

  if (claim === null) {
    // Opening the round. Any type in hand, 1-3 copies -- except a wrestler that
    // has not yet appeared this season, which the host may only introduce one
    // card at a time.
    for (let w = 0; w < WRESTLER_COUNT; w++) {
      const held = hand[w] ?? 0;
      if (held === 0) continue;
      const max = state.debuted[w] ? Math.min(MAX_PLAY_SIZE, held) : 1;
      for (let c = 1; c <= max; c++) {
        plays.push({ wrestler: w, count: c, kind: 'host' });
      }
    }
    return plays;
  }

  const { wrestler: standing, count: n } = claim;
  for (let w = 0; w < WRESTLER_COUNT; w++) {
    const held = hand[w] ?? 0;
    if (held === 0) continue;
    // "You may not play a wrestler that is the same type as or weaker than the
    // previously played wrestler."
    if (w === standing) continue;
    if (isKnownStronger(state.order, standing, w)) continue;

    if (isKnownStronger(state.order, w, standing)) {
      // Option 2: already known to be stronger, so match the count exactly.
      if (held >= n) plays.push({ wrestler: w, count: n, kind: 'beat' });
    } else {
      // Option 1: incomparable, so pay one extra card to prove it is stronger.
      const needed = n + 1;
      if (needed <= MAX_PLAY_SIZE && held >= needed) {
        plays.push({ wrestler: w, count: needed, kind: 'raise' });
      }
    }
  }
  return plays;
}

/** May this seat throw in the towel? The host must open the round, so cannot. */
export function canPass(state: GameState, seat: number): boolean {
  if (state.phase !== 'playing') return false;
  if (state.round.turnSeat !== seat) return false;
  if (!isActive(state, seat)) return false;
  return state.round.claim !== null;
}

/** Look up a specific play in the legal set, or null if it is not allowed. */
export function findLegalPlay(
  state: GameState,
  seat: number,
  wrestler: WrestlerType,
  count: number,
): LegalPlay | null {
  return legalPlays(state, seat).find((p) => p.wrestler === wrestler && p.count === count) ?? null;
}

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

export function cloneState(state: GameState): GameState {
  return {
    players: state.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    seasonNo: state.seasonNo,
    maxSeasons: state.maxSeasons,
    order: state.order.map((row) => row.slice()),
    debuted: state.debuted.slice(),
    round: {
      hostSeat: state.round.hostSeat,
      turnSeat: state.round.turnSeat,
      passed: state.round.passed.slice(),
      claim: state.round.claim ? { ...state.round.claim } : null,
      pile: state.round.pile.slice(),
    },
    finishOrder: state.finishOrder.slice(),
    discarded: state.discarded.slice(),
    phase: state.phase,
    lastSeasonWinner: state.lastSeasonWinner,
    nextSeasonHost: state.nextSeasonHost,
    log: state.log.slice(),
  };
}

/**
 * Apply a move for `seat`, returning the resulting state.
 *
 * Throws IllegalMoveError if the move is not permitted; the caller is expected
 * to have offered only legal options, so a throw means either a client bug or a
 * cheating attempt. The input state is never mutated.
 */
export function applyMove(state: GameState, seat: number, move: Move): GameState {
  if (state.phase !== 'playing') {
    throw new IllegalMoveError(`game is not in play (phase: ${state.phase})`);
  }
  if (state.round.turnSeat !== seat) {
    throw new IllegalMoveError(`not seat ${seat}'s turn (turn: ${state.round.turnSeat})`);
  }
  if (!isActive(state, seat)) {
    throw new IllegalMoveError(`seat ${seat} cannot act this round`);
  }

  return move.kind === 'pass' ? applyPass(state, seat) : applyPlay(state, seat, move.wrestler, move.count);
}

function applyPass(state: GameState, seat: number): GameState {
  if (!canPass(state, seat)) {
    throw new IllegalMoveError('the host must open the round and may not pass');
  }
  const next = cloneState(state);
  next.round.passed[seat] = true;
  next.log.push({ type: 'pass', seat });
  return advance(next);
}

function applyPlay(
  state: GameState,
  seat: number,
  wrestler: WrestlerType,
  count: number,
): GameState {
  const play = findLegalPlay(state, seat, wrestler, count);
  if (!play) {
    throw new IllegalMoveError(
      `seat ${seat} may not play ${count}x wrestler ${wrestler} against ${describeClaim(state)}`,
    );
  }

  const next = cloneState(state);
  const player = next.players[seat]!;
  player.hand[wrestler] = (player.hand[wrestler] ?? 0) - count;
  next.round.pile[wrestler] = (next.round.pile[wrestler] ?? 0) + count;

  // An Option 1 raise is what actually creates knowledge: by paying an extra
  // card the player proves this wrestler beats the standing claim.
  if (play.kind === 'raise' && next.round.claim) {
    next.order = addRelation(next.order, wrestler, next.round.claim.wrestler);
  }

  next.debuted[wrestler] = true;
  next.round.claim = { wrestler, count, seat };
  next.log.push({ type: 'play', seat, wrestler, count, kind: play.kind });

  if (handTotal(player.hand) === 0) {
    const place = next.finishOrder.length;
    player.finishedAt = place;
    next.finishOrder.push(seat);
    next.log.push({ type: 'finished', seat, place });
  }

  return advance(next);
}

function describeClaim(state: GameState): string {
  const claim = state.round.claim;
  return claim ? `${claim.count}x wrestler ${claim.wrestler}` : 'an open table';
}

/**
 * Move the game forward after a move has been recorded: end the season if only
 * one player still holds cards, otherwise end the round if everyone but one
 * player is out, otherwise pass the turn clockwise.
 */
function advance(state: GameState): GameState {
  // The season runs until only one player still has cards.
  if (seatsWithCards(state).length <= 1) {
    return endSeason(state);
  }
  // The round ends once everyone except the player holding the table has
  // thrown in the towel. This is deliberately not "one active player left":
  // if the claim holder just emptied their hand they drop out of the active
  // set, and the others must still get their chance to answer the claim.
  if (contenders(state).length === 0) {
    return endRound(state);
  }
  state.round.turnSeat = nextActiveSeat(state, state.round.turnSeat);
  return state;
}

/**
 * Seats that could still take the table away from whoever currently holds it.
 * The claim holder is excluded: they have nothing left to answer.
 */
function contenders(state: GameState): number[] {
  const holder = state.round.claim?.seat;
  return activeSeats(state).filter((seat) => seat !== holder);
}

/** Next seat clockwise that can still act this round. */
function nextActiveSeat(state: GameState, from: number): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (isActive(state, seat)) return seat;
  }
  return from;
}

/** Next seat clockwise (including `from` itself) that still holds cards. */
function nextSeatWithCards(state: GameState, from: number): number {
  const n = state.players.length;
  for (let step = 0; step < n; step++) {
    const seat = (from + step) % n;
    if (handTotal(state.players[seat]!.hand) > 0) return seat;
  }
  return from;
}

function endRound(state: GameState): GameState {
  // The last player to have played cards wins the round and hosts the next one.
  // If that play emptied their hand, hosting moves clockwise to the next player
  // who still has cards.
  const winnerSeat = state.round.claim?.seat ?? state.round.hostSeat;
  state.log.push({ type: 'roundEnd', winnerSeat });

  for (let w = 0; w < WRESTLER_COUNT; w++) {
    state.discarded[w] = (state.discarded[w] ?? 0) + (state.round.pile[w] ?? 0);
  }

  const nextHost = nextSeatWithCards(state, winnerSeat);
  state.round = {
    hostSeat: nextHost,
    turnSeat: nextHost,
    passed: new Array<boolean>(state.players.length).fill(false),
    claim: null,
    pile: new Array<number>(WRESTLER_COUNT).fill(0),
  };
  state.log.push({ type: 'roundStart', hostSeat: nextHost });
  return state;
}

/**
 * Score the season: +2 for going out first, +1 for second, -1 for the single
 * player left holding cards, 0 for everyone in between.
 */
function endSeason(state: GameState): GameState {
  const stragglers = seatsWithCards(state);
  const deltas = new Array<number>(state.players.length).fill(0);

  const first = state.finishOrder[0];
  if (first !== undefined) deltas[first] = 2;
  const second = state.finishOrder[1];
  if (second !== undefined) deltas[second] = 1;
  for (const seat of stragglers) deltas[seat] = -1;

  for (const player of state.players) {
    player.score += deltas[player.seat] ?? 0;
  }
  if (first !== undefined) {
    state.players[first]!.seasonWins += 1;
    state.lastSeasonWinner = first;
  }

  state.nextSeasonHost = stragglers[0] ?? first ?? state.round.hostSeat;
  state.phase = 'seasonEnd';
  state.log.push({ type: 'seasonEnd', scores: deltas });
  return state;
}
