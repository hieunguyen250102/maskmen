/**
 * Core types for the maskmen rules engine.
 *
 * This module is pure: no I/O, no React, no sockets. Everything here is
 * deterministic and unit-testable.
 */

/** There are exactly 6 wrestler types, identified by index 0..5. */
export const WRESTLER_COUNT = 6;

/** 10 copies of each wrestler exist in the deck (60 cards total). */
export const COPIES_PER_WRESTLER = 10;

/** A player may never place more than 3 cards in a single play. */
export const MAX_PLAY_SIZE = 3;

/** Seats at a table. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Number of seasons in a 3-6 player game. */
export const SEASONS_PER_GAME = 4;

/** A 2-player game has no season limit; first to win this many seasons wins. */
export const TWO_PLAYER_SEASON_WINS = 3;

/**
 * A wrestler type, 0..5. Kept as a plain number so hands can be indexed
 * directly, but named for readability at call sites.
 */
export type WrestlerType = number;

/**
 * The six masks. `glyph` matters as much as `color`: the wrestlers must stay
 * distinguishable without relying on colour alone. `image` names the mask art
 * under public/masks/.
 */
export interface Wrestler {
  readonly id: WrestlerType;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
  readonly image: string;
}

export const WRESTLERS: readonly Wrestler[] = [
  { id: 0, name: 'Cam', glyph: '◆', color: '#e8913a', image: 'orange' },
  { id: 1, name: 'Đỏ', glyph: '●', color: '#e0453a', image: 'red' },
  { id: 2, name: 'Xám', glyph: '▲', color: '#8f99a3', image: 'grey' },
  { id: 3, name: 'Lam', glyph: '★', color: '#3f8fd0', image: 'blue' },
  { id: 4, name: 'Tím', glyph: '■', color: '#9268b8', image: 'purple' },
  { id: 5, name: 'Lục', glyph: '✦', color: '#5aab5f', image: 'green' },
];

/**
 * A hand is the number of copies held of each wrestler type.
 *
 * Cards of the same type are indistinguishable, so there is no reason to model
 * individual card objects -- a tally removes a whole class of identity bugs.
 * Always length WRESTLER_COUNT.
 */
export type Hand = number[];

/**
 * Known strength relations as a transitively-closed 6x6 matrix.
 * `order[a][b] === true` means "a is known to be stronger than b".
 *
 * This is the single source of truth for both move legality and rendering.
 * Relations are built up during a season and cleared between seasons.
 */
export type StrengthOrder = boolean[][];

export interface PlayerState {
  /** Stable seat index, 0-based, matching the seating order at the table. */
  readonly seat: number;
  hand: Hand;
  /**
   * Position in the finishing order for the current season (0 = first out),
   * or null while the player still holds cards.
   */
  finishedAt: number | null;
  /** Cumulative points across all completed seasons. */
  score: number;
  /** How many +2 season wins this player has taken (used for tie-breaks). */
  seasonWins: number;
}

/** The wrestler currently holding the table, and how many cards back it up. */
export interface TableClaim {
  wrestler: WrestlerType;
  count: number;
  /** Seat that played it. */
  seat: number;
}

export interface RoundState {
  /** Seat that opened this round. */
  hostSeat: number;
  /** Seat whose turn it is. */
  turnSeat: number;
  /** Per-seat: has this player thrown in the towel this round? */
  passed: boolean[];
  /** The standing claim, or null before the host has played. */
  claim: TableClaim | null;
  /** Total cards set aside this round, per wrestler type (for card accounting). */
  pile: number[];
}

export type Phase = 'playing' | 'seasonEnd' | 'gameOver';

export interface GameState {
  players: PlayerState[];
  /** 1-based season counter. */
  seasonNo: number;
  /** Null for 2-player games, which run until someone wins 3 seasons. */
  maxSeasons: number | null;
  order: StrengthOrder;
  /** Has this wrestler been played at all during the current season? */
  debuted: boolean[];
  round: RoundState;
  /** Seats in the order they emptied their hands this season. */
  finishOrder: number[];
  /** Cards set aside in previous rounds this season, per wrestler type. */
  discarded: number[];
  phase: Phase;
  /** Seat that won the most recent completed season, for the final tie-break. */
  lastSeasonWinner: number | null;
  /** Seat that hosts the next season: the last-place player of the one just ended. */
  nextSeasonHost: number | null;
  /** Append-only log of what happened, for the UI to narrate and animate. */
  log: GameEvent[];
}

/** A move a player may submit. */
export type Move =
  | { kind: 'play'; wrestler: WrestlerType; count: number }
  | { kind: 'pass' };

/**
 * How a legal play relates to the standing claim. Derived by the engine --
 * clients never assert which kind of play they are making.
 *
 * - `host`  : opens the round; there is no standing claim to beat.
 * - `raise` : Option 1. The wrestler is incomparable to the standing claim, so
 *             the player pays one extra card to *establish* that it is stronger.
 * - `beat`  : Option 2. The wrestler is already known to be stronger, so it
 *             matches the standing claim's card count exactly.
 */
export type PlayKind = 'host' | 'raise' | 'beat';

/** A play the current player is allowed to submit. */
export interface LegalPlay {
  wrestler: WrestlerType;
  count: number;
  kind: PlayKind;
}

export type GameEvent =
  | { type: 'seasonStart'; seasonNo: number; hostSeat: number }
  | { type: 'roundStart'; hostSeat: number }
  | { type: 'play'; seat: number; wrestler: WrestlerType; count: number; kind: PlayKind }
  | { type: 'pass'; seat: number }
  | { type: 'finished'; seat: number; place: number }
  | { type: 'roundEnd'; winnerSeat: number }
  | { type: 'seasonEnd'; scores: number[] }
  | { type: 'gameOver'; winners: number[] };

/** Starting hand size by player count, from the rulebook's setup chart. */
export function startingHandSize(playerCount: number): number {
  if (playerCount >= MIN_PLAYERS && playerCount <= 4) return 15;
  if (playerCount === 5) return 12;
  if (playerCount === 6) return 10;
  throw new RangeError(`maskmen supports ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${playerCount}`);
}
