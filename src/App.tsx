import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCodes,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { MotionConfig, motion, useMotionValue } from 'motion/react';
import Header from './components/Header';
import Sidebar, { type PanelName } from './components/Sidebar';
import BoardColumn, { traySelector, type ColumnDropHint } from './components/BoardColumn';
import DragOverlayCard from './components/DragOverlayCard';
import type { CardDragState } from './components/TaskCard';
import TaskEditor, { type EditorDraft } from './components/TaskEditor';
import JournalPanel from './components/JournalPanel';
import CommandPalette from './components/CommandPalette';
import Login from './components/Login';
import Icon from './components/Icon';
import { ApiError, api, API_BASE, fromServer, type JournalEvent } from './lib/api';
import { subscribeBoard, type LiveStatus } from './lib/live';
import {
  applySlot,
  indexInTray,
  pickTray,
  positionOf,
  sameOrder,
  stepSlotToNeighbourColumn,
  stepSlotWithinColumn,
  type CardBox,
  type Point,
  type Slot,
  type TrayBox,
} from './lib/slot';
import {
  cancelMessage,
  dropMessage,
  moveMessage,
  pickUpMessage,
  screenReaderInstructions,
} from './lib/dragAnnouncements';
import { DEFAULT_FILTERS, type BoardState, type FilterState, type Task } from './types';
import { todayISO } from './lib/format';
/**
 * Latin subsets only.
 *
 * The umbrella `@fontsource/inter/400.css` files declare every subset
 * (cyrillic, greek, vietnamese, ...) which emitted 25 font files and ~744KB of
 * dead weight in `dist` for a board whose copy is English. The latin subset
 * covers U+2000-206F, so the em-dashes and arrows in this UI still render from
 * Inter rather than falling back to a system font.
 */
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
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
 * The board answers from its own slot state, so dnd-kit's region is left silent:
 * its announcements fire on `over`, and a card drag here never hit-tests a
 * droppable. Silence is `undefined` per callback, which leaves its text alone;
 * its described-by instructions are still attached to every card.
 */
const silentAnnouncements: Announcements = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

/**
 * Space lifts the focused card; Space, Enter or Tab put it down; Escape cancels.
 * Enter is deliberately not a lift key: on a focused card it opens the details,
 * which is the shortcut people already know.
 */
const KEYBOARD_CODES: KeyboardCodes = {
  start: [KeyboardCode.Space],
  cancel: [KeyboardCode.Esc],
  end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab],
};

/**
 * A keyboard move is the board's own decision (see the step handler below), not
 * a coordinate dnd-kit could compute: the card travels slot to slot. dnd-kit is
 * handed back its own coordinates, sees a key it has to consume (so the page
 * does not scroll under the lifted card), and leaves the transform alone.
 * Modified keys are left to the browser, so Escape and browser shortcuts keep
 * their meaning.
 */
const holdCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) =>
  event.ctrlKey || event.metaKey || event.altKey ? undefined : currentCoordinates;

/**
 * A card drag is resolved from the board's slot model, so dnd-kit is asked to
 * hit-test nothing for it: no `over`, no per-frame rect work, no dependence on
 * where the pointer is relative to a droppable. Lists still use corner
 * distance, because their drop really is "which list is nearest".
 */
const collisionDetection: CollisionDetection = (args) => {
  const kind = (args.active.data.current as { type?: string } | undefined)?.type;
  const columns = args.droppableContainers.filter(
    (c) => (c.data.current as { type?: string } | undefined)?.type === 'column',
  );
  if (kind !== 'column' || columns.length === 0) return [];
  return closestCorners({ ...args, droppableContainers: columns });
};

type DragMode = 'pointer' | 'keyboard';

/**
 * `lifting` is the moment of pick-up, before anything has moved; `dragging` is
 * a drag whose slot has been resolved at least once; `dropping` is the drop
 * spring in flight, when the card is already committed but still drawn by the
 * drag overlay.
 */
type DragPhase = 'idle' | 'lifting' | 'dragging' | 'dropping';

/**
 * One drag, one record.
 *
 * `slot` is where the card lands if it is released now; `from` is where it was
 * picked up, which is what a cancel restores and what the pick-up announcement
 * names. Every part of the board reads this one record instead of a scatter of
 * booleans, and `slot` is list-scoped because board order is.
 */
interface DragSession {
  phase: DragPhase;
  mode: DragMode;
  id: string;
  from: Slot;
  slot: Slot | null;
}

const IDLE_DRAG: DragSession = {
  phase: 'idle',
  mode: 'pointer',
  id: '',
  from: { columnId: '', index: 0 },
  slot: null,
};

