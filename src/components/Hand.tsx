'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_PLAY_SIZE, WRESTLERS, type Move, type WrestlerType } from '@/engine/types.js';
import { claimHint, placeLabel, seatName, unavailableReason, wrestlerName } from '@/lib/i18n.js';
import type { GameView, RoomView } from '@/shared/protocol.js';
import { Card } from './Card.js';

interface Selection {
  wrestler: WrestlerType;
  count: number;
}

/**
 * Your hand, fanned along the bottom of the table.
 *
 * Picking cards is only a way of *asking* for a play: the Đánh button lights up
 * when the picked wrestler and count are one of `yourLegalPlays`, which the
 * server derived from the engine. Nothing here decides legality on its own.
 */
export function Hand({
  room,
  view,
  onPlay,
}: {
  room: RoomView;
  view: GameView;
  onPlay: (move: Move, from: DOMRect[]) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const hand = view.yourHand;

  const yourTurn = view.phase === 'playing' && view.turnSeat === view.yourSeat;
  const held = (w: WrestlerType) => hand?.[w] ?? 0;
  const countsFor = (w: WrestlerType) =>
    view.yourLegalPlays.filter((p) => p.wrestler === w).map((p) => p.count);

  // Drop a selection the hand can no longer back, e.g. after the cards were played.
  useEffect(() => {
    if (selection && held(selection.wrestler) < selection.count) setSelection(null);
  });

  const legal =
    yourTurn &&
    selection !== null &&
    view.yourLegalPlays.some((p) => p.wrestler === selection.wrestler && p.count === selection.count);

  const play = () => {
    if (!legal || !selection) return;
    const from: DOMRect[] = [];
    for (let k = 0; k < selection.count; k++) {
      const el = handRef.current?.querySelector(`[data-hand-card="${selection.wrestler}-${k}"]`);
      if (el) from.push(el.getBoundingClientRect());
    }
    onPlay({ kind: 'play', wrestler: selection.wrestler, count: selection.count }, from);
    setSelection(null);
  };

  const pass = () => {
    if (!view.youMayPass) return;
    setSelection(null);
    onPlay({ kind: 'pass' }, []);
  };

  const pick = (w: WrestlerType, k: number) => {
    setSelection((prev) => {
      if (!prev || prev.wrestler !== w) return { wrestler: w, count: 1 };
      if (k < prev.count) return prev.count > 1 ? { wrestler: w, count: prev.count - 1 } : null;
      return { wrestler: w, count: Math.min(prev.count + 1, held(w), MAX_PLAY_SIZE) };
    });
  };

  /** Double-click jumps straight to the smallest legal play of that wrestler. */
  const pickLegal = (w: WrestlerType) => {
    const counts = countsFor(w);
    if (counts.length > 0) setSelection({ wrestler: w, count: Math.min(...counts) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter') play();
      else if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!hand) return null;

  const total = hand.reduce((a, b) => a + b, 0);
  const me = view.players.find((p) => p.seat === view.yourSeat);

  let hint: string;
  if (view.phase !== 'playing') {
    hint = 'Mùa đấu đã kết thúc.';
  } else if (total === 0) {
    hint = me?.finishedAt !== null && me?.finishedAt !== undefined
      ? `Bạn đã hết bài — ${placeLabel(me.finishedAt).toLowerCase()} mùa này.`
      : 'Bạn đã hết bài.';
  } else if (!yourTurn) {
    hint = me?.passed
      ? 'Bạn đã bỏ lượt ở vòng này.'
      : `Đang chờ ${seatName(room, view.turnSeat)}…`;
  } else if (selection && !legal) {
    const counts = countsFor(selection.wrestler);
    hint =
      counts.length > 0
        ? `Cần đúng ${counts.join(' hoặc ')} lá ${wrestlerName(selection.wrestler)}`
        : unavailableReason(view, selection.wrestler, held(selection.wrestler));
  } else if (view.claim === null) {
    hint = 'Bạn là chủ vòng — hãy ra bài (đô vật mới chỉ được ra 1 lá).';
  } else {
    hint = `Tới lượt bạn! ${claimHint(view.claim.count)}.`;
  }

  return (
    <div className={`hand-dock${yourTurn ? ' hand-dock--turn' : ''}`}>
      {total > 0 ? (
        <div className="hand" ref={handRef} data-anchor="hand">
          {WRESTLERS.map((w) => {
            const have = held(w.id);
            if (have === 0) return null;
            const dead = yourTurn && countsFor(w.id).length === 0;
            const reason = dead ? unavailableReason(view, w.id, have) : undefined;
            return (
              <div className={`hand-group${dead ? ' hand-group--dead' : ''}`} key={w.id} title={reason}>
                {Array.from({ length: have }, (_, k) => {
                  const raised = selection?.wrestler === w.id && k < selection.count;
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`hand-slot${raised ? ' hand-slot--raised' : ''}`}
                      data-hand-card={`${w.id}-${k}`}
                      onClick={() => pick(w.id, k)}
                      onDoubleClick={() => pickLegal(w.id)}
                      aria-pressed={raised}
                      aria-label={`${w.name}, lá ${k + 1}/${have}`}
                    >
                      <Card wrestler={w.id} size="md" />
                    </button>
                  );
                })}
                <span className="hand-group-count">{have}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hand hand--empty" data-anchor="hand" />
      )}

      <div className="hand-actions">
        <p className={`hand-hint${yourTurn ? ' hand-hint--turn' : ''}`} aria-live="polite">
          {hint}
        </p>
        <div className="hand-buttons">
          <button className="btn btn--pass" onClick={pass} disabled={!view.youMayPass}>
            Bỏ lượt
          </button>
          <button className="btn btn--primary btn--play" onClick={play} disabled={!legal}>
            {selection ? `Đánh ${selection.count} lá ${wrestlerName(selection.wrestler)}` : 'Đánh'}
          </button>
        </div>
      </div>
    </div>
  );
}
