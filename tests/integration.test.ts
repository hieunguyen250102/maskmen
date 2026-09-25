/**
 * End-to-end over real sockets: a room, three players, a spectator, a full
 * season, a reconnect, and chat. Next.js is not involved -- this exercises the
 * server half on a bare HTTP server.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { auth } from '@/server/auth.js';
import { registerHandlers, type GameServer } from '@/server/handlers.js';
import { resetRooms } from '@/server/rooms.js';
import type { Move } from '@/engine/types.js';
import type { Ack, ChatMessage, GameView, JoinResult, RoomView } from '@/shared/protocol.js';

let httpServer: HttpServer;
let ioServer: GameServer;
let port: number;
const clients: Socket[] = [];

beforeEach(async () => {
  resetRooms();
  httpServer = createServer();
  ioServer = new Server(httpServer);
  registerHandlers(ioServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

/** A test client that remembers the latest room and game view it was sent. */
interface Client {
  socket: Socket;
  room: RoomView | null;
  view: GameView | null;
  chat: ChatMessage[];
  emit: <T>(event: string, ...args: unknown[]) => Promise<Ack<T>>;
}

let logins = 0;

/**
 * A login token for a fresh address. With no mail provider outside production
 * the server hands the code straight back, the same shortcut the dev UI uses.
 */
async function loginToken(): Promise<string> {
  const n = ++logins;
  const email = `player${n}@test.local`;
  const sent = await auth.requestCode(email, `test-${n}`);
  if (!sent.ok || !sent.devCode) throw new Error('no dev code');
  const verified = auth.verifyCode(email, sent.devCode, sent.challenge);
  if (!verified.ok) throw new Error(verified.error);
  return verified.token;
}

function makeClient({ loggedIn = true } = {}): Client {
  const socket = connect(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: (cb) => (loggedIn ? void loginToken().then((token) => cb({ token })) : cb({})),
  });
  clients.push(socket);

  const client: Client = {
    socket,
    room: null,
    view: null,
    chat: [],
    emit: (event, ...args) =>
      new Promise((resolve) => socket.emit(event, ...args, resolve)),
  };

  socket.on('room:state', (room: RoomView) => (client.room = room));
  socket.on('game:view', (view: GameView | null) => (client.view = view));
  socket.on('chat:history', (messages: ChatMessage[]) => (client.chat = messages));
  socket.on('chat:message', (message: ChatMessage) => client.chat.push(message));
  return client;
}

