import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from './Icon';
import { dueMeta } from '../lib/format';
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

interface Props {
  task: Task;
  entryCount: number;
  onOpen: (t: Task) => void;
}

export default function TaskCard({ task, entryCount, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    // `type` lets the board tell a card drag from a list drag in one DndContext.
    data: { type: 'card', columnId: task.columnId },
  });

  const due = dueMeta(task.dueDate);
  const tags = task.tags.slice(0, 2);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      data-testid="task-card"
      data-task-id={task.id}
      className={`group relative cursor-grab overflow-hidden rounded-[7px] border bg-[var(--kb-card)] pl-2.5 pr-2.5 py-2 transition-[border-color,box-shadow,opacity] duration-100 active:cursor-grabbing ${
        isDragging
          ? 'border-[var(--kb-accent)] opacity-70'
          : 'kb-border hover:border-[var(--kb-border-strong)] hover:shadow-[var(--kb-shadow-md)]'
      }`}
    >
      {/* priority rail: colour + shape both encode urgency, not colour alone */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: PRIO_VAR[task.priority] }}
      />

      <div className="flex items-center gap-1.5">
        <span
          className="font-mono-kb text-[10px] font-medium uppercase tracking-[0.07em]"
          style={{ color: PRIO_VAR[task.priority] }}
          title={`${PRIO_LABEL[task.priority]} priority`}
        >
          {PRIO_LABEL[task.priority]}
        </span>
        {tags.map((t) => (
          <span key={t} className="kb-chip kb-sunken border-transparent">
            {t}
          </span>
        ))}
        {task.tags.length > tags.length && (
          <span className="font-mono-kb text-[10px] kb-faint">+{task.tags.length - tags.length}</span>
        )}
      </div>

      <p className="mt-1 text-[13.5px] font-medium leading-[1.35] clamp-2">{task.title}</p>

      <div className="mt-1.5 flex items-center gap-2">
        {due.tone !== 'none' && (
          <span
            title={due.title}
            className="inline-flex items-center gap-1 font-mono-kb text-[10.5px] leading-none"
            style={{
              color:
                due.tone === 'overdue'
                  ? 'var(--kb-danger)'
                  : due.tone === 'today'
                    ? 'var(--kb-warn)'
                    : 'var(--kb-faint)',
            }}
          >
            <Icon name="calendar" size={11} strokeWidth={2} />
            {due.label}
          </span>
        )}
        {task.description && (
          <span title="Has details" className="text-kb-faint">
            <Icon name="note" size={11} strokeWidth={2} />
          </span>
        )}
        {entryCount > 0 && (
          <span
            title={`${entryCount} journal ${entryCount === 1 ? 'entry' : 'entries'}`}
            data-testid="entry-count"
            className="inline-flex items-center gap-0.5 font-mono-kb text-[10.5px] leading-none text-kb-faint"
          >
            <Icon name="clock" size={11} strokeWidth={2} />
            {entryCount}
          </span>
        )}
      </div>
    </div>
  );
}
