/**
 * The wire contract between browser and server.
 *
 * Both sides import this file, so an event that changes shape breaks the build
 * on whichever side has not caught up.
 */

import type { GameEvent, LegalPlay, Move, Phase, TableClaim, WrestlerType } from '@/engine/types.js';

export const MAX_NICKNAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 300;
export const CHAT_HISTORY_LIMIT = 200;
/** A disconnected player on turn is folded automatically after this long. */
export const DISCONNECT_AUTO_PASS_MS = 60_000;

export type Ack<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface SeatView {
  seat: number;
  nickname: string;
  connected: boolean;
  /** True for the player who may start the game and deal new seasons. */
  isOwner: boolean;
}

export interface SpectatorView {
  id: string;
  nickname: string;
}

export interface RoomView {
  code: string;
  seats: (SeatView | null)[];
  spectators: SpectatorView[];
  /** Whether a game is currently in progress. */
  started: boolean;
  you: {
    seat: number | null;
    nickname: string;
    isOwner: boolean;
  };
}

/**
 * What one viewer is allowed to know about the game.
 *
 * Everything here is either public at the table or belongs to the viewer. An
 * opponent's per-wrestler counts never appear: see `src/server/view.ts`.
 */
export interface PublicPlayer {
  seat: number;
  /** Total cards in hand -- a count, never which wrestlers they are. */
  cardsLeft: number;
  finishedAt: number | null;
  score: number;
  seasonWins: number;
  passed: boolean;
}

export interface GameView {
  phase: Phase;
  seasonNo: number;
  maxSeasons: number | null;
  players: PublicPlayer[];

  /**
   * Strength markers as the table lays them out: each line is a chain ordered
   * strongest-first. Separate lines mean the relative strength is still unknown.
   */
  lines: WrestlerType[][];
  debuted: boolean[];
  /** Cards face up on the table this round, per wrestler type. */
  pile: number[];
  /** Cards set aside in earlier rounds this season; public, they were played face up. */
  discarded: number[];

  claim: TableClaim | null;
  hostSeat: number;
  turnSeat: number;
  finishOrder: number[];

  /** Null for spectators. */
  yourSeat: number | null;
  /** Your own hand, per wrestler type. Null for spectators. */
  yourHand: number[] | null;
  yourLegalPlays: LegalPlay[];
  youMayPass: boolean;

  /** Recent events, oldest first, for narration and animation. */
  log: GameEvent[];
  /**
   * Absolute index of `log[0]` in the full match log. `log` is only a tail, so
   * this is what lets a client tell which events it has not animated yet.
   */
  logStart: number;
  /** Populated only once the match is over. */
  winners: number[] | null;
}

export interface ChatMessage {
  id: string;
  /** Null for system notices. */
  nickname: string | null;
  seat: number | null;
  text: string;
  at: number;
  system: boolean;
}

export interface JoinRequest {
  roomCode: string;
  playerToken: string;
  nickname: string;
  /** Join the bleachers rather than claiming a seat. */
  asSpectator?: boolean;
}

export interface JoinResult {
  room: RoomView;
  seat: number | null;
}

export interface ClientToServerEvents {
  'room:join': (req: JoinRequest, ack: (res: Ack<JoinResult>) => void) => void;
  'seat:take': (req: { seat: number }, ack: (res: Ack) => void) => void;
  'seat:leave': (ack: (res: Ack) => void) => void;
  'game:start': (ack: (res: Ack) => void) => void;
  'game:move': (move: Move, ack: (res: Ack) => void) => void;
  'game:nextSeason': (ack: (res: Ack) => void) => void;
  'chat:send': (req: { text: string }, ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'game:view': (view: GameView | null) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'chat:message': (message: ChatMessage) => void;
  'room:error': (error: { message: string }) => void;
}

export function ok(): Ack<undefined>;
export function ok<T>(data: T): Ack<T>;
export function ok<T>(data?: T): Ack<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string): Ack<never> {
  return { ok: false, error };
}

/** Room codes are short, unambiguous, and safe to read aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}

export function sanitizeNickname(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NICKNAME_LENGTH);
  return cleaned.length > 0 ? cleaned : 'Người chơi';
}
