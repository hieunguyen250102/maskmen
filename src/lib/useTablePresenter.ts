'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent, TableClaim, WrestlerType } from '@/engine/types.js';
import type { GameView, RoomView } from '@/shared/protocol.js';
import { placeLabel, seatName } from './i18n.js';
import { playSound } from './sound.js';

/**
 * Turns the stream of game views into something that can be watched.
 *
 * The server sends the table as it is *after* a move, so a round-ending play
 * arrives with the pile already cleared. This hook replays the new log entries
 * one beat at a time -- cards fly in, the pile is swept to the round's winner --
 * and while it does, `stage` overrides what the centre of the table shows. When
 * the queue drains, `stage` is null and the view is shown as-is again, so the
 * animation can never leave the board disagreeing with the engine.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Flight {
  id: number;
  wrestler: WrestlerType;
  from: Rect;
  to: Rect;
  /** Opponent cards start face down and turn over on the way. */
  flip: boolean;
  delay: number;
  duration: number;
}

export interface Stage {
  claim: TableClaim | null;
  pileTotal: number;
}

export interface Bubble {
  key: number;
  text: string;
  tone: 'pass' | 'finish' | 'react';
}

export interface Toast {
  key: number;
  text: string;
}

const FLY_MS = 480;
const STAGGER_MS = 80;
const SWEEP_MS = 560;
const BUBBLE_MS = 1600;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function anchorRect(name: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[data-anchor="${name}"]`);
  return el ? el.getBoundingClientRect() : null;
}

function toRect(r: DOMRect): Rect {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** A card-sized rect centred inside a larger box, e.g. an opponent's fan. */
function centredIn(box: DOMRect, w: number, h: number): Rect {
  return { x: box.left + (box.width - w) / 2, y: box.top + (box.height - h) / 2, w, h };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function useTablePresenter(view: GameView | null, room: RoomView | null) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, Bubble>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [landKey, setLandKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const lastSeen = useRef<number | null>(null);
  const prevView = useRef<GameView | null>(null);
  /** Pending events, each tagged with the view (batch) it arrived in. */
  const queue = useRef<{ event: GameEvent; batch: number }[]>([]);
  const batches = useRef(0);
  const running = useRef(false);
  const stageRef = useRef<Stage | null>(null);
  const ownRects = useRef<DOMRect[]>([]);
  const nextId = useRef(1);
  const viewRef = useRef(view);
  const roomRef = useRef(room);
  viewRef.current = view;
  roomRef.current = room;

  const putStage = (next: Stage | null) => {
    stageRef.current = next;
    setStage(next);
  };

  const showBubble = useCallback((seat: number, text: string, tone: Bubble['tone']) => {
    const key = nextId.current++;
    setBubbles((prev) => ({ ...prev, [seat]: { key, text, tone } }));
    setTimeout(() => {
      setBubbles((prev) => {
        if (prev[seat]?.key !== key) return prev;
        const next = { ...prev };
        delete next[seat];
        return next;
      });
    }, BUBBLE_MS);
  }, []);

  const showToast = useCallback((text: string) => {
    const key = nextId.current++;
    setToast({ key, text });
    setTimeout(() => setToast((t) => (t?.key === key ? null : t)), 1800);
  }, []);

  const perform = useCallback(
    async (event: GameEvent, batch: number) => {
      const current = viewRef.current;
      const currentRoom = roomRef.current;
      // If a later move is already waiting, the table is falling behind the
      // game: skip the flights and catch up rather than lag further.
      const behind = queue.current.some((q) => q.batch > batch);
      const calm = reducedMotion() || behind;
      const wait = (ms: number) => sleep(behind ? Math.min(ms, 60) : ms);
      const name = (seat: number) => (currentRoom ? seatName(currentRoom, seat) : `Ghế ${seat + 1}`);

      switch (event.type) {
        case 'play': {
          const target = anchorRect('pile');
          const base = stageRef.current ?? { claim: null, pileTotal: 0 };
          const ids: number[] = [];

          if (target && !calm) {
            const mine = current?.yourSeat === event.seat;
            const rects = mine ? ownRects.current.splice(0) : [];
            const seatBox = mine ? anchorRect('hand') : anchorRect(`seat-${event.seat}`);
            const fresh: Flight[] = [];
            for (let i = 0; i < event.count; i++) {
              const own = rects[i];
              const from = own
                ? toRect(own)
                : seatBox
                  ? centredIn(seatBox, target.width * 0.6, target.height * 0.6)
                  : null;
              if (!from) continue;
              const id = nextId.current++;
              ids.push(id);
              fresh.push({
                id,
                wrestler: event.wrestler,
                from,
                to: {
                  x: target.left + (i - (event.count - 1) / 2) * 10,
                  y: target.top - i * 3,
                  w: target.width,
                  h: target.height,
                },
                flip: !own,
                delay: i * STAGGER_MS,
                duration: FLY_MS,
              });
            }
            if (fresh.length > 0) {
              setFlights((prev) => [...prev, ...fresh]);
              playSound('deal');
              await wait(FLY_MS + (fresh.length - 1) * STAGGER_MS);
            }
          }

          putStage({
            claim: { wrestler: event.wrestler, count: event.count, seat: event.seat },
            pileTotal: base.pileTotal + event.count,
          });
          setLandKey((k) => k + 1);
          playSound('land');
          if (ids.length > 0) {
            // Let the pile render its new top card before the flying copies vanish.
            await wait(30);
            setFlights((prev) => prev.filter((f) => !ids.includes(f.id)));
          }
          await wait(calm ? 150 : 260);
          break;
        }

        case 'pass':
          showBubble(event.seat, 'Bỏ lượt', 'pass');
          playSound('pass');
          await wait(calm ? 150 : 320);
          break;

        case 'finished':
          showBubble(event.seat, `Hết bài! ${placeLabel(event.place)}`, 'finish');
          playSound('finish');
          await wait(calm ? 200 : 500);
          break;

        case 'roundEnd': {
          showToast(`${name(event.winnerSeat)} thắng vòng`);
          const pileEl = document.querySelector<HTMLElement>('[data-anchor="pile-stack"]');
          const winner =
            current?.yourSeat === event.winnerSeat ? anchorRect('hand') : anchorRect(`seat-${event.winnerSeat}`);
          let sweep: Animation | null = null;
          if (pileEl && winner && !calm) {
            await wait(350);
            const from = pileEl.getBoundingClientRect();
            const dx = winner.left + winner.width / 2 - (from.left + from.width / 2);
            const dy = winner.top + winner.height / 2 - (from.top + from.height / 2);
            sweep = pileEl.animate(
              [
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
              ],
              { duration: SWEEP_MS, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
            );
            playSound('sweep');
            await wait(SWEEP_MS);
          } else {
            await wait(calm ? 300 : 700);
          }
          putStage({ claim: null, pileTotal: 0 });
          sweep?.cancel();
          await wait(120);
          break;
        }

        case 'seasonStart':
          putStage({ claim: null, pileTotal: 0 });
          showToast(`Mùa ${event.seasonNo}`);
          playSound('turn');
          await wait(500);
          break;

        case 'seasonEnd':
          await wait(calm ? 200 : 700);
          break;

        default:
          break;
      }
    },
    [showBubble, showToast],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      while (queue.current.length > 0) {
        const { event, batch } = queue.current.shift()!;
        await perform(event, batch);
      }
    } finally {
      running.current = false;
      putStage(null);
      setFlights([]);
      setBusy(false);
    }
  }, [perform]);

  useEffect(() => {
    if (!view) {
      lastSeen.current = null;
      prevView.current = null;
      return;
    }
    const end = view.logStart + view.log.length;
    const seen = lastSeen.current;
    const base = prevView.current;
    lastSeen.current = end;
    prevView.current = view;

    // First view, a reconnect, or a gap we cannot replay: show the table as is.
    if (seen === null || seen < view.logStart || seen > end) return;

    const fresh = view.log.slice(seen - view.logStart);
    if (fresh.length === 0) return;

    if (!running.current && base) {
      putStage({ claim: base.claim, pileTotal: sum(base.pile) });
    }
    const batch = ++batches.current;
    queue.current.push(...fresh.map((event) => ({ event, batch })));
    void run();
  }, [view, run]);

  /** Hand remembers where the played cards were, so they fly from the right place. */
  const rememberOwnRects = useCallback((rects: DOMRect[]) => {
    ownRects.current = rects;
  }, []);

  return { stage, flights, bubbles, toast, landKey, busy, rememberOwnRects, showBubble };
}
