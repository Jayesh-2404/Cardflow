import { useEffect, useState } from 'react';
import type { Column, Priority, Task } from '../types';

export interface EditorDraft {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  tags: string;
  columnId: string;
}

interface Props {
  task: Task | null; // null = new task
  columns: Column[];
  initialColumnId: string;
  onClose: () => void;
  onSave: (draft: EditorDraft, taskId: string | null) => void;
  onDelete: (taskId: string) => void;
  onArchive: (taskId: string, archived: boolean) => void;
}

export function draftFromTask(t: Task): EditorDraft {
  return {
    title: t.title,
    description: t.description,
    priority: t.priority,
    dueDate: t.dueDate ?? '',
    tags: t.tags.join(', '),
    columnId: t.columnId,
  };
}

export function emptyDraft(columnId: string): EditorDraft {
  return { title: '', description: '', priority: 'medium', dueDate: '', tags: '', columnId };
}

export default function TaskEditor(props: Props) {
  const [draft, setDraft] = useState<EditorDraft>(
    props.task ? draftFromTask(props.task) : emptyDraft(props.initialColumnId),
  );

  useEffect(() => {
    if (props.task) setDraft(draftFromTask(props.task));
    else setDraft(emptyDraft(props.initialColumnId));
  }, [props.task, props.initialColumnId]);

  function save() {
    if (!draft.title.trim()) return;
    props.onSave(draft, props.task ? props.task.id : null);
  }

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/25" onClick={props.onClose} />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md kb-card border-l kb-border p-5 overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{props.task ? 'Edit task' : 'New task'}</h2>
          <button onClick={props.onClose} className="kb-muted hover:kb-text text-lg">
            ✕
          </button>
        </div>

        <label className="block text-xs kb-muted uppercase tracking-wide mb-1">Title</label>
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
          }}
          placeholder="What needs doing?"
          className="w-full rounded-lg border kb-border kb-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="block text-xs kb-muted uppercase tracking-wide mt-4 mb-1">Details</label>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={4}
          placeholder="Notes, links, context…"
          className="w-full rounded-lg border kb-border kb-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label className="block text-xs kb-muted uppercase tracking-wide mb-1">Priority</label>
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
              className="w-full rounded-lg border kb-border kb-bg px-2.5 py-2 text-sm outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="block text-xs kb-muted uppercase tracking-wide mb-1">Due date</label>
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              className="w-full rounded-lg border kb-border kb-bg px-2.5 py-1.5 text-sm outline-none font-mono-kb"
            />
          </div>
        </div>

        <label className="block text-xs kb-muted uppercase tracking-wide mt-4 mb-1">
          Tags (comma separated)
        </label>
        <input
          value={draft.tags}
          onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
          placeholder="home, urgent"
          className="w-full rounded-lg border kb-border kb-bg px-3 py-2 text-sm outline-none"
        />

        <label className="block text-xs kb-muted uppercase tracking-wide mt-4 mb-1">Column</label>
        <select
          value={draft.columnId}
          onChange={(e) => setDraft({ ...draft, columnId: e.target.value })}
          className="w-full rounded-lg border kb-border kb-bg px-2.5 py-2 text-sm outline-none"
        >
          {props.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        <div className="flex gap-2 mt-6">
          <button
            onClick={save}
            disabled={!draft.title.trim()}
            className="flex-1 rounded-lg kb-accent-bg text-white py-2 text-sm font-medium disabled:opacity-40"
          >
            Save <span className="opacity-70 text-xs font-mono-kb">⌃↵</span>
          </button>
          <button
            onClick={props.onClose}
            className="px-4 rounded-lg border kb-border text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>

        {props.task && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => props.onArchive(props.task!.id, !props.task!.archived)}
              className="flex-1 rounded-lg border kb-border py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              {props.task.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              onClick={() => props.onDelete(props.task!.id)}
              className="flex-1 rounded-lg border border-red-300 text-red-500 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950"
            >
              Delete
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
