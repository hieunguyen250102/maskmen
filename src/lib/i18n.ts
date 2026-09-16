/**
 * Every player-facing sentence, in Vietnamese.
 *
 * Kept in one place so components only decide *what* to say, and so the
 * wording of the game's terms stays consistent: host = chủ vòng, pass = bỏ lượt,
 * season = mùa, round = vòng, raise = nâng, beat = đè.
 */

import { MAX_PLAY_SIZE, WRESTLERS, type GameEvent, type WrestlerType } from '@/engine/types.js';
import type { GameView, RoomView } from '@/shared/protocol.js';

export function wrestlerName(w: WrestlerType): string {
  return WRESTLERS[w]?.name ?? '?';
}

export function seatName(room: RoomView, seat: number): string {
  return room.seats[seat]?.nickname ?? `Ghế ${seat + 1}`;
}

export function formatScore(score: number): string {
  return score > 0 ? `+${score}` : `${score}`;
}

const PLACES = ['nhất', 'nhì', 'ba', 'tư', 'năm', 'sáu'];

/** "về nhất", "về nhì"... for a 0-based finishing place. */
export function placeLabel(place: number): string {
  return `Về ${PLACES[place] ?? `thứ ${place + 1}`}`;
}

export function seasonLabel(view: Pick<GameView, 'seasonNo' | 'maxSeasons'>): string {
  return view.maxSeasons ? `Mùa ${view.seasonNo}/${view.maxSeasons}` : `Mùa ${view.seasonNo}`;
}

/**
 * Is `a` known to beat `b`, according to the lines on the table?
 *
 * The client is never sent the order matrix, but it does not need it: a known
 * relation always shows up as one mask sitting ahead of the other within a
 * single line, so the drawn board is enough to explain why a play is unavailable.
 */
export function knownStronger(lines: WrestlerType[][], a: WrestlerType, b: WrestlerType): boolean {
  return lines.some((line) => {
    const i = line.indexOf(a);
    const j = line.indexOf(b);
    return i !== -1 && j !== -1 && i < j;
  });
}

/** Why this wrestler cannot be played right now, in the player's own terms. */
export function unavailableReason(view: GameView, wrestler: WrestlerType, held: number): string {
  const claim = view.claim;
  if (!claim) return 'Chưa thể đánh lá này';
  if (wrestler === claim.wrestler) return 'Trùng đô vật đang giữ bàn';
  if (knownStronger(view.lines, claim.wrestler, wrestler)) return 'Đã biết là yếu hơn';

  if (knownStronger(view.lines, wrestler, claim.wrestler)) {
    return `Cần đúng ${claim.count} lá, bạn có ${held}`;
  }
  const needed = claim.count + 1;
  if (needed > MAX_PLAY_SIZE) return `Cần ${needed} lá, vượt giới hạn ${MAX_PLAY_SIZE}`;
  return `Cần ${needed} lá, bạn có ${held}`;
}

/** How to take the table from the standing claim. */
export function claimHint(count: number): string {
  const beat = `${count} lá đô vật đã biết mạnh hơn`;
  return count + 1 > MAX_PLAY_SIZE
    ? `Chỉ đè được bằng ${beat}`
    : `Đè bằng ${beat}, hoặc nâng ${count + 1} lá đô vật chưa so`;
}

/** One log entry as a sentence. Returns null for events not worth narrating. */
export function narrate(room: RoomView, event: GameEvent): string | null {
  switch (event.type) {
    case 'play': {
      const who = seatName(room, event.seat);
      const mask = wrestlerName(event.wrestler);
      if (event.kind === 'host') return `${who} mở vòng với ${event.count} lá ${mask}.`;
      if (event.kind === 'raise') return `${who} nâng lên ${event.count} lá ${mask}.`;
      return `${who} đè bằng ${event.count} lá ${mask} (đã biết mạnh hơn).`;
    }
    case 'pass':
      return `${seatName(room, event.seat)} bỏ lượt.`;
    case 'finished':
      return `${seatName(room, event.seat)} hết bài — ${placeLabel(event.place).toLowerCase()}!`;
    case 'roundEnd':
      return `${seatName(room, event.winnerSeat)} thắng vòng.`;
    case 'seasonStart':
      return `— Mùa ${event.seasonNo} —`;
    case 'seasonEnd':
      return 'Mùa đấu kết thúc.';
    case 'gameOver':
      return 'Trận đấu kết thúc.';
    default:
      return null;
  }
}

/** The wrestler an event is about, for the log's little mask icon. */
export function eventWrestler(event: GameEvent): WrestlerType | null {
  return event.type === 'play' ? event.wrestler : null;
}
