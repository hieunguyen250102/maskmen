'use client';

import type { Session } from 'oink-kit/client';
import { useEmailLogin } from 'oink-kit/react';
import { authClient } from '@/lib/socket.js';

/** Email → 6-digit code. The behaviour lives in oink-kit's useEmailLogin; this is only maskmen's look. */
export function LoginForm({ onLogin }: { onLogin: (session: Session) => void }) {
  const login = useEmailLogin(authClient, { onLogin });
  const { email, code, busy, error, notice, devCode, cooldown } = login;

  if (login.step === 'email') {
    return (
      <form
        className="login"
        onSubmit={(e) => {
          e.preventDefault();
          void login.send();
        }}
      >
        <p className="tagline">Đăng nhập bằng email để vào chơi: chúng tôi sẽ gửi cho bạn một mã 6 số.</p>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder="ban@vidu.com"
            onChange={(e) => login.setEmail(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn--primary btn--big" disabled={!login.emailOk || busy}>
          {busy ? 'Đang gửi…' : 'Gửi mã đăng nhập'}
        </button>
      </form>
    );
  }

  return (
    <form
      className="login"
      onSubmit={(e) => {
        e.preventDefault();
        void login.verify();
      }}
    >
      <p className="tagline">
        Đã gửi mã tới <strong>{email.trim()}</strong>. Xem cả thư mục Spam nếu chưa thấy.
      </p>
      <input
        ref={login.codeRef}
        className="login-code"
        value={code}
        onChange={(e) => login.typeCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        aria-label="Mã 6 số"
        autoFocus
      />
      {devCode && (
        <p className="tagline tagline--small">
          Máy chủ chưa cấu hình gửi mail (chế độ dev), mã là{' '}
          <button type="button" className="link" onClick={() => void login.verify(devCode)}>
            {devCode}
          </button>
        </p>
      )}
      {notice && !error && <p className="tagline tagline--small">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn--primary btn--big" disabled={code.length !== 6 || busy}>
        {busy ? 'Đang kiểm tra…' : 'Xác nhận'}
      </button>
      <div className="login-links">
        <button type="button" className="link" onClick={login.changeEmail}>
          ← Đổi email
        </button>
        <button type="button" className="link" disabled={cooldown > 0 || busy} onClick={() => void login.send()}>
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}
        </button>
      </div>
    </form>
  );
}

/** "you@mail.com · Đăng xuất" strip shown once signed in. */
export function AccountBar({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="account">
      <span>{email}</span>
      <button type="button" className="link" onClick={onLogout}>
        Đăng xuất
      </button>
    </div>
  );
}
