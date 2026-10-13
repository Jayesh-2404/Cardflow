import type { Response } from 'express';

export interface BoardPush {
  v: number;
  at: string;
}

const versions = new Map<string, number>();
const clients = new Map<string, Set<Response>>();

export function versionFor(userId: string): number {
  return versions.get(userId) ?? 0;
}

function payload(userId: string): string {
  const body: BoardPush = { v: versionFor(userId), at: new Date().toISOString() };
  return `event: board\ndata: ${JSON.stringify(body)}\n\n`;
}

export function addClient(userId: string, res: Response): () => void {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(res);
  const hello: BoardPush = { v: versionFor(userId), at: new Date().toISOString() };
  res.write(`event: hello\ndata: ${JSON.stringify(hello)}\n\n`);
  return () => {
    set?.delete(res);
    if (set && set.size === 0) clients.delete(userId);
  };
}

export function clientCount(userId: string): number {
  return clients.get(userId)?.size ?? 0;
}

export function bump(userId: string): void {
  versions.set(userId, versionFor(userId) + 1);
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const msg = payload(userId);
  for (const res of [...set]) {
    try {
      res.write(msg);
    } catch {
      set.delete(res);
    }
  }
}

export function __resetRealtime(): void {
  versions.clear();
  clients.clear();
}
