import type { BoardState, Priority } from '../types';

const BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ServerBoard {
  columns: { id: string; title: string }[];
  tasks: {
    id: string;
    columnId: string;
    title: string;
    description: string;
    priority: string;
    dueDate: string | null;
    tags: string[];
    archived: boolean;
  }[];
}

interface BoardResponse {
  board: ServerBoard;
}

interface SessionResponse extends BoardResponse {
  user: { email: string };
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export function fromServer(b: ServerBoard): BoardState {
  return {
    columns: b.columns.map((c) => ({ id: c.id, title: c.title, createdAt: 0 })),
    tasks: b.tasks.map((t) => ({
      id: t.id,
      columnId: t.columnId,
      title: t.title,
      description: t.description,
      priority: (PRIORITIES.includes(t.priority as Priority) ? t.priority : 'medium') as Priority,
      dueDate: t.dueDate,
      tags: t.tags,
      archived: t.archived,
      createdAt: 0,
      updatedAt: 0,
    })),
  };
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const r = await raw('/api/auth/refresh', { method: 'POST' });
    if (r.ok) res = await raw(path, init);
  }
  if (!res.ok) {
    let msg = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string') msg = body.error;
    } catch {
      // keep default
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

function body(data: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(data) };
}

export const api = {
  me(): Promise<SessionResponse> {
    return req<SessionResponse>('/api/auth/me');
  },
  register(email: string, password: string): Promise<SessionResponse> {
    return req<SessionResponse>('/api/auth/register', body({ email, password }));
  },
  login(email: string, password: string): Promise<SessionResponse> {
    return req<SessionResponse>('/api/auth/login', body({ email, password }));
  },
  async logout(): Promise<void> {
    try {
      await req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } catch {
      // still logged out locally
    }
  },
  changePassword(current: string, next: string): Promise<{ ok: boolean; relogin?: boolean }> {
    return req('/api/auth/password', body({ current, next }));
  },

  async getBoard(): Promise<BoardState> {
    return fromServer((await req<BoardResponse>('/api/board')).board);
  },
  async createColumn(title: string): Promise<BoardState> {
    return fromServer((await req<BoardResponse>('/api/board/columns', body({ title }))).board);
  },
  async renameColumn(id: string, title: string): Promise<BoardState> {
    return fromServer(
      (await req<BoardResponse>(`/api/board/columns/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })).board,
    );
  },
  async deleteColumn(id: string): Promise<BoardState> {
    return fromServer((await req<BoardResponse>(`/api/board/columns/${id}`, { method: 'DELETE' })).board);
  },

  async createTask(input: {
    columnId: string;
    title: string;
    description: string;
    priority: Priority;
    dueDate: string;
    tags: string[];
  }): Promise<BoardState> {
    return fromServer((await req<BoardResponse>('/api/board/tasks', body(input))).board);
  },
  async updateTask(
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      priority: Priority;
      dueDate: string | null;
      tags: string[];
      archived: boolean;
      columnId: string;
    }>,
  ): Promise<BoardState> {
    return fromServer(
      (await req<BoardResponse>(`/api/board/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })).board,
    );
  },
  async moveTask(id: string, columnId: string, position: number): Promise<BoardState> {
    return fromServer(
      (await req<BoardResponse>(`/api/board/tasks/${id}/move`, body({ columnId, position }))).board,
    );
  },
  async deleteTask(id: string): Promise<BoardState> {
    return fromServer((await req<BoardResponse>(`/api/board/tasks/${id}`, { method: 'DELETE' })).board);
  },

  async replaceBoard(board: BoardState): Promise<BoardState> {
    return fromServer((await req<BoardResponse>('/api/board/replace', body({ board }))).board);
  },
  async clearBoard(): Promise<BoardState> {
    return fromServer((await req<BoardResponse>('/api/board', { method: 'DELETE' })).board);
  },
  async resetBoard(): Promise<BoardState> {
    return fromServer((await req<BoardResponse>('/api/board/reset', body({}))).board);
  },
};
