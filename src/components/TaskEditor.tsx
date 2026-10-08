import { useEffect, useState, type ReactNode } from 'react';
import Icon from './Icon';
import { NoteComposer, Timeline } from './Timeline';
import type { JournalEvent } from '../lib/api';
import { absTime } from '../lib/format';
import type { AgentState, Column, Priority, Task } from '../types';

export interface EditorDraft {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  tags: string;
  columnId: string;
  projectKey: string;
  gitEnabled: boolean;
  agentState: AgentState;
}

interface Props {
  task: Task | null; // null = new task
  columns: Column[];
  initialColumnId: string;
  events: JournalEvent[];
  notesBusy: boolean;
  onClose: () => void;
  onSave: (draft: EditorDraft, taskId: string | null) => void;
  onDelete: (taskId: string) => void;
  onArchive: (taskId: string, archived: boolean) => void;
  onAddNote: (taskId: string, note: string) => void;
  onDeleteEntry?: (entryId: string) => void;
  onClearTask?: () => void;
}

export function draftFromTask(t: Task): EditorDraft {
  return {
    title: t.title,
    description: t.description,
    priority: t.priority,
    dueDate: t.dueDate ?? '',
    tags: t.tags.join(', '),
    columnId: t.columnId,
    projectKey: t.projectKey ?? '',
    gitEnabled: t.gitEnabled ?? false,
    agentState: t.agentState ?? 'idle',
  };
}

export function emptyDraft(columnId: string): EditorDraft {
  return {
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
    tags: '',
    columnId,
    projectKey: '',
    gitEnabled: false,
    agentState: 'idle',
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-0">
      <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
        {label}
      </label>
      {children}
    </div>
  );
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

  const set = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

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
        className="kb-pop-in absolute right-0 top-0 flex h-full w-full max-w-[32rem] flex-col border-l kb-border bg-[var(--kb-card)] shadow-[var(--kb-shadow-lg)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b kb-border px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-kb-muted">
              {props.task ? 'Edit task' : 'New task'}
            </h2>
            {props.task && (
              <p className="font-mono-kb truncate text-[10.5px] text-kb-faint">
                created {absTime(new Date(props.task.createdAt).toISOString())}
                {props.task.agentState !== 'idle' && ` · ${props.task.agentState}`}
                {props.task.branch && ` · ${props.task.branch}`}
              </p>
            )}
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close editor"
            data-testid="editor-close"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[5px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="kb-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <Field label="Title">
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
              }}
              placeholder="What needs doing?"
              aria-label="Title"
              data-testid="editor-title"
              className="kb-input"
            />
          </Field>

          <Field label="Details">
            <textarea
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Notes, links, context…"
              aria-label="Details"
              data-testid="editor-details"
              className="kb-input resize-y leading-relaxed"
            />
          </Field>

          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
                Priority
              </label>
              <select
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value as Priority)}
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
                onChange={(e) => set('dueDate', e.target.value)}
                aria-label="Due date"
                data-testid="editor-due"
                className="kb-input font-mono-kb"
              />
            </div>
          </div>

          <Field label="Tags">
            <input
              value={draft.tags}
              onChange={(e) => set('tags', e.target.value)}
              onKeyDown={(e) => {
                // Enter saves from anywhere except the note composer.
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
          </Field>

          <Field label="List">
            <select
              value={draft.columnId}
              onChange={(e) => set('columnId', e.target.value)}
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
          </Field>

          <Field label="Status">
            <select
              value={draft.agentState}
              onChange={(e) => set('agentState', e.target.value as AgentState)}
              aria-label="Agent status"
              data-testid="editor-status"
              className="kb-input h-[34px]"
            >
              <option value="idle">Idle</option>
              <option value="running">Running</option>
              <option value="under-review">Under review</option>
              <option value="completed">Completed</option>
            </select>
          </Field>

          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
                Project
              </label>
              <input
                value={draft.projectKey}
                onChange={(e) => set('projectKey', e.target.value.toLowerCase())}
                placeholder="zex"
                aria-label="Project key"
                data-testid="editor-project"
                className="kb-input font-mono-kb"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
                Git
              </label>
              <label className="kb-input flex h-[34px] cursor-pointer items-center justify-between gap-2 text-[12.5px]">
                <span className="text-kb-muted">Isolate in branch</span>
                <input
                  type="checkbox"
                  checked={draft.gitEnabled}
                  onChange={(e) => set('gitEnabled', e.target.checked)}
                  aria-label="Isolate in git branch"
                  data-testid="editor-git"
                />
              </label>
            </div>
          </div>

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

          {props.task && (
            <section className="mt-6 border-t kb-border pt-4" aria-label="Journal">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
                  <Icon name="journal" size={12} />
                  Journal
                </h3>
                <span className="flex items-center gap-2">
                  <span className="font-mono-kb text-[10.5px] text-kb-faint">
                    {props.events.length} {props.events.length === 1 ? 'entry' : 'entries'}
                  </span>
                  {props.onClearTask && props.events.length > 0 && (
                    <button
                      onClick={props.onClearTask}
                      data-testid="editor-clear-history"
                      title="Delete all entries for this task"
                      className="text-[10.5px] text-kb-faint underline-offset-2 hover:text-kb-danger hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </span>
              </div>

              <NoteComposer
                onSubmit={(note) => props.onAddNote(props.task!.id, note)}
                busy={props.notesBusy}
              />

              <div className="mt-3.5">
                <Timeline
                  events={props.events}
                  emptyLabel="No entries yet — log the first one above."
                  onDelete={props.onDeleteEntry}
                />
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
