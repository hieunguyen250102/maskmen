/**
 * Email-code login, shared with the other Oink games through oink-kit.
 *
 * Joining a room needs a login; creating one (an empty room code) also needs
 * a host account, see HOST_EMAILS. The per-browser player token is unchanged:
 * it still decides which seat you reclaim, the login is only a gate.
 */

import { createAuth } from 'oink-kit/server';

export type { User } from 'oink-kit/server';

export const auth = createAuth({ brand: 'maskmen', devSecret: 'maskmen-dev-secret', mailAccent: '#f4efe2' });
