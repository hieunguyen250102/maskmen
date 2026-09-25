'use client';

import { io, type Socket } from 'socket.io-client';
import { createAuthClient } from 'oink-kit/client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/shared/protocol.js';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const TOKEN_KEY = 'maskmen.playerToken';
const NICKNAME_KEY = 'maskmen.nickname';

/** How long to wait for the game server before telling the player it is unreachable. */
export const CONNECT_TIMEOUT_MS = 8000;

export const UNREACHABLE_MESSAGE =
  'Không kết nối được máy chủ trò chơi. Hãy thử lại sau ít phút.';

/**
 * Where the Socket.IO server lives. Empty means the page's own origin, which is
 * right whenever the page is served by `server.ts`. Set it at build time when the
 * pages are hosted elsewhere (e.g. Vercel) and the game server runs on Render.
 */
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? '';

/**
 * Email login (shared with the other Oink games through oink-kit). The auth
 * routes live on the game server, next to Socket.IO.
 */
export const authClient = createAuthClient({
  storagePrefix: 'maskmen',
  serverUrl: SOCKET_URL || (typeof window === 'undefined' ? '' : window.location.origin),
});

let socket: GameSocket | null = null;

/**
 * One socket for the whole tab, reused across navigations so that moving from
 * the landing page into a room does not drop and re-establish the connection.
 */
export function getSocket(): GameSocket {
  if (!socket) {
    // `auth` is read on every (re)connect, so a fresh login takes effect on the next handshake.
    const options = { autoConnect: true, transports: ['websocket', 'polling'], auth: authClient.socketAuth };
    socket = SOCKET_URL ? io(SOCKET_URL, options) : io(options);
  }
  return socket;
}

/**
 * A stable per-browser identity. This is what lets a player reclaim their seat
 * (and their hand) after a refresh -- it is not authentication, and it is only
 * ever meaningful within a room.
 */
export function getPlayerToken(): string {
  if (typeof window === 'undefined') return '';
  let token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function getNickname(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(NICKNAME_KEY) ?? '';
}

export function setNickname(nickname: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NICKNAME_KEY, nickname);
}
