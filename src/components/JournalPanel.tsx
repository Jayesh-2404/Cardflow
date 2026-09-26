import { useMemo, useState } from 'react';
import Icon, { type IconName } from './Icon';
import { absTime, dayLabel, relTime } from '../lib/format';
import type { EventType, JournalEvent } from '../lib/api';

const EVENT_ICON: Record<EventType, IconName> = {
  created: 'plus',
  updated: 'pencil',
  moved: 'chevronRight',
  archived: 'archive',
  unarchived: 'undo',
  note: 'note',
  deleted: 'trash',
};

type Filter = 'all' | 'note' | 'moved' | 'updated';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes' },
  { id: 'moved', label: 'Moves' },
  { id: 'updated', label: 'Edits' },
];

function matches(event: JournalEvent, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'note') return event.type === 'note';
  if (filter === 'moved') return event.type === 'moved';
  return event.type === 'updated' || event.type === 'created';
}

interface Props {
  events: JournalEvent[];
  onOpenTask: (taskId: string) => void;
  onRefresh: () => void;
}

/**
 * Cross-task activity feed. Grouped by day so a week of work reads as a
 * diary rather than a wall of rows.
 */
export default function JournalPanel({ events, onOpenTask, onRefresh }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(40);

  const visible = useMemo(() => events.filter((e) => matches(e, filter)), [events, filter]);

  // Feed is newest first, so group on the raw day key rather than the
  // chronological helper the per-task timeline uses.
  const groups = useMemo(() => {
    const out: { day: string; label: string; items: JournalEvent[] }[] = [];
    for (const e of visible.slice(0, limit)) {
      const day = new Date(e.createdAt).toDateString();
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, label: dayLabel(e.createdAt), items: [e] });
    }
    return out;
  }, [visible, limit]);

  const noteCount = useMemo(() => events.filter((e) => e.type === 'note').length, [events]);

  return (
    <div data-testid="journal-panel">
      <div className="mb-2.5 flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            data-testid={`journal-filter-${f.id}`}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-100 ${
              filter === f.id
                ? 'kb-accent-bg border-transparent'
                : 'kb-border text-kb-muted hover:border-[var(--kb-border-strong)]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={onRefresh}
          title="Refresh journal"
          aria-label="Refresh journal"
          data-testid="journal-refresh"
          className="ml-auto grid h-6 w-6 place-items-center rounded-[5px] text-kb-faint transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
        >
          <Icon name="undo" size={13} />
        </button>
      </div>

      <p className="font-mono-kb mb-2.5 text-[10.5px] text-kb-faint">
        {events.length} entries · {noteCount} written by you
      </p>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-kb-faint" data-testid="journal-empty">
          {events.length === 0
            ? 'Nothing journalled yet. Open a card and log your first entry.'
            : 'No entries match this filter.'}
        </p>
      ) : (
        <div data-testid="journal-list">
          {groups.map((g) => (
            <section key={g.day} className="mb-3">
              <h4 className="font-mono-kb sticky top-0 z-10 mb-1 bg-[var(--kb-card)] py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-kb-faint">
                {g.label}
              </h4>
              <ul>
                {g.items.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => onOpenTask(e.taskId)}
                      data-testid="journal-item"
                      className="group flex w-full gap-2 rounded-[6px] px-1.5 py-1.5 text-left transition-colors duration-100 hover:bg-[var(--kb-sunken)]"
                    >
                      <span className="mt-0.5 shrink-0 text-kb-faint">
                        <Icon name={EVENT_ICON[e.type]} size={12} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium leading-snug group-hover:kb-accent">
                          {e.taskTitle}
                        </span>
                        <span
                          className={`block text-[11.5px] leading-snug text-kb-muted ${
                            e.type === 'note' ? '' : 'clamp-1'
                          }`}
                        >
                          {e.summary}
                        </span>
                      </span>
                      <time
                        dateTime={e.createdAt}
                        title={absTime(e.createdAt)}
                        className="font-mono-kb mt-px shrink-0 text-[10px] text-kb-faint"
                      >
                        {relTime(e.createdAt)}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {visible.length > limit && (
            <button
              onClick={() => setLimit((n) => n + 40)}
              data-testid="journal-more"
              className="kb-btn w-full"
            >
              Show {Math.min(40, visible.length - limit)} older entries
            </button>
          )}
        </div>
      )}
    </div>
  );
}