async function join(client: Client, roomCode: string, nickname: string, token: string) {
  const res = await client.emit<JoinResult>('room:join', {
    roomCode,
    playerToken: token,
    nickname,
  });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

/** Wait until `check` passes, polling the event loop. */
async function until(check: () => boolean, label: string, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}

describe('a room over the wire', () => {
  it('seats players, hides hands, and plays a season to scoring', async () => {
    const ana = makeClient();
    const created = await join(ana, '', 'Ana', 'token-ana');
    const code = created.room.code;
    expect(created.seat).toBe(0);

    const bo = makeClient();
    const cy = makeClient();
    await join(bo, code, 'Bo', 'token-bo');
    await join(cy, code, 'Cy', 'token-cy');

    const watcher = makeClient();
    const watched = await join(watcher, code, 'Wanda', 'token-wanda');
    // Four joiners, three seats claimed automatically and the fourth still free,
    // so Wanda gets a seat too -- drop it to become a spectator.
    if (watched.seat !== null) {
      const left = await watcher.emit('seat:leave');
      expect(left.ok).toBe(true);
    }
    await until(() => watcher.room?.you.seat === null, 'Wanda to reach the bleachers');

    const start = await ana.emit('game:start');
    expect(start.ok).toBe(true);
    await until(
      () => [ana, bo, cy, watcher].every((c) => c.view !== null),
      'everyone to receive the deal',
    );

    // Every seated player holds 15 cards; the spectator sees counts but no hand.
    for (const c of [ana, bo, cy]) {
      expect(c.view!.yourHand!.reduce((a, b) => a + b, 0)).toBe(15);
    }
    expect(watcher.view!.yourHand).toBeNull();
    expect(watcher.view!.players.map((p) => p.cardsLeft)).toEqual([15, 15, 15]);

    // Nobody's payload carries anybody else's hand.
    for (const c of [ana, bo, cy, watcher]) {
      const others = [ana, bo, cy].filter((o) => o !== c);
      const json = JSON.stringify(c.view);
      for (const other of others) {
        expect(json).not.toContain(JSON.stringify(other.view!.yourHand));
      }
    }

    // Drive the season with whatever the server says is legal.
    const bySeat = new Map([
      [0, ana],
      [1, bo],
      [2, cy],
    ]);
    for (let i = 0; i < 400; i++) {
      const view = ana.view!;
      if (view.phase !== 'playing') break;
      const actor = bySeat.get(view.turnSeat)!;
      await until(
        () => actor.view?.turnSeat === view.turnSeat && actor.view.phase === 'playing',
        `seat ${view.turnSeat} to see its turn`,
      );
      const mine = actor.view!;
      const move: Move = mine.yourLegalPlays[0]
        ? {
            kind: 'play',
            wrestler: mine.yourLegalPlays[0].wrestler,
            count: mine.yourLegalPlays[0].count,
          }
        : { kind: 'pass' };
      const res = await actor.emit('game:move', move);
      expect(res.ok).toBe(true);
    }

    // Every client, spectator included, must land on the finished season.
    await until(
      () => [ana, bo, cy, watcher].every((c) => c.view?.phase === 'seasonEnd'),
      'the season to end for everyone',
    );

    // Exactly one player is left holding cards, and scoring is +2 / +1 / -1.
    const players = ana.view!.players;
    expect(players.filter((p) => p.cardsLeft > 0)).toHaveLength(1);
    expect([...players.map((p) => p.score)].sort((a, b) => b - a)).toEqual([2, 1, -1]);

    // The spectator saw the whole thing, still without a hand.
    expect(watcher.view!.phase).toBe('seasonEnd');
    expect(watcher.view!.yourHand).toBeNull();
  });

  it('rejects moves out of turn and from spectators', async () => {
    const ana = makeClient();
    const { room } = await join(ana, '', 'Ana', 'token-ana');
    const bo = makeClient();
    await join(bo, room.code, 'Bo', 'token-bo');
    await ana.emit('game:start');
    await until(() => ana.view !== null && bo.view !== null, 'the deal');

    const offTurn = ana.view!.turnSeat === 0 ? bo : ana;
    const res = await offTurn.emit('game:move', { kind: 'pass' });
    expect(res).toMatchObject({ ok: false });

    const watcher = makeClient();
    await join(watcher, room.code, 'Wanda', 'token-wanda');
    const spectatorMove = await watcher.emit('game:move', { kind: 'pass' });
    expect(spectatorMove).toMatchObject({ ok: false, error: 'khán giả không thể đánh bài' });
  });

  it('lets only the room owner start the match', async () => {
    const ana = makeClient();
    const { room } = await join(ana, '', 'Ana', 'token-ana');
    const bo = makeClient();
    await join(bo, room.code, 'Bo', 'token-bo');

    expect(await bo.emit('game:start')).toMatchObject({ ok: false });
    expect(await ana.emit('game:start')).toMatchObject({ ok: true });
  });

  it('holds a seat through a disconnect and hands the hand back on return', async () => {
    const ana = makeClient();
    const { room } = await join(ana, '', 'Ana', 'token-ana');
    const bo = makeClient();
    await join(bo, room.code, 'Bo', 'token-bo');
    await ana.emit('game:start');
    await until(() => bo.view !== null, 'the deal');

    const handBefore = bo.view!.yourHand!.slice();
    bo.socket.disconnect();
    await until(
      () => ana.room?.seats[1]?.connected === false,
      'the table to show Bo as dropped',
    );
    // The seat is held, not vacated, while a game is running.
    expect(ana.room!.seats[1]).not.toBeNull();

    const boAgain = makeClient();
    await join(boAgain, room.code, 'Bo', 'token-bo');
    await until(() => boAgain.view !== null, 'Bo to get their view back');
    expect(boAgain.view!.yourSeat).toBe(1);
    expect(boAgain.view!.yourHand).toEqual(handBefore);
  });

  it('carries chat to everyone including spectators, and rate limits it', async () => {
    const ana = makeClient();
    const { room } = await join(ana, '', 'Ana', 'token-ana');
    const watcher = makeClient();
    await join(watcher, room.code, 'Wanda', 'token-wanda');

    expect(await ana.emit('chat:send', { text: 'who wants to lose?' })).toMatchObject({ ok: true });
    await until(
      () => watcher.chat.some((m) => m.text === 'who wants to lose?' && m.nickname === 'Ana'),
      'the message to reach the bleachers',
    );

    // Six in a row trips the burst limit.
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await ana.emit('chat:send', { text: `spam ${i}` }));
    expect(results.some((r) => !r.ok)).toBe(true);
  });

  it('needs a login to create or join a room', async () => {
    const ana = makeClient();
    const { room } = await join(ana, '', 'Ana', 'token-ana');

    const stranger = makeClient({ loggedIn: false });
    for (const roomCode of ['', room.code]) {
      const res = await stranger.emit('room:join', { roomCode, playerToken: 'token-x', nickname: 'X' });
      expect(res).toMatchObject({ ok: false, error: 'Bạn cần đăng nhập trước' });
    }
  });

  it('refuses an unknown room code', async () => {
    const ana = makeClient();
    const res = await ana.emit('room:join', {
      roomCode: 'ZZZZ',
      playerToken: 'token-ana',
      nickname: 'Ana',
    });
    expect(res).toMatchObject({ ok: false });
  });
});
