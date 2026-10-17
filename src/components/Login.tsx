import { useState, type FormEvent } from 'react';
import Icon from './Icon';
import Segmented from './Segmented';
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
      if (err instanceof ApiError && err.status === 409 && mode === 'register') {
        setError('Email already registered — switch to Log in.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(`Cannot reach the server at ${API_BASE}. Is it running?`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kb-bg flex min-h-full items-center justify-center px-4 py-10">
      <form
        onSubmit={submit}
        data-testid="login-form"
        className="w-full max-w-[22rem] rounded-[var(--kb-r-2xl)] border kb-border bg-[var(--kb-card)] p-6 shadow-[var(--kb-shadow-sm)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="kb-accent grid h-[30px] w-[30px] place-items-center rounded-[10px] kb-accent-soft">
            <Icon name="columns" size={16} />
          </span>
          <h1 className="text-[22px] leading-tight tracking-[-0.03em]">Cardflow</h1>
        </div>
        <p className="mt-1.5 text-[13px] text-kb-muted">
          {mode === 'login' ? 'Log in to your board.' : 'Create your account.'}
        </p>

        <Segmented
          value={mode}
          options={[
            { value: 'login', label: 'Log in' },
            { value: 'register', label: 'Create account' },
          ]}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          aria-label="Log in or create an account"
          data-testid="login-mode"
          className="mt-5"
        />

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
            className="kb-input kb-input-pill"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
            aria-label="Password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            data-testid="password"
            className="kb-input kb-input-pill"
          />
        </div>

        {error && (
          <p
            role="alert"
            data-testid="login-error"
            className="mt-3 flex items-start gap-1.5 rounded-[var(--kb-r-sm)] px-2.5 py-2 text-[12.5px] text-kb-danger"
            style={{ background: 'var(--kb-danger-soft)' }}
          >
            <Icon name="alert" size={14} className="mt-px" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          data-testid="submit"
          className="kb-btn kb-btn-primary mt-4 h-9 w-full"
        >
          {busy ? 'Checking…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-kb-muted">
          <Icon name="lock" size={13} className="mt-0.5" />
          Passwords are hashed with bcrypt; sessions live in httpOnly cookies. Each account
          gets a private board with live sync across tabs.
        </p>
      </form>
    </div>
  );
}
