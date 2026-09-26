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

const EVENT_TONE: Record<EventType, string> = {
  created: 'var(--kb-ok)',
  updated: 'var(--kb-muted)',
  moved: 'var(--kb-accent)',
  archived: 'var(--kb-warn)',
  unarchived: 'var(--kb-muted)',
  note: 'var(--kb-accent)',
  deleted: 'var(--kb-danger)',
};

/** Newest first is the server order; the timeline reads oldest → newest. */
export function chronological(events: JournalEvent[]): JournalEvent[] {
  return [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

interface DayGroup {
  day: string;
  items: JournalEvent[];
}

/** Group by calendar day, keeping chronological order within a day. */
export function groupByDay(events: JournalEvent[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const e of events) {
    const day = dayLabel(e.createdAt);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(e);
    else out.push({ day, items: [e] });
  }
  return out;
}

export function TimelineRow({ event }: { event: JournalEvent }) {
  const isNote = event.type === 'note';
  return (
    <li
      className="relative flex gap-2.5 pb-3 pl-5 last:pb-0"
      data-testid="timeline-row"
      data-type={event.type}
    >
      <span
        className="absolute left-0 top-0 grid h-5 w-5 place-items-center rounded-full border"
        style={{
          borderColor: 'var(--kb-border)',
          background: 'var(--kb-card)',
          color: EVENT_TONE[event.type],
        }}
      >
        <Icon name={EVENT_ICON[event.type]} size={11} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[12.5px] leading-snug ${isNote ? 'whitespace-pre-wrap' : 'text-kb-muted'}`}
        >
          {isNote ? event.detail || event.summary : event.summary}
        </p>
        <time
          dateTime={event.createdAt}
          title={absTime(event.createdAt)}
          className="font-mono-kb mt-0.5 block text-[10.5px] text-kb-faint"
        >
          {relTime(event.createdAt)}
        </time>
      </div>
    </li>
  );
}

/** Continuous vertical rail + dots, grouped by day. */
export function Timeline({
  events,
  emptyLabel,
}: {
  events: JournalEvent[];
  emptyLabel: string;
}) {
  const groups = useMemo(() => groupByDay(chronological(events)), [events]);

  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-[12.5px] text-kb-faint" data-testid="timeline-empty">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol className="relative" data-testid="timeline">
      {/* one rail behind every row, not one per row, so it reads as a thread */}
      <span aria-hidden className="absolute bottom-2 left-2.5 top-2 w-px bg-[var(--kb-border)]" />
      {groups.map((g) => (
        <li key={g.day} className="relative">
          <p className="font-mono-kb relative z-10 mb-1.5 mt-2 w-fit bg-[var(--kb-card)] py-px pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-kb-faint first:mt-0">
            {g.day}
          </p>
          <ol>
            {g.items.map((e) => (
              <TimelineRow key={e.id} event={e} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

/** Quick note composer. Enter submits, Shift+Enter adds a line. */
export function NoteComposer({
  onSubmit,
  busy,
  placeholder = 'What happened? Log it…',
  testId = 'note-input',
}: {
  onSubmit: (note: string) => void;
  busy?: boolean;
  placeholder?: string;
  testId?: string;
}) {
  const [value, setValue] = useState('');

  function send() {
    const note = value.trim();
    if (!note || busy) return;
    onSubmit(note);
    setValue('');
  }

  return (
    <div className="kb-panel-inset p-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={2}
        placeholder={placeholder}
        aria-label="Journal note"
        data-testid={testId}
        className="w-full resize-none bg-transparent text-[12.5px] leading-relaxed outline-none placeholder:text-kb-faint"
      />
      <div className="mt-1 flex items-center gap-1.5">
        <button
          onClick={send}
          disabled={!value.trim() || busy}
          data-testid="note-submit"
          className="kb-btn kb-btn-primary h-6 px-2 text-[11.5px]"
        >
          <Icon name="plus" size={12} strokeWidth={2.25} />
          {busy ? 'Logging…' : 'Log entry'}
        </button>
        <span className="ml-auto text-[10.5px] text-kb-faint">
          <kbd className="kb-kbd">↵</kbd> to log
        </span>
      </div>
    </div>
  );
}