/** Weight of each new sample in the velocity average: responsive, not jittery. */
const VELOCITY_SMOOTHING = 0.35;

const centreOf = (r: { left: number; right: number; top: number; bottom: number }): Point => ({
  x: (r.left + r.right) / 2,
  y: (r.top + r.bottom) / 2,
});

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
  const [drag, setDrag] = useState<DragSession>(IDLE_DRAG);
  const [journal, setJournal] = useState<{ counts: Record<string, number>; events: JournalEvent[] }>(
    { counts: {}, events: [] },
  );
  const [notesBusy, setNotesBusy] = useState(false);
  const [pruneBusy, setPruneBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [live, setLive] = useState<LiveStatus>('off');
  const [columnHint, setColumnHint] = useState<{ id: string } & ColumnDropHint | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const journalQueue = useRef<Promise<void>>(Promise.resolve());
  // Last edge the dragged list was hovering, read at drop time.
  const columnHintRef = useRef<(ColumnDropHint & { id: string }) | null>(null);

  /*
    Drag state is written synchronously as well as into React state. dnd-kit
    calls its handlers from its own event listeners, in the same tick as the
    state update, so a handler that ran after a sibling handler has to be able
    to see what that one decided: a stale slot is a card that lands in the
    wrong place.
  */
  const dragRef = useRef<DragSession>(IDLE_DRAG);
  // Board data for handlers that run outside a render (the key step handler):
  // effects below keep them one commit fresh, which every event is behind.
  const boardRef = useRef<BoardState | null>(null);
  const filtersRef = useRef(filters);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // The board's own live region, written by hand (see `say`).
  const liveRef = useRef<HTMLDivElement | null>(null);
  const liveTimer = useRef<number | undefined>(undefined);
  // Where the pointer last put the card, for velocity sampling.
  const probeRef = useRef<(Point & { at: number }) | null>(null);
  const velocityRef = useRef<Point>({ x: 0, y: 0 });
  // The throw: the velocity the card was carrying when it was released.
  const throwRef = useRef({ x: 0, y: 0, at: 0 });
  const velocityX = useMotionValue(0);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    boardRef.current = board;
    filtersRef.current = filters;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // long-press to drag on touch; plain scroll otherwise
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES, coordinateGetter: holdCoordinates }),
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

  // live sync across tabs and devices; server push triggers a refetch
  useEffect(() => {
    if (!user) return;
    const stop = subscribeBoard(
      () => {
        api
          .getBoard()
          .then((b) => setBoard(b))
          .catch(() => {});
        void refreshJournal();
      },
      (s) => setLive(s),
    );
    return stop;
  }, [user]);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // A drag owns the keyboard: dnd-kit consumes lift, move and drop keys and
      // the board's own step handler consumes the arrows.
      if (e.defaultPrevented || dragRef.current.phase !== 'idle') return;

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
        // jump to the nth list
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

  /** Ids the board is drawing right now: the filter is applied in one place. */
  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of board?.tasks ?? []) if (matchesFilters(t, filters)) ids.add(t.id);
    return ids;
  }, [board, filters]);

  /*
    The list the board draws, with the card in flight moved into its slot. The
    drag overlay is only what the pointer carries; the slot itself is a real
    reorder of this list, which is what lets neighbours glide with a layout
    spring and the count in each header update as the card crosses lists.
  */
  const renderTasks = useMemo(() => {
    const tasks = board?.tasks ?? [];
    if (drag.phase === 'idle') return tasks;
    return applySlot(tasks, drag.id, drag.slot, (t) => visibleIds.has(t.id));
  }, [board, visibleIds, drag.phase, drag.id, drag.slot]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const col of board?.columns ?? []) map.set(col.id, []);
    for (const t of renderTasks) {
      if (!visibleIds.has(t.id)) continue;
      map.get(t.columnId)?.push(t);
    }
    return map;
  }, [board, renderTasks, visibleIds]);

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

  /** Bring a list into view in the board's own scroller. */
  function jumpToColumn(columnId: string) {
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

  /* ------------------------------------------------------------------ drag */

  function writeDrag(next: DragSession) {
    dragRef.current = next;
    setDrag(next);
  }

  /**
   * Announce a drag, in the board's own words.
   *
   * Written straight to the region's text rather than through state: a drag
   * announces on every slot change, and re-rendering the board for a message
   * only a screen reader will read would be the most expensive thing a drag
   * does. The text is cleared first because a region whose content did not
   * change is not re-announced, and a card can be named twice in one drag (out
   * of a list and back again).
   */
  function say(message: string) {
    const node = liveRef.current;
    if (!node) return;
    window.clearTimeout(liveTimer.current);
    node.textContent = '';
    liveTimer.current = window.setTimeout(() => {
      node.textContent = message;
    }, 80);
  }

  /** Fresh board data for the handlers that run outside React's render. */
  function visibleNow(): Task[] {
    return (boardRef.current?.tasks ?? []).filter((t) => matchesFilters(t, filtersRef.current));
  }

  function columnTitle(columnId: string): string {
    return boardRef.current?.columns.find((c) => c.id === columnId)?.title ?? '';
  }

  /**
   * Cards in a list as the reader will find it, counting the one in flight in
   * the list it is about to enter, so the number in an announcement is the
   * number the header shows.
   */
  function countIn(columnId: string, dragged: Task): number {
    const n = visibleNow().filter((t) => t.columnId === columnId).length;
    return columnId === dragged.columnId ? n : n + 1;
  }

  function trayBoxes(): TrayBox[] {
    const root = scrollerRef.current;
    if (!root) return [];
    const boxes: TrayBox[] = [];
    for (const tray of root.querySelectorAll<HTMLElement>(traySelector)) {
      const columnId = tray.dataset.trayId;
      if (!columnId) continue;
      const r = tray.getBoundingClientRect();
      boxes.push({ columnId, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return boxes;
  }

  function trayCards(columnId: string): CardBox[] {
    const tray = scrollerRef.current?.querySelector<HTMLElement>(`[data-tray-id="${columnId}"]`);
    if (!tray) return [];
    const boxes: CardBox[] = [];
    for (const card of tray.querySelectorAll<HTMLElement>('[data-task-id]')) {
      const id = card.dataset.taskId;
      if (!id) continue;
      const r = card.getBoundingClientRect();
      boxes.push({ id, columnId, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return boxes;
  }

  /**
   * Where the pointer is holding the card, read from the card itself.
   *
   * The overlay is a fixed box with its own sizing, so its rect is the one
   * place that is exactly what the eye sees: it already carries the pointer
   * offset from the grab point and it does not include the lean or the lift
   * scale, because those live on a node inside it. Reading it also keeps the
   * probe free of scroll compensation: when a tray auto-scrolls under a
   * stationary pointer the card stays put in viewport terms, and so does the
   * slot it is looking for.
   */
  function dragProbe(): Point | null {
    const node = document.querySelector<HTMLElement>('[data-testid="drag-overlay"]');
    return node ? centreOf(node.getBoundingClientRect()) : null;
  }

  function handleDragStart(e: DragStartEvent) {
    const kind = (e.active.data.current as { type?: string } | undefined)?.type;
    // The list drop indicator only means something for a list drag.
    columnHintRef.current = null;
    setColumnHint(null);
    if (kind !== 'card' || !board) return;

    const id = String(e.active.id);
    const task = board.tasks.find((t) => t.id === id);
    if (!task) return;

    const visible = board.tasks.filter((t) => matchesFilters(t, filters));
    const index = visible.filter((t) => t.columnId === task.columnId).findIndex((t) => t.id === id);
    const from: Slot = { columnId: task.columnId, index: Math.max(0, index) };

    probeRef.current = null;
    velocityRef.current = { x: 0, y: 0 };
    throwRef.current = { x: 0, y: 0, at: 0 };
    velocityX.set(0);

    writeDrag({
      phase: 'lifting',
      mode: e.activatorEvent.type === 'keydown' ? 'keyboard' : 'pointer',
      id,
      from,
      // Held exactly where it was picked up until something asks it to move.
      slot: from,
    });
    say(pickUpMessage(task, columnTitle(task.columnId), from.index, countIn(task.columnId, task)));
  }

  function handleDragMove(e: DragMoveEvent) {
    const session = dragRef.current;
    if (session.phase === 'idle' || session.mode !== 'pointer') return;
    if (String(e.active.id) !== session.id) return;

    const probe = dragProbe();
    if (!probe) return;

    // Velocity is sampled from the card's own movement rather than from the
    // pointer delta: the pointer delta carries scroll compensation, so an edge
    // auto-scroll under a still hand would read as a flick.
    const now = performance.now();
    const prev = probeRef.current;
    if (prev) {
      const dt = now - prev.at;
      if (dt > 0 && dt < 200) {
        const k = VELOCITY_SMOOTHING;
        const v = velocityRef.current;
        v.x += ((probe.x - prev.x) / (dt / 1000) - v.x) * k;
        v.y += ((probe.y - prev.y) / (dt / 1000) - v.y) * k;
        velocityX.set(v.x);
        throwRef.current = { x: v.x, y: v.y, at: now };
      }
    }
    probeRef.current = { ...probe, at: now };

    const tray = pickTray(probe.x, trayBoxes());
    if (!tray) return;
    moveSlot({
      columnId: tray.columnId,
      index: indexInTray(probe.y, trayCards(tray.columnId), session.id),
    });
  }

  /**
   * The one place a slot changes: the record is written synchronously so the
   * next handler in the same tick sees it, and the move is announced only when
   * the card really changed position, because an unchanged live region is not
   * re-announced and a repeated string would read as a stutter.
   */
  function moveSlot(next: Slot) {
    const session = dragRef.current;
    if (session.phase === 'idle' || !session.slot) return;
    if (session.slot.columnId === next.columnId && session.slot.index === next.index) return;
    writeDrag({ ...session, phase: 'dragging', slot: next });
    const dragging = visibleNow().find((t) => t.id === session.id);
    if (dragging) {
      say(moveMessage(dragging, columnTitle(next.columnId), next.index, countIn(next.columnId, dragging)));
    }
  }

  /**
   * Keyboard moves are steps, not coordinates: a card is picked up in a slot,
   * so it moves a slot at a time within its list and keeps its depth when it
   * crosses into a neighbour.
   *
   * The listener only exists while a keyboard drag is live, so the board does
   * not compete for arrows at any other time. dnd-kit sees the arrow first and
   * consumes it; the step is this handler's, and it prevents the default action
   * too, because dnd-kit skips its own preventDefault when its auto-scroll
   * finds nothing to scroll.
   */
  const keyboardDrag = drag.phase !== 'idle' && drag.mode === 'keyboard';
  useEffect(() => {
    if (!keyboardDrag) return;
    function onKey(e: KeyboardEvent) {
      const session = dragRef.current;
      if (session.phase === 'idle' || session.mode !== 'keyboard' || !session.slot) return;
      const vertical = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      const horizontal = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!vertical && !horizontal) return;
      e.preventDefault();

      const columns = boardRef.current?.columns ?? [];
      const visible = visibleNow();
      moveSlot(
        vertical
          ? stepSlotWithinColumn(session.slot, vertical, visible, session.id)
          : stepSlotToNeighbourColumn(session.slot, horizontal, columns, visible, session.id),
      );

      // Keep the lifted card in view: the tray scrolls vertically, the board
      // sideways, and the card is the only thing that moved.
      window.requestAnimationFrame(() => {
        scrollerRef.current
          ?.querySelector<HTMLElement>(`[data-task-id="${session.id}"]`)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboardDrag]);

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

  /**
   * Commit the slot the drag settled on: one optimistic move through the
   * existing API, exactly where the board drew the card. A drag that ended
   * where it started is not a move and is not sent.
   */
  function commitSlot(task: Task, slot: Slot, phase: DragPhase) {
    writeDrag({ ...dragRef.current, phase, slot });
    say(dropMessage(task, columnTitle(slot.columnId), slot.index, countIn(slot.columnId, task)));
    if (!board) return;
    const next = applySlot(board.tasks, task.id, slot, (t) => visibleIds.has(t.id));
    if (sameOrder(next, board.tasks)) return;
    void commit(api.moveTask(task.id, slot.columnId, positionOf(next, task.id)), {
      ...board,
      tasks: next,
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    columnHintRef.current = null;
    setColumnHint(null);
    const activeId = String(e.active.id);
    const kind = (e.active.data.current as { type?: string } | undefined)?.type;
    if (kind === 'column') {
      if (e.over) handleColumnDragEnd(activeId, String(e.over.id));
      return;
    }
    if (!board) return;

    const session = dragRef.current;
    if (session.phase === 'idle' || session.id !== activeId) return;
    const task = board.tasks.find((t) => t.id === activeId);
    if (!task) {
      writeDrag(IDLE_DRAG);
      return;
    }

    /*
      A pointer drop keeps the slot and the phase until the spring has landed:
      the overlay clone is what flies, the real card stays out of the way, and
      the drop animation measures the slot from live DOM. A keyboard drop has no
      overlay to fly, so it lands at once.
    */
    commitSlot(task, session.slot ?? session.from, session.mode === 'keyboard' ? 'idle' : 'dropping');
  }

  function handleDragCancel() {
    columnHintRef.current = null;
    setColumnHint(null);
    const session = dragRef.current;
    if (session.phase === 'idle') return;
    const task = boardRef.current?.tasks.find((t) => t.id === session.id);
    // Back to where it was picked up: a pointer drag flies the clone home, a
    // keyboard drag has nothing to fly and returns its card at once.
    writeDrag({ ...session, phase: session.mode === 'keyboard' ? 'idle' : 'dropping', slot: null });
    if (task) {
      say(
        cancelMessage(
          task,
          columnTitle(session.from.columnId),
          session.from.index,
          countIn(session.from.columnId, task),
        ),
      );
    }
  }

  /** The drop spring has landed; the board can draw the real card again. */
  const handleDragSettled = useCallback(() => {
    dragRef.current = IDLE_DRAG;
    setDrag(IDLE_DRAG);
  }, []);

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
          <span
            className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-[8px] text-kb-danger"
            style={{ background: 'var(--kb-danger-soft)' }}
          >
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

  const dragging = drag.phase === 'idle' ? null : drag;
  const overlayTask = dragging ? board.tasks.find((t) => t.id === dragging.id) : undefined;
  const dragCard: { taskId: string; state: CardDragState } | null = dragging
    ? {
        taskId: dragging.id,
        // A pointer drag draws the card in the overlay, a keyboard drag keeps it
        // on the board and travels it slot to slot.
        state: dragging.mode === 'keyboard' ? 'lifted' : dragging.phase === 'dropping' ? 'settling' : 'placeholder',
      }
    : null;

  return (
    <MotionConfig reducedMotion="user">
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
              <p className="text-[12.5px] text-kb-muted">Nothing archived.</p>
            ) : (
              archived.map((t) => (
                <div
                  key={t.id}
                  className="kb-panel-inset rounded-[var(--kb-r-lg)] p-3"
                >
                  <p className="clamp-2 text-[13px] font-medium">{t.title}</p>
                  <div className="mt-2.5 flex gap-1.5">
                    <button
                      onClick={() => void commit(api.updateTask(t.id, { archived: false }))}
                      className="kb-btn kb-btn-outline h-7 px-2.5 text-[12px]"
                    >
                      <Icon name="undo" size={12} />
                      Restore
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Delete permanently?')) void commit(api.deleteTask(t.id));
                      }}
                      className="kb-btn kb-btn-danger h-7 px-2.5 text-[12px]"
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
            live={live}
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
              accessibility={{ announcements: silentAnnouncements, screenReaderInstructions }}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              {/*
                One board at every width. The columns keep a readable minimum and
                the scroller snaps list by list on a phone, so narrowing the
                frame never changes what the board is, only how much of it fits.
              */}
              <motion.div
                ref={scrollerRef}
                layoutScroll
                data-testid="board-scroller"
                className="kb-scroll flex min-h-0 flex-1 snap-x items-stretch gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-1"
              >
                <SortableContext
                  items={board.columns.map((c) => c.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {board.columns.map((col) => (
                    <BoardColumn
                      key={col.id}
                      column={col}
                      tasks={tasksByColumn.get(col.id) ?? []}
                      entryCounts={entryCounts}
                      reorderable={isDesktop}
                      dragHint={columnHint?.id === col.id ? { side: columnHint.side } : null}
                      armed={dragging !== null && dragging.slot?.columnId === col.id}
                      drag={dragCard}
                      onOpenTask={setEditing}
                      onQuickAdd={quickAdd}
                      onRename={renameCol}
                    />
                  ))}
                </SortableContext>
              </motion.div>

              {/*
                Mounted for the whole pointer drag, drop spring included: dnd-kit
                keeps a frozen clone of these children alive for as long as the
                drop animation's promise takes, and that clone is what flies into
                the slot. A keyboard drag has no overlay to fly.
              */}
              {dragging && dragging.mode === 'pointer' && overlayTask && (
                <DragOverlayCard
                  task={overlayTask}
                  entryCount={entryCounts[dragging.id] ?? 0}
                  velocityX={velocityX}
                  throwVelocity={throwRef}
                  onSettled={handleDragSettled}
                />
              )}
            </DndContext>

            {/*
              The one assertive region. dnd-kit's own is left silent because its
              messages are keyed to `over`, which a slot-resolved drag never
              sets, and because a keyboard step does not fire a monitor event at
              all. This one is written from the slot that was actually committed.
            */}
            <div
              ref={liveRef}
              className="kb-sr-only"
              aria-live="assertive"
              aria-atomic="true"
              data-testid="drag-live"
            />
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
          onOpenPanel={openPanel}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          onExport={exportJson}
          onJumpToColumn={jumpToColumn}
        />
      </div>
    </MotionConfig>
  );
}
