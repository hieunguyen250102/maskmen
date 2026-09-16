/**
 * In-memory room registry.
 *
 * Rooms live in a Map for the lifetime of the process: a restart drops every
 * game in progress, which is a deliberate trade for a site this size. Nothing
 * here touches sockets -- `handlers.ts` owns that.
 */

import { randomUUID } from 'node:crypto';
import { MAX_PLAYERS, MIN_PLAYERS, type GameState } from '@/engine/types.js';
import {
  CHAT_HISTORY_LIMIT,
  MAX_CHAT_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ChatMessage,
  type RoomView,
  type SeatView,
} from '@/shared/protocol.js';

export interface Seat {
  seat: number;
  nickname: string;
  /** Stable per-browser identity, used to reclaim a seat after a refresh. */
  playerToken: string;
  socketId: string | null;
}

export interface Spectator {
  socketId: string;
  nickname: string;
  playerToken: string;
}

export interface Room {
  code: string;
  seats: (Seat | null)[];
  spectators: Map<string, Spectator>;
  /** Token of the player who created the room; they start games and deal seasons. */
  ownerToken: string;
  game: GameState | null;
  chat: ChatMessage[];
  lastActivityAt: number;
  /** Pending auto-fold timer for a disconnected player on turn. */
  autoPassTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();

/** Rooms with nobody connected are reaped after this long. */
const IDLE_ROOM_MS = 2 * 60 * 60 * 1000;

function randomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function createRoom(ownerToken: string): Room {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();

  const room: Room = {
    code,
    seats: new Array<Seat | null>(MAX_PLAYERS).fill(null),
    spectators: new Map(),
    ownerToken,
    game: null,
    chat: [],
    lastActivityAt: Date.now(),
    autoPassTimer: null,
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function touch(room: Room): void {
  room.lastActivityAt = Date.now();
}

export function seatOfToken(room: Room, playerToken: string): Seat | null {
  return room.seats.find((s): s is Seat => s !== null && s.playerToken === playerToken) ?? null;
}

export function seatOfSocket(room: Room, socketId: string): Seat | null {
  return room.seats.find((s): s is Seat => s !== null && s.socketId === socketId) ?? null;
}

export function occupiedSeats(room: Room): Seat[] {
  return room.seats.filter((s): s is Seat => s !== null);
}

/**
 * Seat indices compacted to 0..n-1 in table order.
 *
 * The engine indexes players 0..n-1 with no gaps, but a room can have holes in
 * its seat list (seat 0 and seat 3 occupied, say). This maps between the two.
 */
export function seatOrder(room: Room): number[] {
  return occupiedSeats(room)
    .map((s) => s.seat)
    .sort((a, b) => a - b);
}

/**
 * Slide occupied seats down to 0..n-1, preserving table order.
 *
 * Called once when a game is dealt so that a room seat index and an engine
 * player index are the same number everywhere else in the codebase. Without
 * this, every read of the game state would need a mapping step and sooner or
 * later one of them would be missed.
 */
export function compactSeats(room: Room): void {
  const occupied = seatOrder(room).map((seat) => room.seats[seat]!);
  room.seats.fill(null);
  occupied.forEach((seat, index) => {
    seat.seat = index;
    room.seats[index] = seat;
  });
}

export function canStart(room: Room): boolean {
  const n = occupiedSeats(room).length;
  return room.game === null && n >= MIN_PLAYERS && n <= MAX_PLAYERS;
}

export function takeSeat(room: Room, seat: number, spectator: Spectator): Seat | null {
  if (seat < 0 || seat >= MAX_PLAYERS) return null;
  if (room.seats[seat] !== null) return null;
  // Seats cannot change hands mid-game: the engine's player list is fixed once
  // a game is dealt.
  if (room.game !== null) return null;

  const existing = seatOfToken(room, spectator.playerToken);
  if (existing) room.seats[existing.seat] = null;

  const taken: Seat = {
    seat,
    nickname: spectator.nickname,
    playerToken: spectator.playerToken,
    socketId: spectator.socketId,
  };
  room.seats[seat] = taken;
  room.spectators.delete(spectator.socketId);
  touch(room);
  return taken;
}

export function leaveSeat(room: Room, playerToken: string): boolean {
  const seat = seatOfToken(room, playerToken);
  if (!seat) return false;
  if (room.game !== null) return false;
  room.seats[seat.seat] = null;
  touch(room);
  return true;
}

export function addSpectator(room: Room, spectator: Spectator): void {
  room.spectators.set(spectator.socketId, spectator);
  touch(room);
}

export function removeSocket(room: Room, socketId: string): void {
  room.spectators.delete(socketId);
  const seat = seatOfSocket(room, socketId);
  if (seat) {
    if (room.game === null) {
      // Nothing is at stake before the deal, so free the seat for someone else.
      room.seats[seat.seat] = null;
    } else {
      // Mid-game the seat is held so the player can refresh and reclaim it.
      seat.socketId = null;
    }
  }
  touch(room);
}

export function pushChat(room: Room, message: ChatMessage): ChatMessage {
  room.chat.push(message);
  if (room.chat.length > CHAT_HISTORY_LIMIT) {
    room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);
  }
  touch(room);
  return message;
}

export function makeChatMessage(
  text: string,
  from: { nickname: string; seat: number | null } | null,
): ChatMessage {
  return {
    id: randomUUID(),
    nickname: from?.nickname ?? null,
    seat: from?.seat ?? null,
    text: text.slice(0, MAX_CHAT_LENGTH),
    at: Date.now(),
    system: from === null,
  };
}

export function toRoomView(room: Room, playerToken: string): RoomView {
  const seats: (SeatView | null)[] = room.seats.map((s) =>
    s === null
      ? null
      : {
          seat: s.seat,
          nickname: s.nickname,
          connected: s.socketId !== null,
          isOwner: s.playerToken === room.ownerToken,
        },
  );

  const mine = seatOfToken(room, playerToken);
  const spectator = [...room.spectators.values()].find((s) => s.playerToken === playerToken);

  return {
    code: room.code,
    seats,
    spectators: [...room.spectators.values()].map((s) => ({
      id: s.socketId,
      nickname: s.nickname,
    })),
    started: room.game !== null,
    you: {
      seat: mine?.seat ?? null,
      nickname: mine?.nickname ?? spectator?.nickname ?? 'Người chơi',
      isOwner: playerToken === room.ownerToken,
    },
  };
}

/** Drop rooms nobody has touched in hours so the Map cannot grow without bound. */
export function reapIdleRooms(now = Date.now()): number {
  let removed = 0;
  for (const [code, room] of rooms) {
    const connected =
      room.spectators.size > 0 || occupiedSeats(room).some((s) => s.socketId !== null);
    if (!connected && now - room.lastActivityAt > IDLE_ROOM_MS) {
      if (room.autoPassTimer) clearTimeout(room.autoPassTimer);
      rooms.delete(code);
      removed++;
    }
  }
  return removed;
}

export function roomCount(): number {
  return rooms.size;
}

/** Test seam: drop every room. */
export function resetRooms(): void {
  for (const room of rooms.values()) {
    if (room.autoPassTimer) clearTimeout(room.autoPassTimer);
  }
  rooms.clear();
}
