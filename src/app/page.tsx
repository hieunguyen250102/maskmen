'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/Card.js';
import { AccountBar, LoginForm } from '@/components/LoginForm.js';
import {
  CONNECT_TIMEOUT_MS,
  UNREACHABLE_MESSAGE,
  getNickname,
  getPlayerToken,
  getSocket,
  setNickname,
} from '@/lib/socket.js';
import { useAccount } from '@/lib/useAccount.js';
import { MAX_NICKNAME_LENGTH, normalizeRoomCode } from '@/shared/protocol.js';

/** The order the six cards fan out in on the landing page. */
const FAN = [1, 0, 2, 3, 4, 5];

export default function Landing() {
  const router = useRouter();
  const [nickname, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ready, account, login, logout } = useAccount();

  useEffect(() => setName(getNickname()), []);

  /**
   * Creating a room means asking the server for one: it owns code generation,
   * so we join with an empty code and let it hand back the room we landed in.
   */
  const create = () => {
    setBusy(true);
    setError(null);
    setNickname(nickname);
    // Without a timeout an unreachable server leaves the button spinning forever:
    // Socket.IO quietly buffers the emit until a connection appears.
    getSocket()
      .timeout(CONNECT_TIMEOUT_MS)
      .emit('room:join', { roomCode: '', playerToken: getPlayerToken(), nickname }, (err, res) => {
        setBusy(false);
        if (err) setError(UNREACHABLE_MESSAGE);
        else if (res.ok) router.push(`/room/${res.data.room.code}`);
        else setError(res.error);
      });
  };

  const join = () => {
    const normalized = normalizeRoomCode(code);
    if (!normalized) return setError('Hãy nhập mã phòng trước');
    setNickname(nickname);
    router.push(`/room/${normalized}`);
  };

  return (
    <main className="landing">
      <div className="landing-fan" aria-hidden>
        {FAN.map((w, i) => (
          <Card
            key={w}
            wrestler={w}
            size="lg"
            className="landing-fan-card"
            style={{ ['--i' as string]: i - (FAN.length - 1) / 2 }}
          />
        ))}
      </div>

      <div className="landing-card">
        <div>
          <div className="wordmark">maskmen</div>
          <p className="tagline">
            Sáu đô vật đeo mặt nạ, chẳng ai biết ai mạnh nhất. Sắp xếp các trận đấu và đánh hết bài trên tay trước tiên!
          </p>
        </div>

        {!ready ? null : !account ? (
          <LoginForm onLogin={login} />
        ) : (
          <>
            <AccountBar email={account.user.email} onLogout={logout} />

            <div className="field">
              <label htmlFor="nick">Tên của bạn</label>
              <input
                id="nick"
                value={nickname}
                maxLength={MAX_NICKNAME_LENGTH}
                placeholder="Người chơi"
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {account.user.canHost ? (
              <>
                <button className="btn btn--primary btn--big" onClick={create} disabled={busy}>
                  {busy ? 'Đang dựng võ đài…' : 'Tạo phòng mới'}
                </button>

                <div className="divider">hoặc vào phòng có sẵn</div>
              </>
            ) : (
              <p className="tagline tagline--small">Tài khoản này vào được phòng có sẵn, không tạo phòng mới được.</p>
            )}

            <div className="field">
              <label htmlFor="code">Mã phòng</label>
              <div className="row">
                <input
                  id="code"
                  value={code}
                  placeholder="ABCD"
                  autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && join()}
                />
                <button className="btn" onClick={join}>
                  Vào phòng
                </button>
              </div>
            </div>

            {error && <p className="form-error">{error}</p>}
          </>
        )}

        <p className="tagline tagline--small">2–6 người chơi, không giới hạn người xem và trò chuyện.</p>
      </div>

      <footer className="credit">
        <em>maskmen</em> © Oink Games — tác giả Jun Sasaki &amp; Taiki Shinzawa. Bản chơi trực tuyến không chính thức.
      </footer>
    </main>
  );
}
