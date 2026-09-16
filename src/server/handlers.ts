/**
 * Socket.IO wiring.
 *
 * Every incoming event is treated as untrusted: the server re-derives what is
 * legal from the engine and ignores anything the client claims about itself
 * beyond its player token.
 */

import type { Server, Socket } from 'socket.io';
import { applyMove, canPass, legalPlays } from '@/engine/rules.js';
import { createGame, startNextSeason } from '@/engine/game.js';
import { MAX_PLAYERS, type Move } from '@/engine/types.js';
import {
  DISCONNECT_AUTO_PASS_MS,
  MAX_CHAT_LENGTH,
  fail,
  isValidRoomCode,
  normalizeRoomCode,
  ok,
  sanitizeNickname,
  type ClientToServerEvents,
  type JoinRequest,
  type ServerToClientEvents,
} from '@/shared/protocol.js';
import {
  addSpectator,
  canStart,
  compactSeats,
  createRoom,
  getRoom,
  leaveSeat,
  makeChatMessage,
  occupiedSeats,
  pushChat,
  removeSocket,
  seatOfToken,
  takeSeat,
  toRoomView,
  touch,
  type Room,
} from './rooms.js';
import { toGameView } from './view.js';

export interface SocketData {
  playerToken: string;
  nickname: string;
  roomCode: string | null;
  /** Timestamps of recent chat messages, for rate limiting. */
  chatTimes: number[];
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 5000;

/**
 * Push fresh state to everyone in a room.
 *
 * Views are per-recipient because both the room view ("you") and the game view
 * (your hand, your legal plays) differ per viewer, so this cannot be a single
 * broadcast.
 */
async function broadcast(io: GameServer, room: Room): Promise<void> {
  const sockets = await io.in(room.code).fetchSockets();
  for (const s of sockets) {
    const token = s.data.playerToken;
    s.emit('room:state', toRoomView(room, token));
    const seat = seatOfToken(room, token);
    s.emit('game:view', room.game ? toGameView(room.game, seat?.seat ?? null) : null);
  }
}

function systemNotice(io: GameServer, room: Room, text: string): void {
  const message = pushChat(room, makeChatMessage(text, null));
  io.to(room.code).emit('chat:message', message);
}

/**
 * Fold a player who has dropped offline while on turn, so one closed tab cannot
 * freeze the table. The host of a round cannot pass, so we play their first
 * legal option instead of stalling.
 */
function scheduleAutoPass(io: GameServer, room: Room): void {
  if (room.autoPassTimer) {
    clearTimeout(room.autoPassTimer);
    room.autoPassTimer = null;
  }
  const game = room.game;
  if (!game || game.phase !== 'playing') return;

  const onTurn = room.seats[game.round.turnSeat];
  if (!onTurn || onTurn.socketId !== null) return;

  room.autoPassTimer = setTimeout(() => {
    room.autoPassTimer = null;
    const current = room.game;
    if (!current || current.phase !== 'playing') return;
    const seat = current.round.turnSeat;
    const holder = room.seats[seat];
    if (!holder || holder.socketId !== null) return;

    const move: Move | null = canPass(current, seat)
      ? { kind: 'pass' }
      : (() => {
          const [first] = legalPlays(current, seat);
          return first ? { kind: 'play' as const, wrestler: first.wrestler, count: first.count } : null;
        })();
    if (!move) return;

    room.game = applyMove(current, seat, move);
    systemNotice(io, room, `${holder.nickname} mất kết nối quá lâu nên được tự động bỏ lượt.`);
    void broadcast(io, room).then(() => scheduleAutoPass(io, room));
  }, DISCONNECT_AUTO_PASS_MS);
}

async function afterStateChange(io: GameServer, room: Room): Promise<void> {
  touch(room);
  await broadcast(io, room);
  scheduleAutoPass(io, room);
}

export function registerHandlers(io: GameServer): void {
  io.on('connection', (socket: GameSocket) => {
    socket.data.roomCode = null;
    socket.data.chatTimes = [];

    socket.on('room:join', async (req: JoinRequest, ack) => {
      const nickname = sanitizeNickname(req.nickname ?? '');
      const token = typeof req.playerToken === 'string' ? req.playerToken.slice(0, 64) : '';
      if (!token) return ack(fail('thiếu mã người chơi'));

      socket.data.playerToken = token;
      socket.data.nickname = nickname;

      // An empty code means "make me a room".
      let room: Room | undefined;
      if (!req.roomCode) {
        room = createRoom(token);
      } else {
        const code = normalizeRoomCode(req.roomCode);
        if (!isValidRoomCode(code)) return ack(fail('mã phòng không hợp lệ'));
        room = getRoom(code);
        if (!room) return ack(fail('không tìm thấy phòng — có thể phòng đã hết hạn'));
      }

      await socket.join(room.code);
      socket.data.roomCode = room.code;

      // Reclaim a held seat after a refresh, otherwise sit down or spectate.
      const held = seatOfToken(room, token);
      // A join from the socket that already holds the seat is a duplicate --
      // React mounts effects twice in development, and the landing page hands
      // the same socket over on navigation. Nothing to announce.
      const duplicate = held?.socketId === socket.id;
      if (held) {
        held.socketId = socket.id;
        held.nickname = nickname;
      } else {
        const spectator = { socketId: socket.id, nickname, playerToken: token };
        addSpectator(room, spectator);
        if (!req.asSpectator && room.game === null) {
          const free = room.seats.findIndex((s) => s === null);
          if (free !== -1) takeSeat(room, free, spectator);
        }
      }

      socket.emit('chat:history', room.chat);
      const seat = seatOfToken(room, token);
      if (!duplicate) {
        systemNotice(
          io,
          room,
          held
            ? `${nickname} đã kết nối lại.`
            : seat
              ? `${nickname} ngồi vào ghế ${seat.seat + 1}.`
              : `${nickname} đang xem.`,
        );
      }
      await afterStateChange(io, room);
      ack(ok({ room: toRoomView(room, token), seat: seat?.seat ?? null }));
    });

    socket.on('seat:take', async (req, ack) => {
      const room = currentRoom(socket);
      if (!room) return ack(fail('bạn chưa ở trong phòng nào'));
      if (room.game !== null) return ack(fail('ván đấu đã được chia bài'));
      const seat = Number(req?.seat);
      if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_PLAYERS) {
        return ack(fail('ghế không tồn tại'));
      }
      const taken = takeSeat(room, seat, {
        socketId: socket.id,
        nickname: socket.data.nickname,
        playerToken: socket.data.playerToken,
      });
      if (!taken) return ack(fail('ghế này đã có người ngồi'));
      await afterStateChange(io, room);
      ack(ok());
    });

    socket.on('seat:leave', async (ack) => {
      const room = currentRoom(socket);
      if (!room) return ack(fail('bạn chưa ở trong phòng nào'));
      if (!leaveSeat(room, socket.data.playerToken)) {
        return ack(fail('không thể rời ghế khi ván đấu đã bắt đầu'));
      }
      addSpectator(room, {
        socketId: socket.id,
        nickname: socket.data.nickname,
        playerToken: socket.data.playerToken,
      });
      await afterStateChange(io, room);
      ack(ok());
    });

    socket.on('game:start', async (ack) => {
      const room = currentRoom(socket);
      if (!room) return ack(fail('bạn chưa ở trong phòng nào'));
      if (socket.data.playerToken !== room.ownerToken) {
        return ack(fail('chỉ chủ phòng mới được bắt đầu trận'));
      }
      if (!canStart(room)) return ack(fail('cần từ 2 đến 6 người ngồi vào bàn'));

      compactSeats(room);
      room.game = createGame(occupiedSeats(room).length);
      systemNotice(io, room, 'Mùa 1 bắt đầu. Chuông đã rung!');
      await afterStateChange(io, room);
      ack(ok());
    });

    socket.on('game:move', async (move: Move, ack) => {
      const room = currentRoom(socket);
      if (!room?.game) return ack(fail('chưa có ván đấu nào'));
      const seat = seatOfToken(room, socket.data.playerToken);
      if (!seat) return ack(fail('khán giả không thể đánh bài'));
      if (room.game.round.turnSeat !== seat.seat) return ack(fail('chưa tới lượt bạn'));
      if (!isWellFormedMove(move)) return ack(fail('nước đi không đúng định dạng'));

      try {
        room.game = applyMove(room.game, seat.seat, move);
      } catch {
        // The engine's message is for debugging; the player only needs the verdict.
        return ack(fail('nước đi không hợp lệ'));
      }
      await afterStateChange(io, room);
      ack(ok());
    });

    socket.on('game:nextSeason', async (ack) => {
      const room = currentRoom(socket);
      if (!room?.game) return ack(fail('chưa có ván đấu nào'));
      if (socket.data.playerToken !== room.ownerToken) {
        return ack(fail('chỉ chủ phòng mới được chia mùa tiếp theo'));
      }
      if (room.game.phase !== 'seasonEnd') return ack(fail('mùa đấu vẫn đang diễn ra'));

      room.game = startNextSeason(room.game);
      systemNotice(
        io,
        room,
        room.game.phase === 'gameOver' ? 'Trận đấu kết thúc!' : `Mùa ${room.game.seasonNo} bắt đầu.`,
      );
      await afterStateChange(io, room);
      ack(ok());
    });

    socket.on('chat:send', (req, ack) => {
      const room = currentRoom(socket);
      if (!room) return ack(fail('bạn chưa ở trong phòng nào'));
      const text = String(req?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
      if (!text) return ack(fail('tin nhắn trống'));

      const now = Date.now();
      socket.data.chatTimes = socket.data.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
      if (socket.data.chatTimes.length >= CHAT_BURST) return ack(fail('bạn gửi hơi nhanh, chậm lại chút nhé'));
      socket.data.chatTimes.push(now);

      const seat = seatOfToken(room, socket.data.playerToken);
      const message = pushChat(
        room,
        makeChatMessage(text, { nickname: socket.data.nickname, seat: seat?.seat ?? null }),
      );
      io.to(room.code).emit('chat:message', message);
      ack(ok());
    });

    socket.on('disconnect', async () => {
      const room = currentRoom(socket);
      if (!room) return;
      removeSocket(room, socket.id);
      await afterStateChange(io, room);
    });
  });
}

function currentRoom(socket: GameSocket): Room | undefined {
  return socket.data.roomCode ? getRoom(socket.data.roomCode) : undefined;
}

/** Shape check only; legality is the engine's job. */
function isWellFormedMove(move: unknown): move is Move {
  if (typeof move !== 'object' || move === null) return false;
  const m = move as Record<string, unknown>;
  if (m.kind === 'pass') return true;
  return m.kind === 'play' && Number.isInteger(m.wrestler) && Number.isInteger(m.count);
}
