'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Move } from '@/engine/types.js';
import type { Ack, ChatMessage, GameView, RoomView } from '@/shared/protocol.js';
import { CONNECT_TIMEOUT_MS, getNickname, getPlayerToken, getSocket } from './socket.js';

export interface RoomConnection {
  connected: boolean;
  /** True once connecting has failed for long enough to tell the player. */
  unreachable: boolean;
  room: RoomView | null;
  view: GameView | null;
  chat: ChatMessage[];
  error: string | null;
  dismissError: () => void;
  takeSeat: (seat: number) => void;
  leaveSeat: () => void;
  startGame: () => void;
  submit: (move: Move) => void;
  nextSeason: () => void;
  sendChat: (text: string) => void;
}

/**
 * Connects to a room and keeps its state in sync.
 *
 * The server is the only authority: this hook never predicts a move's outcome,
 * it just submits and waits for the next `game:view`. At this scale the round
 * trip is imperceptible and it removes any chance of the board disagreeing with
 * the engine.
 */
export function useRoom(roomCode: string): RoomConnection {
  const [connected, setConnected] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const joined = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const join = () => {
      setConnected(true);
      socket.emit(
        'room:join',
        {
          roomCode,
          playerToken: getPlayerToken(),
          nickname: getNickname() || 'Người chơi',
        },
        (res) => {
          if (res.ok) {
            joined.current = roomCode;
            setRoom(res.data.room);
          } else {
            setError(res.error);
          }
        },
      );
    };

    if (socket.connected) join();
    socket.on('connect', join);
    const giveUp = setTimeout(() => {
      if (!socket.connected) setUnreachable(true);
    }, CONNECT_TIMEOUT_MS);
    const reached = () => setUnreachable(false);
    socket.on('connect', reached);
    socket.on('disconnect', () => setConnected(false));
    socket.on('room:state', setRoom);
    socket.on('game:view', setView);
    socket.on('chat:history', setChat);
    socket.on('chat:message', (message) => setChat((prev) => [...prev, message]));
    socket.on('room:error', (e) => setError(e.message));

    return () => {
      clearTimeout(giveUp);
      socket.off('connect', join);
      socket.off('connect', reached);
      socket.off('disconnect');
      socket.off('room:state');
      socket.off('game:view');
      socket.off('chat:history');
      socket.off('chat:message');
      socket.off('room:error');
    };
  }, [roomCode]);

  const report = useCallback((res: Ack<unknown>) => {
    if (!res.ok) setError(res.error);
  }, []);

  const takeSeat = useCallback(
    (seat: number) => getSocket().emit('seat:take', { seat }, report),
    [report],
  );
  const leaveSeat = useCallback(() => getSocket().emit('seat:leave', report), [report]);
  const startGame = useCallback(() => getSocket().emit('game:start', report), [report]);
  const submit = useCallback((move: Move) => getSocket().emit('game:move', move, report), [report]);
  const nextSeason = useCallback(() => getSocket().emit('game:nextSeason', report), [report]);
  const sendChat = useCallback(
    (text: string) => getSocket().emit('chat:send', { text }, report),
    [report],
  );

  return {
    connected,
    unreachable,
    room,
    view,
    chat,
    error,
    dismissError: () => setError(null),
    takeSeat,
    leaveSeat,
    startGame,
    submit,
    nextSeason,
    sendChat,
  };
}
