'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Chat, isReaction } from '@/components/Chat.js';
import { FlyingCards } from '@/components/FlyingCards.js';
import { Hand } from '@/components/Hand.js';
import { RulesDialog } from '@/components/RulesDialog.js';
import { SeasonResult } from '@/components/SeasonResult.js';
import { Table } from '@/components/Table.js';
import { seasonLabel, seatName } from '@/lib/i18n.js';
import { UNREACHABLE_MESSAGE } from '@/lib/socket.js';
import { isMuted, playSound, setMuted } from '@/lib/sound.js';
import { useRoom } from '@/lib/useRoom.js';
import { useTablePresenter } from '@/lib/useTablePresenter.js';
import { DISCONNECT_AUTO_PASS_MS, normalizeRoomCode } from '@/shared/protocol.js';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const roomCode = normalizeRoomCode(code);
  const {
    connected,
    unreachable,
    room,
    view,
    chat,
    error,
    dismissError,
    takeSeat,
    leaveSeat,
    startGame,
    submit,
    nextSeason,
    sendChat,
  } = useRoom(roomCode);

  const presenter = useTablePresenter(view, room);
  const [showRules, setShowRules] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => setMutedState(isMuted()), []);

  const yourTurn = view?.phase === 'playing' && view.turnSeat === view.yourSeat;

  // Chime when the turn comes to you, and say so in the tab title if you are elsewhere.
  useEffect(() => {
    if (!yourTurn) {
      document.title = 'maskmen';
      return;
    }
    playSound('turn');
    let on = false;
    const timer = setInterval(() => {
      on = document.hidden ? !on : false;
      document.title = on ? '🔔 Tới lượt bạn!' : 'maskmen';
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = 'maskmen';
    };
  }, [yourTurn]);

  // Reaction emoji sent from a seat pop up over that seat. History is not replayed.
  const seenChat = useRef<number | null>(null);
  useEffect(() => {
    if (seenChat.current === null) {
      if (chat.length > 0 || room) seenChat.current = chat.length;
      return;
    }
    const fresh = chat.slice(seenChat.current);
    seenChat.current = chat.length;
    for (const m of fresh) {
      if (!m.system && m.seat !== null && room?.started && isReaction(m.text)) {
        presenter.showBubble(m.seat, m.text, 'react');
      }
    }
    const said = fresh.filter((m) => !m.system).length;
    if (!chatOpen && said > 0) setUnread((n) => n + said);
  }, [chat, room, chatOpen, presenter.showBubble]);

  // Errors are a toast, not a modal: they should never block the table for long.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(dismissError, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // A disconnected player on turn is folded by the server after a minute; count it down here.
  const onTurnSeat = view?.phase === 'playing' ? room?.seats[view.turnSeat] : null;
  const stalled = onTurnSeat != null && !onTurnSeat.connected;
  const [stalledSince, setStalledSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!stalled) {
      setStalledSince(null);
      return;
    }
    setStalledSince((s) => s ?? Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stalled, view?.turnSeat]);

  if (!room) {
    return (
      <main className="landing">
        <div className="landing-card">
          <div className="wordmark">maskmen</div>
          <p className="tagline">
            {error ??
              (connected
                ? `Đang vào phòng ${roomCode}…`
                : unreachable
                  ? UNREACHABLE_MESSAGE
                  : 'Đang kết nối…')}
          </p>
          {(error || unreachable) && (
            <Link className="btn btn--primary" href="/">
              Về sảnh
            </Link>
          )}
        </div>
      </main>
    );
  }

  const seated = room.you.seat !== null;

  let status: string;
  if (!view) {
    status = room.started ? 'Đang chia bài…' : 'Đang chờ người chơi';
  } else if (view.phase !== 'playing') {
    status = view.phase === 'gameOver' ? 'Trận đấu kết thúc' : 'Mùa đấu kết thúc';
  } else if (yourTurn) {
    status = view.claim ? 'Tới lượt bạn!' : 'Bạn mở vòng mới!';
  } else {
    status = `Lượt của ${seatName(room, view.turnSeat)}`;
  }
  if (stalled && stalledSince !== null && onTurnSeat) {
    const left = Math.max(0, Math.ceil((DISCONNECT_AUTO_PASS_MS - (now - stalledSince)) / 1000));
    status = `${onTurnSeat.nickname} mất kết nối — tự bỏ lượt sau ${left}s`;
  }

  const copyCode = () => {
    const url = `${window.location.origin}/room/${room.code}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const showResult = view && (view.phase === 'seasonEnd' || view.phase === 'gameOver') && !presenter.busy;

  return (
    <main className={`room${chatOpen ? ' room--chat-open' : ''}`}>
      <header className="topbar">
        <Link href="/" className="topbar-brand">
          maskmen
        </Link>
        <button className="room-code" onClick={copyCode} title="Sao chép liên kết phòng">
          <span className="room-code-label">Phòng</span>
          <strong>{room.code}</strong>
          <span className="room-code-copy">{copied ? 'Đã chép!' : '⧉'}</span>
        </button>
        {view && <span className="topbar-season">{seasonLabel(view)}</span>}
        <span className={`topbar-status${yourTurn ? ' topbar-status--turn' : ''}`}>{status}</span>
        <span className="topbar-spacer" />
        {!connected && <span className="tag tag--off">Mất kết nối…</span>}
        {seated && !room.started && (
          <button className="btn btn--ghost btn--small" onClick={leaveSeat}>
            Rời ghế
          </button>
        )}
        <button className="icon-btn" onClick={toggleSound} title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="icon-btn" onClick={() => setShowRules(true)} title="Luật chơi">
          ?
        </button>
        <button
          className="icon-btn chat-toggle"
          onClick={() => {
            setChatOpen((o) => !o);
            setUnread(0);
          }}
          title="Trò chuyện"
        >
          💬{unread > 0 && !chatOpen && <span className="icon-btn-badge">{unread}</span>}
        </button>
      </header>

      <div className="play-area">
        <Table
          room={room}
          view={view}
          stage={presenter.stage}
          bubbles={presenter.bubbles}
          landKey={presenter.landKey}
          onSit={takeSeat}
          onStart={startGame}
        />

        {view && seated ? (
          <Hand
            room={room}
            view={view}
            onPlay={(move, from) => {
              presenter.rememberOwnRects(from);
              submit(move);
            }}
          />
        ) : (
          <div className="hand-dock hand-dock--note">
            <p className="hand-hint">
              {seated
                ? 'Bạn đã ngồi vào bàn. Bài sẽ được chia khi chủ phòng bắt đầu trận.'
                : room.started
                  ? 'Bạn đang xem trận đấu. Khán giả chỉ thấy số lá trên tay mỗi người, không thấy mặt bài.'
                  : 'Bạn đang xem. Chọn một ghế trống trên bàn để tham gia.'}
            </p>
          </div>
        )}

        {presenter.toast && (
          <div key={presenter.toast.key} className="toast">
            {presenter.toast.text}
          </div>
        )}
      </div>

      <aside className="side">
        <Chat room={room} view={view} messages={chat} onSend={sendChat} />
      </aside>

      <FlyingCards flights={presenter.flights} />

      {showResult && <SeasonResult room={room} view={view} onNextSeason={nextSeason} />}
      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}

      {error && (
        <button className="error-toast" onClick={dismissError}>
          <strong>Không thực hiện được:</strong> {error}
          <span className="error-toast-close">×</span>
        </button>
      )}
    </main>
  );
}
