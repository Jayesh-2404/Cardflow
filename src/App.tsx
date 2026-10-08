import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import Header from './components/Header';
import Sidebar, { type PanelName } from './components/Sidebar';
import BoardColumn, { bodyDroppableId, type ColumnDropHint } from './components/BoardColumn';
import TaskEditor, { type EditorDraft } from './components/TaskEditor';
import JournalPanel from './components/JournalPanel';
import CommandPalette from './components/CommandPalette';
import Login from './components/Login';
import Icon from './components/Icon';
import { ApiError, api, API_BASE, fromServer, type JournalEvent } from './lib/api';
import { DEFAULT_FILTERS, type BoardState, type FilterState, type Task } from './types';
import { todayISO } from './lib/format';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './index.css';

function matchesFilters(t: Task, f: FilterState): boolean {
  if (t.archived && !f.showArchived) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(t.priority)) return false;
  if (f.agent.length > 0 && !f.agent.includes(t.agentState)) return false;
  if (f.tag && !t.tags.includes(f.tag)) return false;
  if (f.overdueOnly) {
    if (!t.dueDate) return false;
    if (!(t.dueDate < todayISO())) return false;
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

/**
 * One DndContext drives two kinds of drag, so collision detection has to be
 * told which kind is in flight. Without this, dragging a card over a list
 * resolves to the list (a drop target) instead of a card, and a card dropped on
 * an empty list has nothing to land on.
 */
const collisionDetection: CollisionDetection = (args) => {
  const kind = (args.active.data.current as { type?: string } | undefined)?.type;
  const droppableContainers = args.droppableContainers.filter((c) => {
    const type = (c.data.current as { type?: string } | undefined)?.type;
    if (kind === 'column') return type === 'column';
    return type === 'card' || type === 'column-body';
  });
  return closestCorners({ ...args, droppableContainers });
};

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
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [createColumnId, setCreateColumnId] = useState('');
  const [mobileCol, setMobileCol] = useState('');
  const [journal, setJournal] = useState<{ counts: Record<string, number>; events: JournalEvent[] }>(
    { counts: {}, events: [] },
  );
  const [notesBusy, setNotesBusy] = useState(false);
  const [pruneBusy, setPruneBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [columnHint, setColumnHint] = useState<{ id: string } & ColumnDropHint | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const journalQueue = useRef<Promise<void>>(Promise.resolve());
  // Last edge the dragged list was hovering, read at drop time.
  const columnHintRef = useRef<(ColumnDropHint & { id: string }) | null>(null);
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
        void refreshJournal();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
        } else {
          setBootError(`Cannot reach the API at ${API_BASE}. Check VITE_API_URL + backend CORS.`);
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
      const k = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && k === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Escape peels one layer at a time: palette, then editor, then panel.
      if (e.key === 'Escape') {
        if (paletteOpen) {
          setPaletteOpen(false);
        } else if (editing || creating) {
          setEditing(null);
          setCreating(false);
        } else if (panel) {
          setPanel(null);
          setRailOpen(false);
        } else if (filters.query) {
          setFilters({ ...filters, query: '' });
        }
        return;
      }

      if (typing || !user || !board) return;

      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (k === 'n') {
        e.preventDefault();
        openCreate(board.columns[0]?.id ?? '');
      } else if (k === 'j') {
        e.preventDefault();
        openPanel('journal');
      } else if (k === 'f') {
        e.preventDefault();
        openPanel('filters');
      } else if (e.key === '?') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (/^[1-9]$/.test(e.key)) {
        // jump to the nth list; on mobile this also switches the visible tab
        const col = board.columns[Number(e.key) - 1];
        if (col) {
          e.preventDefault();
          jumpToColumn(col.id);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, board, paletteOpen, editing, creating, panel, filters]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of board?.tasks ?? []) for (const tag of t.tags) s.add(tag);
    return Array.from(s).sort();
  }, [board]);

  const archived = useMemo(() => board?.tasks.filter((t) => t.archived) ?? [], [board]);

  /** Timeline for the task currently open in the editor. */
  const editingEvents = useMemo(
    () => (editing ? journal.events.filter((e) => e.taskId === editing.id) : []),
    [journal.events, editing],
  );

  const openTasks = useMemo(() => board?.tasks.filter((t) => !t.archived) ?? [], [board]);
  const doneCount = useMemo(() => {
    const doneIds = new Set(
      (board?.columns ?? [])
        .filter((c) => /done|complete|finished|shipped/i.test(c.title))
        .map((c) => c.id),
    );
    return openTasks.filter((t) => doneIds.has(t.columnId)).length;
  }, [board, openTasks]);

  const activeFilterCount =
    filters.priorities.length +
    filters.agent.length +
    (filters.tag ? 1 : 0) +
    (filters.overdueOnly ? 1 : 0) +
    (filters.showArchived ? 1 : 0);

  /**
   * Journal refreshes are serialised through one promise chain. Without this,
   * a slow response issued before a note was logged lands after it and
   * overwrites the newer state, silently dropping the entry from the UI.
   */
  function refreshJournal(): Promise<void> {
    journalQueue.current = journalQueue.current.then(async () => {
      try {
        setJournal(await api.journal());
      } catch {
        // journal is supplementary; the board still works without it
      }
    });
    return journalQueue.current;
  }

  /** Journal counts drive the badge on each card. */
  const entryCounts = journal.counts;

  async function handleAddNote(taskId: string, note: string) {
    setNotesBusy(true);
    try {
      const event = await api.addNote(taskId, note);
      // Let any queued refresh land first so ordering is preserved.
      await journalQueue.current;
      setJournal((j) => ({
        counts: { ...j.counts, [taskId]: (j.counts[taskId] ?? 0) + 1 },
        events: [event, ...j.events.filter((e) => e.id !== event.id)],
      }));
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not log that entry.');
    } finally {
      setNotesBusy(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    const target = journal.events.find((e) => e.id === id);
    if (!target) return;
    if (!window.confirm('Delete this journal entry? The task stays.')) return;
    try {
      await api.deleteJournalEvent(id);
      setJournal((j) => {
        const events = j.events.filter((e) => e.id !== id);
        const counts = { ...j.counts };
        const left = events.filter((e) => e.taskId === target.taskId).length;
        if (left === 0) delete counts[target.taskId];
        else counts[target.taskId] = left;
        return { counts, events };
      });
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not delete that entry.');
    }
  }

  async function handlePrune(before: string) {
    if (!window.confirm(`Delete all journal entries older than ${before}? Tasks stay.`)) return;
    setPruneBusy(true);
    try {
      await api.pruneJournal({ before });
      await refreshJournal();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not prune journal.');
    } finally {
      setPruneBusy(false);
    }
  }

  async function handleClearTask(taskId: string) {
    if (!window.confirm('Delete all journal entries for this task? The task stays.')) return;
    try {
      await api.pruneJournal({ taskId });
      await refreshJournal();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not clear task history.');
    }
  }

  /** Jump from a journal entry to the card it belongs to. */
  function openFromJournal(taskId: string) {
    const task = board?.tasks.find((t) => t.id === taskId);
    if (!task) {
      window.alert('That card no longer exists — the entry is kept for the record.');
      return;
    }
    setPanel(null);
    setRailOpen(false);
    setCreating(false);
    setEditing(task);
  }

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
    } finally {
      void refreshJournal();
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

  function openPanel(p: PanelName) {
    setPanel(p);
    setRailOpen(true);
    if (p === 'journal') void refreshJournal();
  }

  /** Bring a list into view: switch the mobile tab, scroll it on desktop. */
  function jumpToColumn(columnId: string) {
    setMobileCol(columnId);
    document
      .querySelector(`[data-column-id="${columnId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
    const projectKey = draft.projectKey.trim().toLowerCase();
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
        projectKey,
        gitEnabled: draft.gitEnabled,
        agentState: draft.agentState,
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
          projectKey: next.projectKey,
          gitEnabled: next.gitEnabled,
          agentState: next.agentState,
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
          projectKey,
          gitEnabled: draft.gitEnabled,
        }),
      );
    }
    setEditing(null);
    setCreating(false);
  }

  function handleDragStart(e: DragStartEvent) {
    if ((e.active.data.current as { type?: string } | undefined)?.type !== 'column') return;
    columnHintRef.current = null;
    setColumnHint(null);
  }

  /**
   * Which edge of the hovered list the dragged one will slot into.
   *
   * Derived from index order rather than pointer-vs-rect centres: while a list
   * is being dragged the sortable strategy is already shifting its neighbours,
   * so rect maths reports the dragged list's own stale position and the
   * indicator ends up on the wrong side. Index order is stable and is exactly
   * what the drop below computes.
   */
  function handleDragOver(e: DragOverEvent) {
    if (!board) return;
    if ((e.active.data.current as { type?: string } | undefined)?.type !== 'column') return;
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    const from = board.columns.findIndex((c) => c.id === activeId);
    const overIdx = overId ? board.columns.findIndex((c) => c.id === overId) : -1;

    // No hint while hovering the list itself: nothing will move.
    if (from < 0 || overIdx < 0 || overIdx === from) {
      columnHintRef.current = null;
      setColumnHint(null);
      return;
    }
    const next = { id: overId as string, side: overIdx < from ? 'left' : 'right' } as const;
    columnHintRef.current = next;
    setColumnHint(next);
  }

  function handleColumnDragEnd(activeId: string, overId: string) {
    if (!board) return;
    const ids = board.columns.map((c) => c.id);
    const from = ids.indexOf(activeId);
    const overIdx = ids.indexOf(overId);
    if (from < 0 || overIdx < 0) return;

    // Land on the edge the indicator shows, not merely "swap with the hovered
    // list" — otherwise the hint promises a side the drop then ignores.
    const side = columnHintRef.current?.id === overId ? columnHintRef.current.side : null;
    let target: number;
    if (side === null) {
      if (from === overIdx) return;
      target = overIdx; // no hint seen: fall back to swapping into that slot
    } else {
      target = side === 'left' ? overIdx : overIdx + 1;
      if (from < target) target -= 1; // removing the dragged list shifts the rest left
    }
    target = Math.max(0, Math.min(target, ids.length - 1));
    if (target === from) return;

    const next = arrayMove(board.columns, from, target);
    void commit(api.reorderColumns(next.map((c) => c.id)), { ...board, columns: next });
  }

  function handleCardDragEnd(activeId: string, overId: string) {
    if (!board) return;
    const fromIdx = board.tasks.findIndex((t) => t.id === activeId);
    if (fromIdx < 0) return;
    const moving = board.tasks[fromIdx];

    // Dropping on a list body means "put this card in that list".
    const bodyMatch = board.columns.find((c) => bodyDroppableId(c.id) === overId);
    const overTask = board.tasks.find((t) => t.id === overId);
    const overColumn = bodyMatch ? bodyMatch.id : (overTask?.columnId ?? moving.columnId);

    const updated: Task = { ...moving, columnId: overColumn };
    let next: Task[];

    if (bodyMatch || !overTask) {
      // No specific card hovered: append to the end of the target list.
      const rest = board.tasks.filter((t) => t.id !== activeId);
      let seen = -1;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].columnId === overColumn) seen = i;
      }
      next = [...rest.slice(0, seen + 1), updated, ...rest.slice(seen + 1)];
    } else {
      const overIdx = board.tasks.findIndex((t) => t.id === overId);
      next = [...board.tasks];
      next[fromIdx] = updated;
      next = arrayMove(next, fromIdx, overIdx);
    }
    const pos = next.filter((t) => t.columnId === overColumn).findIndex((t) => t.id === activeId);
    void commit(api.moveTask(activeId, overColumn, pos), { ...board, tasks: next });
  }

  function handleDragEnd(e: DragEndEvent) {
    columnHintRef.current = null;
    setColumnHint(null);
    if (!board || !e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId === overId) return;
    const kind = (e.active.data.current as { type?: string } | undefined)?.type;
    if (kind === 'column') handleColumnDragEnd(activeId, overId);
    else handleCardDragEnd(activeId, overId);
  }

  function addList() {
    if (!board) return;
    const title = `List ${board.columns.length + 1}`;
    void commit(api.createColumn(title));
  }

  function exportJson() {
    if (!board) return;
    const payload = { ...board, events: journal.events };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
        const parsed = JSON.parse(String(reader.result)) as BoardState & { events?: JournalEvent[] };
        if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.tasks)) throw new Error('bad');
        void commit(api.replaceBoard(parsed, parsed.events ?? []));
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
      <div className="kb-bg flex h-full items-center justify-center">
        <span className="flex items-center gap-2 text-[12.5px] text-kb-muted">
          <Icon name="columns" size={15} className="kb-accent" />
          Loading board…
        </span>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="kb-bg flex h-full items-center justify-center px-4">
        <div className="kb-panel max-w-sm p-5 text-center">
          <span className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-[8px] text-kb-danger" style={{ background: 'var(--kb-danger-soft)' }}>
            <Icon name="alert" size={17} />
          </span>
          <p className="text-[14px] font-semibold">API unreachable</p>
          <p className="mt-1.5 font-mono-kb text-[11.5px] leading-relaxed text-kb-muted">{bootError}</p>
          <button
            onClick={() => window.location.reload()}
            className="kb-btn kb-btn-primary mt-4 h-8 w-full"
          >
            <Icon name="undo" size={14} />
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
    <div className="kb-bg flex h-full overflow-hidden text-kb-text">
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
        onOpenPanel={openPanel}
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
        journalList={
          <JournalPanel
            events={journal.events}
            onOpenTask={openFromJournal}
            onRefresh={() => void refreshJournal()}
            onDelete={(id) => void handleDeleteEntry(id)}
            onPrune={(before) => void handlePrune(before)}
            pruneBusy={pruneBusy}
          />
        }
        archiveList={
          archived.length === 0 ? (
            <p className="text-[12.5px] text-kb-faint">Nothing archived.</p>
          ) : (
            archived.map((t) => (
              <div key={t.id} className="kb-panel p-2.5">
                <p className="clamp-2 text-[12.5px] font-medium">{t.title}</p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => void commit(api.updateTask(t.id, { archived: false }))}
                    className="kb-btn h-6 px-2 text-[11.5px]"
                  >
                    <Icon name="undo" size={12} />
                    Restore
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Delete permanently?')) void commit(api.deleteTask(t.id));
                    }}
                    className="kb-btn kb-btn-danger h-6 px-2 text-[11.5px]"
                  >
                    <Icon name="trash" size={12} />
                    Delete
                  </button>
                </div>
              </div>
            ))
          )
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          ref={searchRef}
          query={filters.query}
          onQuery={(q) => setFilters({ ...filters, query: q })}
          onNewTask={() => openCreate(board.columns[0]?.id ?? '')}
          activeFilterCount={activeFilterCount}
          doneToday={doneCount}
          totalOpen={openTasks.length}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenFilters={() => {
            setPanel('filters');
            setRailOpen(true);
          }}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setColumnHint(null)}
          >
            {!isDesktop ? (
              /* mobile: one full-width list at a time, switched by tabs */
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="kb-scroll flex shrink-0 gap-1.5 overflow-x-auto border-b kb-border bg-[var(--kb-card)] px-2.5 py-2">
                  {board.columns.map((col) => {
                    const n = board.tasks.filter(
                      (t) => t.columnId === col.id && !t.archived,
                    ).length;
                    const active = col.id === activeMobileCol;
                    return (
                      <button
                        key={col.id}
                        onClick={() => setMobileCol(col.id)}
                        data-testid="mobile-tab"
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors duration-100 ${
                          active
                            ? 'kb-accent-bg border-transparent font-medium'
                            : 'kb-border text-kb-muted'
                        }`}
                      >
                        {col.title}
                        <span className="font-mono-kb ml-1 text-[10.5px] opacity-70">{n}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={addList}
                    className="shrink-0 rounded-full border border-dashed kb-border px-2.5 py-1 text-[12.5px] text-kb-muted"
                  >
                    + List
                  </button>
                </div>
                <div className="kb-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
                  {activeColObj && (
                    <BoardColumn
                      wide
                      column={activeColObj}
                      tasks={visibleTasks(activeColObj.id)}
                      entryCounts={entryCounts}
                      onOpenTask={setEditing}
                      onQuickAdd={quickAdd}
                      onRename={renameCol}
                      onDelete={deleteCol}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* desktop: full-height lists, reorderable by the header grip */
              <SortableContext
                items={board.columns.map((c) => c.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="kb-scroll flex min-h-0 flex-1 items-stretch gap-2.5 overflow-x-auto p-2.5">
                  {board.columns.map((col) => (
                    <BoardColumn
                      key={col.id}
                      column={col}
                      tasks={visibleTasks(col.id)}
                      entryCounts={entryCounts}
                      reorderable
                      dragHint={columnHint?.id === col.id ? { side: columnHint.side } : null}
                      onOpenTask={setEditing}
                      onQuickAdd={quickAdd}
                      onRename={renameCol}
                      onDelete={deleteCol}
                    />
                  ))}
                  <button
                    onClick={addList}
                    data-testid="add-list"
                    className="flex h-[5.5rem] w-[10rem] shrink-0 flex-col items-center justify-center gap-1.5 self-start rounded-[10px] border border-dashed kb-border text-[12.5px] text-kb-muted transition-colors duration-100 hover:border-[var(--kb-border-strong)] hover:bg-[var(--kb-card)] hover:text-kb-text"
                  >
                    <Icon name="plus" size={16} />
                    Add list
                  </button>
                </div>
              </SortableContext>
            )}
          </DndContext>
        </main>
      </div>

      {(editing || creating) && (
        <TaskEditor
          task={editing}
          columns={board.columns}
          initialColumnId={createColumnId || board.columns[0]?.id || ''}
          events={editingEvents}
          notesBusy={notesBusy}
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
          onAddNote={handleAddNote}
          onDeleteEntry={(id) => void handleDeleteEntry(id)}
          onClearTask={editing ? () => void handleClearTask(editing.id) : undefined}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        columns={board.columns}
        tasks={board.tasks}
        archivedCount={archived.length}
        onClose={() => setPaletteOpen(false)}
        onNewTask={openCreate}
        onOpenTask={(t) => {
          setCreating(false);
          setEditing(t);
        }}
        onAddList={addList}
        onOpenPanel={openPanel}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onExport={exportJson}
        onJumpToColumn={jumpToColumn}
      />
    </div>
  );
}
