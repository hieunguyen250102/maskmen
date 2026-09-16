# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A realtime web version of *maskmen*, the Oink Games card game: 2&ndash;6 players at a table, plus
unlimited spectators, plus chat, in one room.

## Commands

```bash
npm run dev          # Next + Socket.IO on http://localhost:3000 (one process, one port)
npm run build        # production build
npm start            # serve the production build
npm test             # all vitest suites
npm run typecheck    # tsc --noEmit
npm run images       # re-encode images/*.png into public/masks and public/belts (WebP)
```

Run one suite or one test:

```bash
npx vitest run tests/rules.test.ts
npx vitest run -t 'requires exactly one more card'
npx vitest              # watch mode
```

`next.config.ts` is **not** in the tsx watcher's dependency graph, so changing it needs a full
restart of `npm run dev`, not just a save.

## Reading the rulebook

`rule.pdf` is the official Oink manual (EN, ver 1.1) as a **scan** &mdash; there is no text layer, so
`pdftotext` returns nothing. The two pages are JPEGs inside Flate streams (objects `4 0 obj` and
`13 0 obj`); extract them with `zlib.decompress` on the stream bytes and read the images.

## The rules, as implemented

Strength is **not** a card count. It is a **partial order over the 6 wrestler types**, built edge by
edge during a season. Card counts are only the bidding mechanism. Everything below follows from that.

- **Deck**: 6 types &times; 10 = 60 cards. Deal per season: **2&ndash;4p &rarr; 15, 5p &rarr; 12, 6p &rarr; 10**.
  Leftovers go unused that season, which is why all 60 are reshuffled between seasons.
- **Round open (host)**: one type, **1&ndash;3 copies** &mdash; but only **1** if that wrestler has not yet
  appeared this season. The host may not pass.
- **Answering a claim** `P` backed by `n` cards, with type `X`:

  | Situation | Legal? | Cards |
  |---|---|---|
  | `X === P` | no | &mdash; |
  | `P` known stronger than `X` | no | &mdash; |
  | `X` known stronger than `P` | yes (Option 2) | **exactly `n`** |
  | incomparable | yes (Option 1) | **exactly `n+1`**, `n+1 <= 3`; **creates the edge `X > P`** |

- **Pass** ("throw in the towel") puts you out for the rest of the round.
- **Round end**: when everyone *except the claim holder* has passed. Cards are set aside; the last
  player to play cards hosts the next round.
- **Season end**: runs until **only one player still holds cards**. 1st **+2**, 2nd **+1**, the player
  left holding cards **-1**, everyone else **0**. The last-place player hosts the next season.
- **Match end**: 4 seasons; **2-player games instead run until someone wins 3 seasons**. Ties break on
  more +2 counters, then the most recent season's winner.

Two rulebook ambiguities were settled deliberately: its setup box says to deal "before each new
round", which is a translation slip for *season*; and the season-end condition is the project's
choice of "play until only one player has cards", not "stop the instant someone goes out".

## Architecture

```
server.ts          custom entry: Next request handler + Socket.IO share one HTTP server
src/engine/        PURE rules -- no I/O, no React, no sockets. The only place rules live.
src/server/        room registry, socket handlers, redaction. Never imported by client code.
src/shared/        the wire contract, imported by both sides
src/app/           Next App Router pages
src/components/    table, seats, pile, strength rows, hand, chat, overlays
src/lib/           client-only: socket, useRoom, useTablePresenter (animation), i18n, sound
```

The UI is **Vietnamese**. Every player-facing sentence lives in `src/lib/i18n.ts`; server-side
`fail()`/system-notice strings in `src/server/handlers.ts` are Vietnamese too. Engine
`IllegalMoveError` messages stay English (they are for debugging) and never reach players.

Imports use explicit `.js` specifiers (what Node's ESM loader wants for the custom server);
`next.config.ts` sets a webpack `extensionAlias` so the bundler resolves them back to the `.ts`
sources. Keep writing `.js` in new imports.

### Engine invariants

- **Hands are `number[6]` tallies**, not card objects. Cards of a type are indistinguishable.
- **`StrengthOrder` is a transitively-closed 6&times;6 boolean matrix.** `addRelation` recomputes the
  whole closure; it is 216 operations, so do not optimise it into something subtler.
- **`legalPlays(state, seat)` is the single authority.** The UI lights up affordances from it and the
  server validates submissions with it. Never add a rule check anywhere else.
- **`applyMove` never mutates its input** and throws `IllegalMoveError` rather than returning a
  failure, because callers should only ever pass moves that `legalPlays` offered.
- A player with an empty hand is **finished** and skipped in turn order &mdash; which is distinct from
  having passed, and the difference matters: see `contenders()` in `rules.ts`, which is why the round
  does not end early when the claim holder has just gone out.

### Rendering the markers

`strengthLines()` returns **chains**, not depth-ranked rows. Each line is a path where every wrestler
really does beat the one below it, and a wrestler may appear in several lines &mdash; matching the
physical game, which ships five markers per wrestler for exactly this reason. Do not "simplify" this
into one column per rank: that would draw wrestlers as ordered when their relative strength is still
unknown.

### The trust boundary

`src/server/view.ts` is the **only** path from `GameState` to the wire. A viewer receives their own
hand and nothing but counts for everyone else; spectators get no hand at all. Never emit `GameState`,
and never add a field that carries another player's cards. `tests/view.test.ts` and the redaction
assertions in `tests/integration.test.ts` exist to catch exactly that.

Related: the server re-validates every move through the engine and checks that the submitting socket
owns the seat on turn. Client-side legality is advisory only.

### Animation

`useTablePresenter` replays new log entries (found via `GameView.logStart`, since `log` is only a
tail) one beat at a time, and while it runs its `stage` overrides the centre of the table. When the
queue drains the view is shown as-is, so animation can never leave the board disagreeing with the
engine. If a later move is already queued it skips flights to catch up. Never predict a move's
outcome client-side to animate it.

### Rooms

In-memory `Map` in `src/server/rooms.ts`; a restart drops every game. Seats are held (not vacated) on
disconnect during a game so a refresh reclaims the hand via the `localStorage` player token, and a
disconnected player on turn is auto-folded after 60s so one closed tab cannot freeze a table.

`compactSeats()` runs once at deal time so that **a room seat index and an engine player index are
the same number** everywhere else. Do not reintroduce a mapping layer.

## Deploying

Needs **one long-running Node process** (`npm start`): Next and Socket.IO share it and rooms live in
its memory. Serverless hosts such as Vercel serve the pages but have no Socket.IO server behind
`/socket.io`, so nothing can connect. `render.yaml` is a Render Blueprint for a single web service;
never run more than one instance, or players will land on processes that do not know their room.

## Testing

`tests/simulation.test.ts` is the one that catches lifecycle bugs: a random-legal-move bot plays 200
full matches across 2&ndash;6 players under fixed seeds, asserting card conservation, no deadlock, and
that every match reaches `gameOver`. Run it after any change to `rules.ts` or `game.ts`.

## Attribution

*maskmen* is &copy; Oink Games (authors Jun Sasaki and Taiki Shinzawa). Keep the attribution in any
user-facing build.
