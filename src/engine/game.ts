/**
 * Season and game lifecycle: dealing, starting seasons, and deciding the winner.
 */

import { emptyOrder } from './order.js';
import { handTotal } from './rules.js';
import {
  COPIES_PER_WRESTLER,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SEASONS_PER_GAME,
  TWO_PLAYER_SEASON_WINS,
  WRESTLER_COUNT,
  startingHandSize,
  type GameState,
  type Hand,
  type PlayerState,
} from './types.js';

/**
 * mulberry32: a small deterministic PRNG.
 *
 * Deals must be reproducible so a seeded simulation can replay a failure
 * exactly. Not cryptographically strong -- callers that need an unpredictable
 * deal should seed from `crypto.randomInt`.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/** The full 60-card deck as a flat list of wrestler types. */
function buildDeck(): number[] {
  const deck: number[] = [];
  for (let w = 0; w < WRESTLER_COUNT; w++) {
    for (let i = 0; i < COPIES_PER_WRESTLER; i++) deck.push(w);
  }
  return deck;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Shuffle all 60 cards and deal the per-player hand size from the setup chart.
 * With fewer than 6 players some cards go unused that season, which is why the
 * rulebook insists on reshuffling everything between seasons.
 */
export function dealHands(playerCount: number, rng: () => number): Hand[] {
  const size = startingHandSize(playerCount);
  const deck = shuffle(buildDeck(), rng);
  const hands: Hand[] = Array.from({ length: playerCount }, () =>
    new Array<number>(WRESTLER_COUNT).fill(0),
  );
  let i = 0;
  for (let seat = 0; seat < playerCount; seat++) {
    for (let c = 0; c < size; c++) {
      const card = deck[i++]!;
      hands[seat]![card]! += 1;
    }
  }
  return hands;
}

export interface NewGameOptions {
  seed?: number;
  /** Seat that opens season 1. Defaults to seat 0. */
  firstHost?: number;
}

export function createGame(playerCount: number, options: NewGameOptions = {}): GameState {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new RangeError(`maskmen supports ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${playerCount}`);
  }
  const rng = createRng(options.seed ?? randomSeed());
  const hands = dealHands(playerCount, rng);
  const firstHost = options.firstHost ?? 0;

  const players: PlayerState[] = hands.map((hand, seat) => ({
    seat,
    hand,
    finishedAt: null,
    score: 0,
    seasonWins: 0,
  }));

  return {
    players,
    seasonNo: 1,
    // A 2-player game runs until someone has won 3 seasons, so it has no cap.
    maxSeasons: playerCount === 2 ? null : SEASONS_PER_GAME,
    order: emptyOrder(),
    debuted: new Array<boolean>(WRESTLER_COUNT).fill(false),
    round: {
      hostSeat: firstHost,
      turnSeat: firstHost,
      passed: new Array<boolean>(playerCount).fill(false),
      claim: null,
      pile: new Array<number>(WRESTLER_COUNT).fill(0),
    },
    finishOrder: [],
    discarded: new Array<number>(WRESTLER_COUNT).fill(0),
    phase: 'playing',
    lastSeasonWinner: null,
    nextSeasonHost: null,
    log: [
      { type: 'seasonStart', seasonNo: 1, hostSeat: firstHost },
      { type: 'roundStart', hostSeat: firstHost },
    ],
  };
}

/** Has the match run its course? Only meaningful once a season has ended. */
export function isMatchOver(state: GameState): boolean {
  if (state.maxSeasons === null) {
    return state.players.some((p) => p.seasonWins >= TWO_PLAYER_SEASON_WINS);
  }
  return state.seasonNo >= state.maxSeasons;
}

/**
 * Final standings, best first. Ties are broken by more +2 season wins, then by
 * whoever won the most recent season; players still tied after that share the
 * result.
 */
export function winners(state: GameState): number[] {
  const best = state.players.reduce((max, p) => Math.max(max, p.score), -Infinity);
  let tied = state.players.filter((p) => p.score === best).map((p) => p.seat);
  if (tied.length === 1) return tied;

  const mostWins = Math.max(...tied.map((seat) => state.players[seat]!.seasonWins));
  tied = tied.filter((seat) => state.players[seat]!.seasonWins === mostWins);
  if (tied.length === 1) return tied;

  if (state.lastSeasonWinner !== null && tied.includes(state.lastSeasonWinner)) {
    return [state.lastSeasonWinner];
  }
  return tied;
}

/**
 * Advance past a finished season: either deal the next one or declare the match
 * over. The last-place player of the season just ended hosts the new one.
 */
export function startNextSeason(state: GameState, seed?: number): GameState {
  if (state.phase !== 'seasonEnd') {
    throw new Error(`cannot start a season from phase ${state.phase}`);
  }

  if (isMatchOver(state)) {
    return {
      ...state,
      phase: 'gameOver',
      log: [...state.log, { type: 'gameOver', winners: winners(state) }],
    };
  }

  const playerCount = state.players.length;
  const rng = createRng(seed ?? randomSeed());
  const hands = dealHands(playerCount, rng);
  const host = state.nextSeasonHost ?? 0;
  const seasonNo = state.seasonNo + 1;

  return {
    players: state.players.map((p, seat) => ({
      ...p,
      hand: hands[seat]!,
      finishedAt: null,
    })),
    seasonNo,
    maxSeasons: state.maxSeasons,
    // Markers are cleared between seasons: nothing carries over about strength.
    order: emptyOrder(),
    debuted: new Array<boolean>(WRESTLER_COUNT).fill(false),
    round: {
      hostSeat: host,
      turnSeat: host,
      passed: new Array<boolean>(playerCount).fill(false),
      claim: null,
      pile: new Array<number>(WRESTLER_COUNT).fill(0),
    },
    finishOrder: [],
    discarded: new Array<number>(WRESTLER_COUNT).fill(0),
    phase: 'playing',
    lastSeasonWinner: state.lastSeasonWinner,
    nextSeasonHost: null,
    log: [
      ...state.log,
      { type: 'seasonStart', seasonNo, hostSeat: host },
      { type: 'roundStart', hostSeat: host },
    ],
  };
}

/** Total cards a seat still holds. Re-exported for convenience. */
export function cardsLeft(state: GameState, seat: number): number {
  const player = state.players[seat];
  return player ? handTotal(player.hand) : 0;
}
