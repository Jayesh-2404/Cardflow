import { useEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';
import type { Column, Task } from '../types';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  hint?: string;
  keywords?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  columns: Column[];
  tasks: Task[];
  archivedCount: number;
  onClose: () => void;
  onNewTask: (columnId: string) => void;
  onOpenTask: (task: Task) => void;
  onAddList: () => void;
  onOpenPanel: (p: 'filters' | 'archive' | 'settings' | 'journal') => void;
  onToggleTheme: () => void;
  onExport: () => void;
  onJumpToColumn: (columnId: string) => void;
}

/** Cap only the unbounded group; actions and lists are short by nature. */
const TASK_RESULT_CAP = 8;

/** Subsequence match so "flk" finds "Fix flaky e2e login test". */
function fuzzy(needle: string, haystack: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(n)) return true;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i += 1;
    if (i === n.length) return true;
  }
  return false;
}

export default function CommandPalette(props: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const firstColumn = props.columns[0]?.id ?? '';
    const base: Command[] = [
      {
        id: 'new',
        label: 'New task',
        group: 'Actions',
        icon: 'plus',
        hint: 'N',
        run: () => props.onNewTask(firstColumn),
      },
      { id: 'add-list', label: 'Add list', group: 'Actions', icon: 'plus', run: props.onAddList },
      {
        id: 'journal',
        label: 'Open journal',
        group: 'Actions',
        icon: 'journal',
        hint: 'J',
        run: () => props.onOpenPanel('journal'),
      },
      {
        id: 'filters',
        label: 'Open filters',
        group: 'Actions',
        icon: 'filter',
        run: () => props.onOpenPanel('filters'),
      },
      {
        id: 'archive',
        label: `Open archive${props.archivedCount ? ` (${props.archivedCount})` : ''}`,
        group: 'Actions',
        icon: 'archive',
        run: () => props.onOpenPanel('archive'),
      },
      {
        id: 'settings',
        label: 'Open settings',
        group: 'Actions',
        icon: 'settings',
        run: () => props.onOpenPanel('settings'),
      },
      {
        id: 'theme',
        label: 'Toggle theme',
        group: 'Actions',
        icon: 'moon',
        run: props.onToggleTheme,
      },
      { id: 'export', label: 'Export backup', group: 'Actions', icon: 'download', run: props.onExport },
    ];

    const listCommands: Command[] = props.columns.map((c, i) => ({
      id: `col-${c.id}`,
      label: `Go to ${c.title}`,
      group: 'Lists',
      icon: 'columns',
      hint: i < 9 ? String(i + 1) : undefined,
      run: () => props.onJumpToColumn(c.id),
    }));

    const taskCommands: Command[] = props.tasks
      .filter((t) => !t.archived)
      .map((t) => ({
        id: `task-${t.id}`,
        label: t.title,
        group: 'Tasks',
        icon: 'note' as IconName,
        keywords: `${t.tags.join(' ')} ${t.description}`,
        run: () => props.onOpenTask(t),
      }));

    return [...base, ...listCommands, ...taskCommands];
  }, [props]);

  const results = useMemo(() => {
    const q = query.trim();
    const matched = commands.filter((c) => fuzzy(q, `${c.label} ${c.group} ${c.keywords ?? ''}`));

    // Empty query: lead with the actions people actually reach for.
    const order = ['Actions', 'Lists', 'Tasks'];
    const groups = new Map<string, Command[]>();
    let tasksShown = 0;
    for (const c of matched) {
      if (c.group === 'Tasks') {
        if (tasksShown >= TASK_RESULT_CAP) continue;
        tasksShown += 1;
      }
      const list = groups.get(c.group) ?? [];
      list.push(c);
      groups.set(c.group, list);
    }
    return order
      .filter((g) => groups.has(g))
      .map((g) => ({ group: g, items: groups.get(g) as Command[] }));
  }, [commands, query]);

  const flat = useMemo(() => results.flatMap((g) => g.items), [results]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!props.open) {
      setQuery('');
      setActive(0);
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, props.open]);

  if (!props.open) return null;

  function choose(index: number) {
    const cmd = flat[index];
    if (!cmd) return;
    props.onClose();
    cmd.run();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/30" onClick={props.onClose} data-testid="palette-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
        className="kb-pop-in relative flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-[10px] border kb-border bg-[var(--kb-card)] shadow-[var(--kb-shadow-lg)]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b kb-border px-3 py-2.5">
          <span className="text-kb-faint">
            <Icon name="search" size={15} />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(active);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                props.onClose();
              }
            }}
            placeholder="Search tasks or run a command…"
            aria-label="Search tasks or run a command"
            data-testid="palette-input"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-kb-faint"
          />
          <kbd className="kb-kbd">Esc</kbd>
        </div>

        <div ref={listRef} className="kb-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
          {flat.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-kb-faint" data-testid="palette-empty">
              No matches for “{query.trim()}”.
            </p>
          ) : (
            results.map((g) => (
              <div key={g.group} className="mb-1 last:mb-0">
                <p className="font-mono-kb px-1.5 pb-1 pt-1.5 text-[9.5px] font-medium uppercase tracking-[0.09em] text-kb-faint">
                  {g.group}
                </p>
                {g.items.map((c) => {
                  const index = flat.indexOf(c);
                  return (
                    <button
                      key={c.id}
                      data-index={index}
                      data-testid="palette-item"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(index)}
                      className={`flex w-full items-center gap-2.5 rounded-[6px] px-1.5 py-1.5 text-left text-[13px] transition-colors duration-75 ${
                        index === active
                          ? 'kb-accent-soft text-kb-text'
                          : 'text-kb-muted hover:bg-[var(--kb-sunken)]'
                      }`}
                    >
                      <span className={index === active ? 'kb-accent' : 'text-kb-faint'}>
                        <Icon name={c.icon} size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {c.hint && <kbd className="kb-kbd">{c.hint}</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t kb-border px-3 py-1.5 text-[10.5px] text-kb-faint">
          <span className="flex items-center gap-1">
            <kbd className="kb-kbd">↑</kbd>
            <kbd className="kb-kbd">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kb-kbd">↵</kbd> run
          </span>
          <span className="ml-auto font-mono-kb">
            {flat.length} {flat.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
}
