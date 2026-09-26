import { useEffect, useState } from 'react';
import Icon from './Icon';
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
      <div
        className="absolute inset-0 bg-black/30"
        onClick={props.onClose}
        data-testid="editor-scrim"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={props.task ? 'Edit task' : 'New task'}
        data-testid="task-editor"
        className="kb-pop-in absolute right-0 top-0 flex h-full w-full max-w-[30rem] flex-col border-l kb-border bg-[var(--kb-card)] shadow-[var(--kb-shadow-lg)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b kb-border px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-kb-muted">
            {props.task ? 'Edit task' : 'New task'}
          </h2>
          <button
            onClick={props.onClose}
            aria-label="Close editor"
            data-testid="editor-close"
            className="grid h-6 w-6 place-items-center rounded-[5px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="kb-scroll min-h-0 flex-1 overflow-y-auto p-4">

        <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
          Title
        </label>
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
          }}
          placeholder="What needs doing?"
          aria-label="Title"
          data-testid="editor-title"
          className="kb-input"
        />

        <label className="mb-1 mt-3.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
          Details
        </label>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={4}
          placeholder="Notes, links, context…"
          aria-label="Details"
          data-testid="editor-details"
          className="kb-input resize-y leading-relaxed"
        />

        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
              Priority
            </label>
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
              aria-label="Priority"
              data-testid="editor-priority"
              className="kb-input h-[34px]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
              Due date
            </label>
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              aria-label="Due date"
              data-testid="editor-due"
              className="kb-input font-mono-kb"
            />
          </div>
        </div>

        <label className="mb-1 mt-3.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
          Tags
        </label>
        <input
          value={draft.tags}
          onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          placeholder="home, urgent"
          aria-label="Tags"
          data-testid="editor-tags"
          className="kb-input"
        />
        <p className="mt-1 text-[11px] text-kb-faint">Comma separated, up to 8.</p>

        <label className="mb-1 mt-3.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
          List
        </label>
        <select
          value={draft.columnId}
          onChange={(e) => setDraft({ ...draft, columnId: e.target.value })}
          aria-label="List"
          data-testid="editor-column"
          className="kb-input h-[34px]"
        >
          {props.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        <div className="mt-5 flex gap-2">
          <button
            onClick={save}
            disabled={!draft.title.trim()}
            data-testid="editor-save"
            className="kb-btn kb-btn-primary h-8 flex-1"
          >
            Save
            <kbd className="kb-kbd ml-0.5 border-white/25 bg-transparent text-white/70">⌃↵</kbd>
          </button>
          <button onClick={props.onClose} data-testid="editor-cancel" className="kb-btn h-8">
            Cancel
          </button>
        </div>

        {props.task && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => props.onArchive(props.task!.id, !props.task!.archived)}
              data-testid="editor-archive"
              className="kb-btn h-8 flex-1"
            >
              <Icon name="archive" size={14} />
              {props.task.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              onClick={() => props.onDelete(props.task!.id)}
              data-testid="editor-delete"
              className="kb-btn kb-btn-danger h-8 flex-1"
            >
              <Icon name="trash" size={14} />
              Delete
            </button>
          </div>
        )}
        </div>
      </aside>
    </div>
  );
}
