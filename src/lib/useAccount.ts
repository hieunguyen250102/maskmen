'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from 'oink-kit/client';
import type { SessionUser } from '@/shared/protocol.js';
import { authClient, getSocket } from './socket.js';

export interface AccountState {
  /** false until the stored login has been read (localStorage is client-only) */
  ready: boolean;
  account: Session | null;
  login: (session: Session) => void;
  logout: () => void;
}

/** Reconnect so the server sees the current login token. */
function reconnect(): void {
  const socket = getSocket();
  socket.disconnect();
  socket.connect();
}

/** The email login, kept in step with what the server says about the token. */
export function useAccount(): AccountState {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Session | null>(null);

  useEffect(() => {
    setAccount(authClient.loadSession());
    setReady(true);

    // Drop a stale login, and pick up a changed canHost (HOST_EMAILS edited on the server).
    const onSession = ({ user }: { user: SessionUser | null }) => {
      const current = authClient.loadSession();
      if (!current) return;
      if (!user) {
        authClient.saveSession(null);
        setAccount(null);
      } else if (user.canHost !== current.user.canHost) {
        const next = { ...current, user };
        authClient.saveSession(next);
        setAccount(next);
      }
    };
    const socket = getSocket();
    socket.on('session', onSession);
    return () => {
      socket.off('session', onSession);
    };
  }, []);

  const login = useCallback((session: Session) => {
    authClient.saveSession(session);
    setAccount(session);
    reconnect();
  }, []);

  const logout = useCallback(() => {
    authClient.saveSession(null);
    setAccount(null);
    reconnect();
  }, []);

  return { ready, account, login, logout };
}
