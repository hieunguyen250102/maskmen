'use client';

import type { CSSProperties } from 'react';
import { formatScore, placeLabel } from '@/lib/i18n.js';
import type { Bubble } from '@/lib/useTablePresenter.js';
import type { PublicPlayer, SeatView } from '@/shared/protocol.js';
import { CardBack } from './Card.js';

/** Fans wider than this stop reading as a count and start reading as clutter. */
const MAX_FAN = 12;

function initials(nickname: string): string {
  const parts = nickname.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : nickname.slice(0, 2);
  return letters.toUpperCase();
}

/** A hue per seat, so avatars stay distinguishable around the table. */
const AVATAR_HUES = [8, 205, 140, 45, 280, 330];

/**
 * One place at the table. Opponents show their hand as a fan of card backs --
 * a count, never which wrestlers, which is exactly what a real table shows.
 */
export function TableSeat({
  seat,
  occupant,
  player,
  isYou,
  isTurn,
  isHost,
  showFan,
  bubble,
  canSit,
  onSit,
  style,
  className = '',
}: {
  seat: number;
  occupant: SeatView | null;
  player: PublicPlayer | undefined;
  isYou: boolean;
  isTurn: boolean;
  isHost: boolean;
  showFan: boolean;
  bubble: Bubble | undefined;
  canSit: boolean;
  onSit: () => void;
  style?: CSSProperties;
  className?: string;
}) {
  if (!occupant) {
    return (
      <div className={`seat seat--empty ${className}`} style={style}>
        <div className="seat-avatar seat-avatar--empty">{seat + 1}</div>
        {canSit ? (
          <button className="btn btn--small" onClick={onSit}>
            Ngồi
          </button>
        ) : (
          <span className="seat-empty-label">Ghế trống</span>
        )}
      </div>
    );
  }

  const finished = player?.finishedAt ?? null;
  const cards = player?.cardsLeft ?? 0;
  const fan = Math.min(cards, MAX_FAN);
  const spread = Math.min(56, 6 * fan);

  return (
    <div
      className={`seat${isTurn ? ' seat--turn' : ''}${isYou ? ' seat--you' : ''}${player?.passed ? ' seat--passed' : ''}${finished !== null ? ' seat--finished' : ''} ${className}`}
      style={style}
      data-anchor={`seat-${seat}`}
    >
      {showFan && player && (
        <div className="seat-fan" aria-label={`${cards} lá trên tay`}>
          {Array.from({ length: fan }, (_, i) => {
            const angle = fan > 1 ? -spread / 2 + (spread * i) / (fan - 1) : 0;
            return <CardBack key={i} size="xs" className="seat-fan-card" style={{ transform: `rotate(${angle}deg)` }} />;
          })}
          {cards > 0 && <span className="seat-count">{cards}</span>}
        </div>
      )}

      <div className="seat-plate">
        <div
          className="seat-avatar"
          style={{ ['--avatar-hue' as string]: AVATAR_HUES[seat % AVATAR_HUES.length] }}
        >
          {initials(occupant.nickname)}
          <span className={`seat-dot${occupant.connected ? '' : ' seat-dot--off'}`} title={occupant.connected ? 'Đang kết nối' : 'Mất kết nối'} />
        </div>
        <div className="seat-info">
          <div className="seat-name" title={occupant.nickname}>
            {occupant.nickname}
            {isYou && <span className="seat-you"> (bạn)</span>}
          </div>
          <div className="seat-meta">
            {player ? (
              <>
                <span className={`seat-score${player.score < 0 ? ' neg' : ''}`} title="Điểm">
                  {formatScore(player.score)}
                </span>
                {!showFan && cards > 0 && <span className="seat-cards">{cards} lá</span>}
                {isHost && finished === null && <span className="tag tag--host">Chủ vòng</span>}
              </>
            ) : (
              occupant.isOwner && <span className="tag tag--host">Chủ phòng</span>
            )}
          </div>
        </div>
      </div>

      {player && (finished !== null || player.passed || !occupant.connected) && (
        <div className="seat-status">
          {finished !== null ? (
            <span className="tag tag--out">{placeLabel(finished)}</span>
          ) : player.passed ? (
            <span className="tag tag--pass">Đã bỏ lượt</span>
          ) : (
            <span className="tag tag--off">Mất kết nối</span>
          )}
        </div>
      )}

      {bubble && (
        <div key={bubble.key} className={`bubble bubble--${bubble.tone}`}>
          {bubble.text}
        </div>
      )}
    </div>
  );
}
