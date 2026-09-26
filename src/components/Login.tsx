import { useState, type FormEvent } from 'react';
import Icon from './Icon';
import { ApiError, api, API_BASE, fromServer } from '../lib/api';
import type { BoardState } from '../types';

export default function Login({ onAuthed }: { onAuthed: (email: string, board: BoardState) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password needs at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const res =
        mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      onAuthed(res.user.email, fromServer(res.board));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && mode === 'register') {
        setError('Already set up — switch to Log in.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(`Cannot reach the server at ${API_BASE}. Is it running?`);
      }
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: 'login' | 'register', label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError('');
      }}
      data-testid={`tab-${m}`}
      aria-pressed={mode === m}
      className={`flex-1 rounded-[6px] border py-1.5 text-[12.5px] font-medium transition-colors duration-100 ${
        mode === m
          ? 'kb-accent-bg border-transparent'
          : 'kb-border text-kb-muted hover:border-[var(--kb-border-strong)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="kb-bg flex min-h-full items-center justify-center px-4 py-10">
      <form
        onSubmit={submit}
        data-testid="login-form"
        className="kb-panel w-full max-w-[22rem] p-5"
      >
        <div className="flex items-center gap-2">
          <span className="kb-accent grid h-7 w-7 place-items-center rounded-[7px] kb-accent-soft">
            <Icon name="columns" size={15} />
          </span>
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">My Board</h1>
        </div>
        <p className="mt-1.5 text-[12.5px] text-kb-muted">
          {mode === 'login' ? 'Log in to your board.' : 'First run — create your account.'}
        </p>

        <div className="mt-4 flex gap-1.5">
          {tab('login', 'Log in')}
          {tab('register', 'Create account')}
        </div>

        <div className="mt-3 space-y-2">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            autoComplete="email"
            data-testid="email"
            className="kb-input"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
            aria-label="Password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            data-testid="password"
            className="kb-input"
          />
        </div>

        {error && (
          <p
            role="alert"
            data-testid="login-error"
            className="mt-2.5 flex items-start gap-1.5 rounded-[6px] px-2 py-1.5 text-[12px] text-kb-danger"
            style={{ background: 'var(--kb-danger-soft)' }}
          >
            <Icon name="alert" size={13} className="mt-px" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          data-testid="submit"
          className="kb-btn kb-btn-primary mt-3.5 h-8 w-full"
        >
          {busy ? 'Checking…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <p className="mt-3.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-kb-faint">
          <Icon name="lock" size={12} className="mt-0.5" />
          Passwords are hashed with bcrypt; sessions live in httpOnly cookies. Registration locks
          after the first account.
        </p>
      </form>
    </div>
  );
}
