'use client';

import Link from 'next/link';
import { TWO_PLAYER_SEASON_WINS } from '@/engine/types.js';
import { formatScore, placeLabel, seatName } from '@/lib/i18n.js';
import type { GameView, RoomView } from '@/shared/protocol.js';
import { Belt } from './Card.js';

/** The end-of-season (or end-of-match) standings, with the belts each player earned. */
export function SeasonResult({
  room,
  view,
  onNextSeason,
}: {
  room: RoomView;
  view: GameView;
  onNextSeason: () => void;
}) {
  const over = view.phase === 'gameOver';
  const lastSeason =
    view.maxSeasons !== null
      ? view.seasonNo >= view.maxSeasons
      : view.players.some((p) => p.seasonWins >= TWO_PLAYER_SEASON_WINS);

  const seasonEnd = [...view.log].reverse().find((e) => e.type === 'seasonEnd');
  const deltas = seasonEnd?.type === 'seasonEnd' ? seasonEnd.scores : [];

  // Season: finishing order first, then whoever was left holding cards.
  // Match: total score, as the engine's winners already reflect the tie-breaks.
  const rows = [...view.players].sort((a, b) => {
    if (over) {
      const wa = view.winners?.includes(a.seat) ? 1 : 0;
      const wb = view.winners?.includes(b.seat) ? 1 : 0;
      return wb - wa || b.score - a.score || b.seasonWins - a.seasonWins;
    }
    const pa = a.finishedAt ?? Number.MAX_SAFE_INTEGER;
    const pb = b.finishedAt ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || b.score - a.score;
  });

  return (
    <div className="overlay">
      <div className="result">
        <div className="result-ribbon">{over ? 'Trận đấu kết thúc' : `Kết thúc mùa ${view.seasonNo}`}</div>

        <table className="result-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Người chơi</th>
              <th>{over ? 'Vô địch mùa' : 'Mùa này'}</th>
              <th>Tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const winner = over && view.winners?.includes(p.seat);
              return (
                <tr key={p.seat} className={winner ? 'result-row--win' : undefined}>
                  <td className="result-rank">{winner ? '👑' : i + 1}</td>
                  <td>
                    <div className="result-name">{seatName(room, p.seat)}</div>
                    {!over && (
                      <div className="result-sub">{p.finishedAt !== null ? placeLabel(p.finishedAt) : 'Còn bài trên tay'}</div>
                    )}
                  </td>
                  <td>
                    {over ? (
                      <span className="result-wins">
                        {Array.from({ length: p.seasonWins }, (_, k) => (
                          <Belt key={k} delta={2} height={22} />
                        ))}
                        {p.seasonWins === 0 && <span className="result-sub">—</span>}
                      </span>
                    ) : (
                      <Belt delta={deltas[p.seat] ?? 0} height={34} />
                    )}
                  </td>
                  <td className={`result-score${p.score < 0 ? ' neg' : ''}`}>{formatScore(p.score)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {over ? (
          <Link className="btn btn--primary btn--big" href="/">
            Về sảnh
          </Link>
        ) : room.you.isOwner ? (
          <button className="btn btn--primary btn--big" onClick={onNextSeason}>
            {lastSeason ? 'Xem kết quả chung cuộc' : 'Chia bài mùa tiếp theo'}
          </button>
        ) : (
          <p className="result-wait">Đang chờ chủ phòng chia mùa tiếp theo…</p>
        )}
      </div>
    </div>
  );
}
