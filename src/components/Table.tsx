'use client';

import { MAX_PLAYERS, MIN_PLAYERS } from '@/engine/types.js';
import type { Bubble, Stage } from '@/lib/useTablePresenter.js';
import type { GameView, RoomView } from '@/shared/protocol.js';
import { PlayPile } from './PlayPile.js';
import { StrengthBoard } from './StrengthBoard.js';
import { TableSeat } from './TableSeat.js';

/**
 * Where each seat sits around the felt, as [left%, top%], indexed by position
 * *relative to the viewer*: 0 is always the bottom edge, and play runs
 * clockwise from there -- left, over the top, down the right.
 */
const SLOTS: Record<number, [number, number][]> = {
  2: [[50, 100], [50, 0]],
  3: [[50, 100], [16, 6], [84, 6]],
  4: [[50, 100], [4, 48], [50, 0], [96, 48]],
  5: [[50, 100], [4, 62], [24, 2], [76, 2], [96, 62]],
  6: [[50, 100], [4, 66], [16, 4], [50, 0], [84, 4], [96, 66]],
};

function slotClass(left: number, top: number): string {
  if (top >= 90) return 'seat--bottom';
  if (left <= 10) return 'seat--left';
  if (left >= 90) return 'seat--right';
  return 'seat--top';
}

export function Table({
  room,
  view,
  stage,
  bubbles,
  landKey,
  onSit,
  onStart,
}: {
  room: RoomView;
  view: GameView | null;
  stage: Stage | null;
  bubbles: Record<number, Bubble>;
  landKey: number;
  onSit: (seat: number) => void;
  onStart: () => void;
}) {
  const inGame = view !== null;
  const seatCount = inGame ? view.players.length : MAX_PLAYERS;
  const slots = SLOTS[seatCount] ?? SLOTS[MAX_PLAYERS]!;
  const origin = room.you.seat !== null && room.you.seat < seatCount ? room.you.seat : 0;
  const occupied = room.seats.filter(Boolean).length;

  const claim = stage ? stage.claim : (view?.claim ?? null);
  const pileTotal = stage ? stage.pileTotal : (view?.pile.reduce((a, b) => a + b, 0) ?? 0);
  const discarded = view?.discarded.reduce((a, b) => a + b, 0) ?? 0;
  const playing = view?.phase === 'playing';

  return (
    <div className={`table table--${seatCount}`}>
      <div className="felt">
        <div className="felt-logo" aria-hidden>
          maskmen
        </div>

        {inGame ? (
          <div className="table-centre">
            <StrengthBoard lines={view.lines} debuted={view.debuted} />
            <PlayPile
              room={room}
              claim={claim}
              pileTotal={pileTotal}
              hostSeat={view.hostSeat}
              discarded={discarded}
              landKey={landKey}
              playing={playing}
            />
          </div>
        ) : (
          <div className="table-centre table-centre--lobby">
            <div className="lobby">
              <h2>Phòng {room.code}</h2>
              <p>
                {occupied}/{MAX_PLAYERS} người đã ngồi · {room.spectators.length} khán giả
              </p>
              {room.you.isOwner ? (
                <>
                  <button className="btn btn--primary btn--big" onClick={onStart} disabled={occupied < MIN_PLAYERS}>
                    Bắt đầu trận
                  </button>
                  {occupied < MIN_PLAYERS && <p className="lobby-note">Cần ít nhất {MIN_PLAYERS} người ngồi vào bàn.</p>}
                </>
              ) : (
                <p className="lobby-note">Đang chờ chủ phòng bắt đầu trận…</p>
              )}
              <p className="lobby-note">Gửi mã phòng cho bạn bè để cùng chơi hoặc xem.</p>
            </div>
          </div>
        )}
      </div>

      {Array.from({ length: seatCount }, (_, seat) => {
        const relative = (seat - origin + seatCount) % seatCount;
        const [left, top] = slots[relative]!;
        const isYou = room.you.seat === seat;
        const player = view?.players.find((p) => p.seat === seat);
        return (
          <TableSeat
            key={seat}
            seat={seat}
            occupant={room.seats[seat] ?? null}
            player={player}
            isYou={isYou}
            isTurn={playing && view?.turnSeat === seat}
            isHost={playing && view?.hostSeat === seat}
            showFan={!isYou && inGame}
            bubble={bubbles[seat]}
            canSit={!room.started && room.you.seat === null}
            onSit={() => onSit(seat)}
            className={slotClass(left, top)}
            style={{ left: `${left}%`, top: `${top}%` }}
          />
        );
      })}
    </div>
  );
}
