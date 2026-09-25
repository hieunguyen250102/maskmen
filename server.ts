/**
 * Custom Next.js server.
 *
 * Next and Socket.IO share one HTTP server and one port, so there is no CORS
 * setup, no second process, and no proxy configuration in development.
 *
 * When the pages are hosted on another origin (e.g. Vercel, built with
 * NEXT_PUBLIC_SOCKET_URL pointing here), list that origin in CORS_ORIGINS,
 * comma-separated.
 */

import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import { authHandler } from 'oink-kit/server';
import { auth } from '@/server/auth.js';
import { registerHandlers, type GameServer } from '@/server/handlers.js';
import { reapIdleRooms } from '@/server/rooms.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const REAP_INTERVAL_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  await app.prepare();

  // POST /auth/request {email}, POST /auth/verify {email, code, challenge}.
  // Pages hosted elsewhere (Vercel) call these cross-origin, so answer CORS: for CORS_ORIGINS when set,
  // otherwise for anyone. That is safe here: the login uses no cookies, and requests are rate limited.
  const handleAuth = authHandler(auth, {
    allowOrigin: (origin) => corsOrigins.length === 0 || corsOrigins.includes(origin.replace(/\/$/, '')),
  });

  const httpServer = createServer((req, res) => {
    if (handleAuth(req, res)) return;
    handle(req, res).catch((error: unknown) => {
      console.error('request failed', error);
      res.statusCode = 500;
      res.end('internal error');
    });
  });

  const io: GameServer = new Server(httpServer, {
    // Trim the default 45s so a closed tab frees its seat reasonably promptly.
    pingTimeout: 20_000,
    ...(corsOrigins.length > 0 && { cors: { origin: corsOrigins } }),
  });
  registerHandlers(io);

  const reaper = setInterval(() => {
    const removed = reapIdleRooms();
    if (removed > 0) console.log(`reaped ${removed} idle room(s)`);
  }, REAP_INTERVAL_MS);
  reaper.unref();

  httpServer.listen(port, hostname, () => {
    console.log(`maskmen ready on http://localhost:${port}`);
  });
}

main().catch((error: unknown) => {
  console.error('failed to start', error);
  process.exit(1);
});
