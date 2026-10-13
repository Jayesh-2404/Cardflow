import { API_BASE } from './api';

export type LiveStatus = 'live' | 'retry' | 'off';

export function subscribeBoard(
  onPush: () => void,
  onStatus: (s: LiveStatus) => void,
): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = 1000;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const push = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (!closed) onPush();
    }, 350);
  };

  const connect = () => {
    if (closed) return;
    onStatus(source ? 'retry' : 'off');
    try {
      source = new EventSource(`${API_BASE}/api/board/stream`, { withCredentials: true });
    } catch {
      schedule();
      return;
    }
    source.addEventListener('hello', () => {
      delay = 1000;
      onStatus('live');
    });
    source.addEventListener('board', push);
    source.onerror = () => {
      onStatus('retry');
      cleanup();
      schedule();
    };
  };

  const cleanup = () => {
    if (source) {
      source.close();
      source = null;
    }
  };

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(connect, delay);
    delay = Math.min(delay * 2, 10000);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible' && !closed && !source) connect();
  };
  document.addEventListener('visibilitychange', onVisible);
  connect();

  return () => {
    closed = true;
    cleanup();
    if (timer) clearTimeout(timer);
    if (debounce) clearTimeout(debounce);
    document.removeEventListener('visibilitychange', onVisible);
    onStatus('off');
  };
}
