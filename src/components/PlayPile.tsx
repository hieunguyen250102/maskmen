'use client';

import type { TableClaim } from '@/engine/types.js';
import { claimHint, seatName, wrestlerName } from '@/lib/i18n.js';
import type { RoomView } from '@/shared/protocol.js';
import { Card } from './Card.js';

/** How many card edges to draw under the top card. More would just be noise. */
const MAX_EDGES = 10;

/** A stable little wobble per layer, so the stack looks dropped rather than printed. */
function wobble(i: number): { x: number; r: number } {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  const t = s - Math.floor(s);
  return { x: (t - 0.5) * 8, r: (t - 0.5) * 10 };
}

/**
 * The centre of the table: every card played this round, as one stack whose top
 * card is the wrestler holding the table and whose badge is how many cards the
 * latest play put down.
 */
export function PlayPile({
  room,
  claim,
  pileTotal,
  hostSeat,
  discarded,
  landKey,
  playing,
}: {
  room: RoomView;
  claim: TableClaim | null;
  pileTotal: number;
  hostSeat: number;
  discarded: number;
  landKey: number;
  playing: boolean;
}) {
  const under = Math.min(Math.max(pileTotal - 1, 0), MAX_EDGES);

  return (
    <div className="pile-area">
      <div className="pile">
        {claim ? (
          <div className="pile-stack" data-anchor="pile-stack">
            {Array.from({ length: under }, (_, i) => {
              const { x, r } = wobble(i + 1);
              return (
                <div
                  key={i}
                  className="pile-edge"
                  style={{ transform: `translate(${x}px, ${-i * 2}px) rotate(${r}deg)` }}
                />
              );
            })}
            <div
              className="pile-top-wrap"
              data-anchor="pile"
              style={{ transform: `translateY(${-under * 2}px)` }}
            >
              <Card key={landKey} wrestler={claim.wrestler} size="lg" className="pile-top" />
              <span
                key={`badge-${landKey}`}
                className="pile-badge"
                aria-label={`${claim.count} lá ${wrestlerName(claim.wrestler)}`}
              >
                ×{claim.count}
              </span>
            </div>
          </div>
        ) : (
          <div className="pile-slot" data-anchor="pile">
            {playing ? (
              <span>
                <strong>{seatName(room, hostSeat)}</strong>
                <br />
                mở vòng mới
              </span>
            ) : (
              <span>Bàn trống</span>
            )}
          </div>
        )}
      </div>

      <div className="pile-caption">
        {claim ? (
          <>
            <div>
              <strong>{seatName(room, claim.seat)}</strong> giữ bàn · {pileTotal} lá trong vòng
            </div>
            {playing && <div className="pile-hint">{claimHint(claim.count)}</div>}
          </>
        ) : (
          playing && <div className="pile-hint">Chủ vòng ra 1–3 lá cùng loại (đô vật mới: 1 lá)</div>
        )}
        {discarded > 0 && <div className="pile-discard">Đã bỏ mùa này: {discarded} lá</div>}
      </div>
    </div>
  );
}
