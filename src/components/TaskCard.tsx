import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../types';

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

const DOT: Record<Task['priority'], string> = {
  low: 'bg-stone-400',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
};

export default function TaskCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const overdue = isOverdue(task.dueDate);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      className={`kb-card border kb-border rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow ${
        isDragging ? 'opacity-60 shadow-md' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${DOT[task.priority]}`} title={task.priority} />
        {task.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="text-[11px] px-1.5 py-px rounded-full bg-black/5 dark:bg-white/10 kb-muted"
          >
            {t}
          </span>
        ))}
        {task.tags.length > 3 && (
          <span className="text-[11px] kb-muted">+{task.tags.length - 3}</span>
        )}
      </div>
      <p className="text-sm leading-snug clamp-2">{task.title}</p>
      <div className="flex items-center justify-between mt-1.5">
        <span
          className={`text-[11px] font-mono-kb ${overdue ? 'text-red-500 font-medium' : 'kb-muted'}`}
        >
          {task.dueDate ?? 'no due'}
        </span>
        {task.description && <span className="text-xs kb-muted">≡</span>}
      </div>
    </div>
  );
}
