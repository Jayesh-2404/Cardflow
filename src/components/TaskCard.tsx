import { memo, useCallback, useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { motion, useReducedMotion } from 'motion/react';
import Icon from './Icon';
import { dueMeta, elapsedLabel, runElapsed, shortId } from '../lib/format';
import type { Task } from '../types';

const PRIO_LABEL: Record<Task['priority'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const PRIO_VAR: Record<Task['priority'], string> = {
  low: 'var(--kb-prio-low)',
  medium: 'var(--kb-prio-medium)',
  high: 'var(--kb-prio-high)',
};

/** Chart hues for tags, picked by name so a tag keeps its colour everywhere. */
const TAG_HUES = [255, 25, 200, 150, 320, 60, 285, 185];

function tagHue(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 997;
  return TAG_HUES[h % TAG_HUES.length];
}

/**
 * How the board is drawing this card right now.
 *
 * `placeholder` is a pointer drag: the card itself is being drawn by the drag
 * overlay, so the board keeps this node as the slot it will land in. `lifted`
 * is a keyboard drag: there is no pointer to follow, so the card stays on
 * screen and travels slot to slot. `settling` is the drop spring in flight,
 * which still needs the card out of the way.
 */
export type CardDragState = 'idle' | 'placeholder' | 'lifted' | 'settling';

export function cardLabel(task: Task, columnTitle: string, entryCount: number): string {
  const parts = [`${task.title}, ${shortId(task.id)}`, `in ${columnTitle}`];
  if (task.agentState === 'under-review') parts.push('under review');
  else if (task.agentState === 'running') parts.push('agent running');
  parts.push(`${PRIO_LABEL[task.priority]} priority`);
  if (entryCount > 0) {
    parts.push(`${entryCount} journal ${entryCount === 1 ? 'entry' : 'entries'}`);
  }
  return parts.join(', ');
}

/** The glide a neighbour makes when the slot moves. */
export const CARD_SPRING = { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.9 };

interface SurfaceProps {
  task: Task;
  entryCount: number;
  /** Rendered in the drag overlay: lifted, and no hover affordances. */
  overlay?: boolean;
}

/**
 * The card's visual body, shared by the board copy and the drag overlay so the
 * two can never drift apart.
 */
function CardSurface({ task, entryCount, overlay }: SurfaceProps) {
  const due = dueMeta(task.dueDate);
  const tags = task.tags.slice(0, 2);
  const run = task.run;
  const live = run?.status === 'running' || run?.status === 'claimed';
  const [now, setNow] = useState(() => Date.now());

  // Only a live card needs a clock; finished runs use their stored elapsedMs.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const elapsed = run ? runElapsed(run.startedAt, run.finishedAt, run.elapsedMs, now) : 0;
  const showRun = Boolean(run) && (live || run!.status === 'review');
  const runTitle = run
    ? `${run.runner}${run.model ? ` · ${run.model}` : ''}\n${run.status} · ${elapsedLabel(elapsed)}${
        run.branch ? `\n${run.branch}` : ''
      }`
    : '';

  return (
    <div
      className={`grid gap-2 rounded-[var(--kb-r-lg)] border bg-[var(--kb-card)] p-3 transition-[border-color,box-shadow] duration-150 ease-[var(--kb-ease)] ${
        overlay
          ? 'kb-border shadow-[var(--kb-shadow-lift)]'
          : 'kb-border shadow-[var(--kb-shadow-sm)] group-hover:border-[var(--kb-border-strong)] group-hover:shadow-[var(--kb-shadow-md)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-kb truncate text-[12px] leading-none text-kb-muted">
          {shortId(task.id)}
        </span>
        {tags.length > 0 && (
          <span className="flex shrink-0 items-center gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-[5px] text-[12px] leading-none text-kb-label"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: `oklch(0.62 0.15 ${tagHue(t)})` }}
                />
                {t}
              </span>
            ))}
            {task.tags.length > tags.length && (
              <span className="font-mono-kb text-[11px] leading-none text-kb-faint">
                +{task.tags.length - tags.length}
              </span>
            )}
          </span>
        )}
      </div>

      <p className="clamp-2 text-[14px] font-medium leading-[1.4]">{task.title}</p>

      <div className="flex min-h-[1.05rem] flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-none text-kb-muted">
        <span title={`${PRIO_LABEL[task.priority]} priority`} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: PRIO_VAR[task.priority] }}
          />
          {PRIO_LABEL[task.priority]}
        </span>

        {due.tone !== 'none' && (
          <span
            title={due.title}
            className="flex items-center gap-1.5"
            style={{
              color:
                due.tone === 'overdue'
                  ? 'var(--kb-danger)'
                  : due.tone === 'today'
                    ? 'var(--kb-warn)'
                    : undefined,
            }}
          >
            <Icon name="calendar" size={13} />
            {due.label}
          </span>
        )}

        {task.description && (
          <span title="Has details" className="flex items-center text-kb-faint">
            <Icon name="note" size={13} />
          </span>
        )}

        {entryCount > 0 && (
          <span
            title={`${entryCount} journal ${entryCount === 1 ? 'entry' : 'entries'}`}
            data-testid="entry-count"
            className="flex items-center gap-1.5"
          >
            <Icon name="journal" size={13} />
            {entryCount}
          </span>
        )}

        {showRun && (
          <span
            title={runTitle}
            data-testid="agent-badge"
            className="kb-chip min-w-0 !py-0.5 !text-[11px]"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: live ? 'var(--kb-warn)' : 'var(--kb-accent)',
              }}
            />
            <span className="max-w-[7.5rem] truncate">{run!.runner}</span>
            <span className="shrink-0 opacity-70">{elapsedLabel(elapsed)}</span>
            {run!.prUrl && (
              <a
                href={run!.prUrl}
                target="_blank"
                rel="noreferrer"
                title={run!.prNumber ? `Pull request #${run!.prNumber}` : 'Pull request'}
                data-testid="run-pr-link"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-kb-accent hover:underline"
              >
                <Icon name="external" size={11} />
              </a>
            )}
          </span>
        )}
        {!run && task.agentState === 'under-review' && (
          <span title="Waiting for a human review" className="kb-chip !py-0.5 !text-[11px]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--kb-accent)' }}
            />
            Review
            {task.projectKey && <span className="opacity-70">{task.projectKey}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

export function TaskCardOverlay({ task, entryCount }: { task: Task; entryCount: number }) {
  return <CardSurface task={task} entryCount={entryCount} overlay />;
}

interface Props {
  task: Task;
  entryCount: number;
  columnTitle: string;
  onOpen: (t: Task) => void;
  dragState?: CardDragState;
}

function TaskCard({ task, entryCount, columnTitle, onOpen, dragState = 'idle' }: Props) {
  const reduced = useReducedMotion();
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: task.id,
    // `type` lets the board tell a card drag from a list drag in one DndContext.
    data: { type: 'card', columnId: task.columnId },
  });

  const lifted = dragState === 'lifted';
  // Drawn by the overlay, or by the drop spring that is still travelling: this
  // node is only the slot either way.
  const away = dragState === 'placeholder' || dragState === 'settling';

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // dnd-kit's KeyboardSensor is the activator on this node: Space lifts the
      // card, and Space or Enter drops it. It has to see every key first.
      listeners?.onKeyDown?.(e);

      // While a drag is live, Enter is the drop key and the sensor owns it.
      if (e.key !== 'Enter' || isDragging) return;
      e.preventDefault();
      onOpen(task);
    },
    [isDragging, listeners, onOpen, task],
  );

  return (
    <motion.div
      ref={setNodeRef}
      // Cards open their slot by reordering, so the DOM order is the board order
      // and motion's layout spring is what moves a neighbour. The card that has
      // left the board must not glide: its slot is where the card lands, not a
      // journey, and gliding it would drag the slot outline along with it.
      layout={reduced || away ? false : 'position'}
      transition={CARD_SPRING}
      animate={{ scale: lifted ? 1.02 : 1 }}
      {...attributes}
      {...listeners}
      onKeyDown={handleKeyDown}
      onClick={() => onOpen(task)}
      role="button"
      aria-roledescription="Draggable card"
      aria-label={cardLabel(task, columnTitle, entryCount)}
      data-testid="task-card"
      data-task-id={task.id}
      data-column-id={task.columnId}
      data-drag-state={dragState === 'idle' ? undefined : dragState}
      className={`group relative block w-full cursor-grab rounded-[var(--kb-r-lg)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kb-accent)] ${
        lifted ? 'z-10 cursor-grabbing' : 'active:cursor-grabbing'
      }`}
    >
      {/* The card itself stays mounted so the slot keeps the exact height of the
          card that will land in it, and the drop target never shifts. */}
      <div className={away ? 'invisible' : ''}>
        <CardSurface task={task} entryCount={entryCount} overlay={lifted} />
      </div>
      {away && (
        <span
          aria-hidden
          data-testid="card-slot"
          className="pointer-events-none absolute inset-0 rounded-[var(--kb-r-lg)] border border-dashed border-[var(--kb-border-strong)] bg-[color-mix(in_srgb,var(--kb-card)_55%,transparent)]"
        />
      )}
    </motion.div>
  );
}

/*
  Memoised on purpose: during a drag only the overlay and the cards whose slot
  changed should re-render. The board passes stable callbacks, so a card whose
  props are unchanged is skipped entirely.
*/
export default memo(TaskCard);
