import { useState, type FormEvent } from 'react';
import { ApiError, api, fromServer } from '../lib/api';
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
        setError('Cannot reach the server. Is it running?');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center kb-bg px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border kb-card kb-border p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold">My Board</h1>
        <p className="text-sm kb-muted mt-1">
          {mode === 'login' ? 'Log in to your board.' : 'First run — create your account.'}
        </p>
        <div className="flex gap-1.5 mt-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 py-1.5 rounded-lg border ${mode === 'login' ? 'kb-accent-bg text-white border-transparent' : 'kb-border'}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 py-1.5 rounded-lg border ${mode === 'register' ? 'kb-accent-bg text-white border-transparent' : 'kb-border'}`}
          >
            Create account
          </button>
        </div>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="mt-3 w-full rounded-lg border kb-border kb-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 chars)"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="mt-2 w-full rounded-lg border kb-border kb-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg kb-accent-bg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Checking…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <p className="mt-3 text-xs kb-muted">
          Secured by the API with bcrypt + JWT httpOnly cookies. Registration locks after the
          first account.
        </p>
      </form>
    </div>
  );
}
