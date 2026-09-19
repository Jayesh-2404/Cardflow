import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import BoardColumn from './components/BoardColumn';
import TaskEditor, { type EditorDraft } from './components/TaskEditor';
import Login from './components/Login';
import { ApiError, api, fromServer } from './lib/api';
import { DEFAULT_FILTERS, type BoardState, type FilterState, type Task } from './types';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './index.css';

function matchesFilters(t: Task, f: FilterState): boolean {
  if (t.archived && !f.showArchived) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(t.priority)) return false;
  if (f.tag && !t.tags.includes(f.tag)) return false;
  if (f.overdueOnly) {
    if (!t.dueDate) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (!(t.dueDate < today)) return false;
  }
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = `${t.title}\n${t.description}\n${t.tags.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

export default function App() {
  const [user, setUser] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('kb.theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [board, setBoard] = useState<BoardState | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [railOpen, setRailOpen] = useState(false);
  const [panel, setPanel] = useState<'filters' | 'archive' | 'settings' | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [createColumnId, setCreateColumnId] = useState('');
  const [mobileCol, setMobileCol] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = useIsDesktop();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // long-press to drag on touch; plain scroll otherwise
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    try {
      localStorage.setItem('kb.theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // session bootstrap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.me();
        if (cancelled) return;
        setUser(res.user.email);
        setBoard(fromServer(res.board));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
        } else {
          setBootError('Cannot reach the API. Start it with `npm run dev` in server/.');
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === 'n' && !typing && user && board) {
        e.preventDefault();
        openCreate(board.columns[0]?.id ?? '');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, board]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of board?.tasks ?? []) for (const tag of t.tags) s.add(tag);
    return Array.from(s).sort();
  }, [board]);

  const archived = useMemo(() => board?.tasks.filter((t) => t.archived) ?? [], [board]);

  const activeFilterCount =
    filters.priorities.length +
    (filters.tag ? 1 : 0) +
    (filters.overdueOnly ? 1 : 0) +
    (filters.showArchived ? 1 : 0);

  /** Run a mutation: optimistic update, send to server, reconcile with server board. */
  async function commit(call: Promise<BoardState>, optimistic?: BoardState) {
    if (optimistic) setBoard(optimistic);
    try {
      setBoard(await call);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Sync failed');
      try {
        setBoard(await api.getBoard());
      } catch {
        // keep optimistic state
      }
    }
  }

  function visibleTasks(columnId: string): Task[] {
    if (!board) return [];
    return board.tasks.filter((t) => t.columnId === columnId && matchesFilters(t, filters));
  }

  function openCreate(columnId: string) {
    if (!board) return;
    setCreateColumnId(columnId || board.columns[0]?.id || '');
    setEditing(null);
    setCreating(true);
  }

  function parseTags(input: string): string[] {
    return input
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 8);
  }

  function handleSave(draft: EditorDraft, taskId: string | null) {
    const title = draft.title.trim();
    if (!title || !board) return;
    if (taskId) {
      const current = board.tasks.find((t) => t.id === taskId);
      if (!current) return;
      const next: Task = {
        ...current,
        title,
        description: draft.description.trim(),
        priority: draft.priority,
        dueDate: draft.dueDate || null,
        tags: parseTags(draft.tags),
        columnId: draft.columnId,
      };
      const optimistic: BoardState = {
        ...board,
        tasks: board.tasks.map((t) => (t.id === taskId ? next : t)),
      };
      void commit(
        api.updateTask(taskId, {
          title: next.title,
          description: next.description,
          priority: next.priority,
          dueDate: next.dueDate,
          tags: next.tags,
          columnId: next.columnId,
        }),
        optimistic,
      );
    } else {
      void commit(
        api.createTask({
          columnId: draft.columnId || board.columns[0]?.id || '',
          title,
          description: draft.description.trim(),
          priority: draft.priority,
          dueDate: draft.dueDate,
          tags: parseTags(draft.tags),
        }),
      );
    }
    setEditing(null);
    setCreating(false);
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!board) return;
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const fromIdx = board.tasks.findIndex((t) => t.id === activeId);
    if (fromIdx < 0) return;
    const moving = board.tasks[fromIdx];
    const overColumn = board.columns.some((c) => c.id === overId)
      ? overId
      : (board.tasks.find((t) => t.id === overId)?.columnId ?? moving.columnId);
    const rest = board.tasks.filter((t) => t.id !== activeId);
    let insertAt: number;
    if (board.columns.some((c) => c.id === overId)) {
      let seen = -1;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].columnId === overColumn) seen = i;
      }
      insertAt = seen + 1;
    } else {
      const overIdx = rest.findIndex((t) => t.id === overId);
      insertAt = overIdx < 0 ? rest.length : overIdx;
    }
    const updated: Task = { ...moving, columnId: overColumn };
    const next = [...rest.slice(0, insertAt), updated, ...rest.slice(insertAt)];
    const optimistic: BoardState = { ...board, tasks: next };
    const pos = next.filter((t) => t.columnId === overColumn).findIndex((t) => t.id === activeId);
    void commit(api.moveTask(activeId, overColumn, pos), optimistic);
  }

  function addList() {
    if (!board) return;
    const title = `List ${board.columns.length + 1}`;
    void commit(api.createColumn(title));
  }

  function exportJson() {
    if (!board) return;
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanban-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as BoardState;
        if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.tasks)) throw new Error('bad');
        void commit(api.replaceBoard(parsed));
      } catch {
        window.alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setBoard(null);
    setPanel(null);
    setRailOpen(false);
  }

  if (booting) {
    return (
      <div className="h-full flex items-center justify-center kb-bg kb-text">
        <p className="kb-muted text-sm">Loading…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="h-full flex items-center justify-center kb-bg kb-text px-4">
        <div className="max-w-sm text-center">
          <p className="font-semibold">API unreachable</p>
          <p className="text-sm kb-muted mt-1 font-mono-kb">{bootError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg kb-accent-bg text-white text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user || !board) {
    return (
      <Login
        onAuthed={(email, b) => {
          setUser(email);
          setBoard(b);
        }}
      />
    );
  }

  function quickAdd(columnId: string, title: string) {
    void commit(
      api.createTask({
        columnId,
        title: title.trim(),
        description: '',
        priority: 'medium',
        dueDate: '',
        tags: [],
      }),
    );
  }

  function renameCol(columnId: string, title: string) {
    void commit(api.renameColumn(columnId, title));
  }

  function deleteCol(columnId: string) {
    if (!window.confirm('Delete this list? Its tasks move to the first list.')) return;
    void commit(api.deleteColumn(columnId));
  }

  const activeMobileCol = board.columns.some((c) => c.id === mobileCol)
    ? mobileCol
    : (board.columns[0]?.id ?? '');
  const activeColObj = board.columns.find((c) => c.id === activeMobileCol);

  return (
    <div className="h-full flex kb-bg kb-text">
      <Sidebar
        railOpen={railOpen}
        panel={panel}
        filters={filters}
        allTags={allTags}
        archivedCount={archived.length}
        theme={theme}
        onToggleRail={() => {
          if (panel) {
            setPanel(null);
            setRailOpen(false);
          } else {
            setPanel('filters');
            setRailOpen(true);
          }
        }}
        onOpenPanel={(p) => {
          setPanel(p);
          setRailOpen(true);
        }}
        onClosePanel={() => {
          setPanel(null);
          setRailOpen(false);
        }}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters(DEFAULT_FILTERS)}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onExport={exportJson}
        onImport={importJson}
        onResetDemo={() => {
          if (window.confirm('Reset to demo data? Current board will be replaced.')) {
            void commit(api.resetBoard());
          }
        }}
        onChangePassword={async (cur, next) => {
          try {
            const r = await api.changePassword(cur, next);
            if (r.relogin) {
              await logout();
              window.alert('Password updated — please log in again.');
            }
            return true;
          } catch {
            return false;
          }
        }}
        onLock={() => {
          void logout();
        }}
        onWipe={() => {
          if (window.confirm('Erase ALL tasks and lists on the server?')) {
            void commit(api.clearBoard());
          }
        }}
        archiveList={
          archived.length === 0 ? (
            <p className="text-sm kb-muted">Nothing archived.</p>
          ) : (
            archived.map((t) => (
              <div key={t.id} className="border kb-border rounded-lg p-2.5 text-sm">
                <p className="clamp-2">{t.title}</p>
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={() => void commit(api.updateTask(t.id, { archived: false }))}
                    className="text-xs px-2 py-1 rounded-md border kb-border hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Delete permanently?')) void commit(api.deleteTask(t.id));
                    }}
                    className="text-xs px-2 py-1 rounded-md border border-red-300 text-red-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          ref={searchRef}
          query={filters.query}
          onQuery={(q) => setFilters({ ...filters, query: q })}
          onNewTask={() => openCreate(board.columns[0]?.id ?? '')}
          activeFilterCount={activeFilterCount}
          onOpenFilters={() => {
            setPanel('filters');
            setRailOpen(true);
          }}
        />

        <main className="flex-1 min-h-0 flex flex-col">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {!isDesktop ? (
              /* mobile: one full-width column at a time with tabs */
              <div className="flex flex-col min-h-0 flex-1">
              <div className="flex gap-1.5 px-3 py-2 overflow-x-auto kb-scroll border-b kb-border kb-card shrink-0">
                {board.columns.map((col) => {
                  const n = board.tasks.filter(
                    (t) => t.columnId === col.id && !t.archived,
                  ).length;
                  const active = col.id === activeMobileCol;
                  return (
                    <button
                      key={col.id}
                      onClick={() => setMobileCol(col.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-sm border ${
                        active
                          ? 'kb-accent-bg text-white border-transparent font-medium'
                          : 'kb-border kb-muted'
                      }`}
                    >
                      {col.title}{' '}
                      <span className="font-mono-kb text-xs ml-0.5">{n}</span>
                    </button>
                  );
                })}
                <button
                  onClick={addList}
                  className="shrink-0 px-3 py-1.5 rounded-full text-sm border border-dashed kb-border kb-muted"
                >
                  + List
                </button>
              </div>
              <div className="flex-1 overflow-y-auto kb-scroll p-3 min-h-0">
                {activeColObj && (
                  <BoardColumn
                    wide
                    column={activeColObj}
                    tasks={visibleTasks(activeColObj.id)}
                    onOpenTask={setEditing}
                    onQuickAdd={quickAdd}
                    onRename={renameCol}
                    onDelete={deleteCol}
                  />
                )}
              </div>
            </div>
            ) : (
              /* desktop: horizontal board */
              <div className="flex flex-1 min-h-0 gap-3 p-4 items-start overflow-x-auto kb-scroll">
              {board.columns.map((col) => (
                <BoardColumn
                  key={col.id}
                  column={col}
                  tasks={visibleTasks(col.id)}
                  onOpenTask={setEditing}
                  onQuickAdd={quickAdd}
                  onRename={renameCol}
                  onDelete={deleteCol}
                />
              ))}
              <button
                onClick={addList}
                className="w-72 shrink-0 rounded-xl border border-dashed kb-border px-3 py-3 text-sm kb-muted hover:kb-text hover:bg-black/5 dark:hover:bg-white/5"
              >
                + Add list
              </button>
              </div>
            )}
          </DndContext>
        </main>
      </div>

      {(editing || creating) && (
        <TaskEditor
          task={editing}
          columns={board.columns}
          initialColumnId={createColumnId || board.columns[0]?.id || ''}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={handleSave}
          onDelete={(id) => {
            void commit(api.deleteTask(id));
            setEditing(null);
          }}
          onArchive={(id, archivedFlag) => {
            void commit(api.updateTask(id, { archived: archivedFlag }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
