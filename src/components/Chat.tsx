'use client';

import { useEffect, useRef, useState } from 'react';
import { eventWrestler, narrate } from '@/lib/i18n.js';
import { MAX_CHAT_LENGTH, type ChatMessage, type GameView, type RoomView } from '@/shared/protocol.js';
import { MaskIcon } from './Card.js';

export const REACTIONS = ['👏', '😱', '😂', '🔥', '🤔', '😭'];

/** A chat message that is just one reaction emoji gets shown on the table too. */
export function isReaction(text: string): boolean {
  return REACTIONS.includes(text.trim());
}

export function Chat({
  room,
  view,
  messages,
  onSend,
}: {
  room: RoomView;
  view: GameView | null;
  messages: ChatMessage[];
  onSend: (text: string) => void;
}) {
  const [tab, setTab] = useState<'chat' | 'log'>('chat');
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, view?.log, tab]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const log = (view?.log ?? [])
    .map((event, i) => ({ key: (view?.logStart ?? 0) + i, text: narrate(room, event), wrestler: eventWrestler(event) }))
    .filter((entry) => entry.text !== null);

  return (
    <section className="side-panel">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'tab tab--on' : 'tab'} onClick={() => setTab('chat')}>
          Trò chuyện
        </button>
        <button role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'tab tab--on' : 'tab'} onClick={() => setTab('log')}>
          Diễn biến
        </button>
        {room.spectators.length > 0 && <span className="tabs-note">{room.spectators.length} đang xem</span>}
      </div>

      {tab === 'chat' ? (
        <>
          <div className="messages">
            {messages.length === 0 && <p className="messages-empty">Chưa có tin nhắn nào.</p>}
            {messages.map((m) => (
              <div key={m.id} className={m.system ? 'message message--system' : 'message'}>
                {m.system ? (
                  m.text
                ) : (
                  <>
                    <span className="message-who">{m.nickname}</span>
                    <span className={isReaction(m.text) ? 'message-text message-text--big' : 'message-text'}>{m.text}</span>
                  </>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="reactions">
            {REACTIONS.map((emoji) => (
              <button key={emoji} className="reaction" onClick={() => onSend(emoji)} aria-label={`Gửi ${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>

          <div className="chat-input">
            <input
              value={text}
              maxLength={MAX_CHAT_LENGTH}
              placeholder="Nhập tin nhắn…"
              aria-label="Tin nhắn"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button className="btn" onClick={send} disabled={!text.trim()}>
              Gửi
            </button>
          </div>
        </>
      ) : (
        <div className="messages log">
          {log.length === 0 && <p className="messages-empty">Trận đấu chưa bắt đầu.</p>}
          {log.map((entry) => (
            <div key={entry.key} className="log-line">
              {entry.wrestler !== null ? <MaskIcon wrestler={entry.wrestler} size={22} /> : <span className="log-dot" />}
              <span>{entry.text}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}
