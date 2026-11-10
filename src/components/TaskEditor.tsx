import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';
import Segmented from './Segmented';
import { NoteComposer, Timeline } from './Timeline';
import { useAutoGrow } from '../lib/autoGrow';
import type { JournalEvent } from '../lib/api';
import { absTime, elapsedLabel, runElapsed, shortId } from '../lib/format';
import type { Column, Priority, Task } from '../types';

export interface EditorDraft {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  tags: string;
  columnId: string;
  projectKey: string;
  gitEnabled: boolean;
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
  onRelease?: (taskId: string) => void;
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
  };
}

const RUN_STATUS_LABEL: Record<string, string> = {
  claimed: 'Claimed',
  running: 'Running',
  review: 'Under review',
  completed: 'Completed',
  failed: 'Failed',
  abandoned: 'Released',
};

/**
 * One line of the property sheet: a fixed 96px label column and the control
 * beside it. The row is 34px tall on its own and grows to the 36px control
 * that sits in it, which is what lines every row up on one rhythm.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[96px_1fr] items-center">
      <dt className="text-[14px] font-medium text-kb-label">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** A titled block below the property sheet: label on the left, meta on the right. */
function Section({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex h-5 items-center justify-between gap-3">
        <h3 className="text-[14px] font-medium text-kb-label">{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * The task drawer: a floating 400px panel over an undimmed board.
 *
 * Reading order copies the reference — id, a title big enough to be the page
 * heading, the list as a segmented control, the property sheet, then the
 * longer-form blocks. Save stays in the footer so it never scrolls away.
 */
export default function TaskEditor(props: Props) {
  const [draft, setDraft] = useState<EditorDraft>(
    props.task ? draftFromTask(props.task) : emptyDraft(props.initialColumnId),
  );
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const run = props.task?.run ?? null;
  const live = run?.status === 'running' || run?.status === 'claimed';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (props.task) setDraft(draftFromTask(props.task));
    else setDraft(emptyDraft(props.initialColumnId));
  }, [props.task, props.initialColumnId]);

  // The title is a textarea so a long name wraps onto more lines, and it grows
  // to fit them rather than scrolling inside its own box.
  useAutoGrow(titleRef, draft.title);

  const columnOptions = useMemo(
    () => props.columns.map((c) => ({ value: c.id, label: c.title })),
    [props.columns],
  );

  function save() {
    if (!draft.title.trim()) return;
    props.onSave(draft, props.task ? props.task.id : null);
  }

  const set = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="fixed inset-0 z-40">
      {/* No dimming behind the drawer — the board stays readable — but the
          scrim still owns the click-away. */}
      <div className="absolute inset-0" onClick={props.onClose} data-testid="editor-scrim" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={props.task ? 'Edit task' : 'New task'}
        data-testid="task-editor"
        className="kb-rise-in absolute inset-y-2 right-2 flex w-[400px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[var(--kb-r-2xl)] bg-[var(--kb-card)] shadow-[var(--kb-shadow-drawer)]"
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="flex h-[30px] items-center justify-between">
            <span
              className="font-mono-kb text-[12px] leading-none text-kb-muted"
              title={
                props.task
                  ? `Created ${absTime(new Date(props.task.createdAt).toISOString())}`
                  : undefined
              }
            >
              {props.task ? shortId(props.task.id) : 'New task'}
            </span>
            <button
              onClick={props.onClose}
              aria-label="Close editor"
              data-testid="editor-close"
              className="kb-focus -mr-1.5 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>

        <div className="kb-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-2 pt-4">
          <textarea
            ref={titleRef}
            rows={1}
            autoFocus
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
            }}
            placeholder="What needs doing?"
            aria-label="Title"
            data-testid="editor-title"
            className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[22px] leading-[1.4] tracking-[-0.03em] text-kb-text outline-none placeholder:text-kb-faint"
          />

          <Segmented
            value={draft.columnId}
            options={columnOptions}
            onChange={(columnId) => set('columnId', columnId)}
            aria-label="List"
            data-testid="editor-column"
          />

          <dl className="grid gap-[2px]">
            <Row label="Priority">
              <select
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value as Priority)}
                aria-label="Priority"
                data-testid="editor-priority"
                className="kb-input kb-input-pill"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Row>

            <Row label="Due date">
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                aria-label="Due date"
                data-testid="editor-due"
                className="kb-input kb-input-pill font-mono-kb"
              />
            </Row>

            <Row label="Tags">
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
                className="kb-input kb-input-pill"
              />
              <p className="mt-1 text-[11.5px] text-kb-faint">Comma separated, up to 8.</p>
            </Row>

            <Row label="Project">
              <input
                value={draft.projectKey}
                onChange={(e) => set('projectKey', e.target.value.toLowerCase())}
                placeholder="zex"
                aria-label="Project key"
                data-testid="editor-project"
                className="kb-input kb-input-pill font-mono-kb"
              />
            </Row>

            {props.task?.branch && !props.task.run && (
              <Row label="Branch">
                <span
                  data-testid="editor-branch"
                  className="font-mono-kb block truncate text-[13px] text-kb-muted"
                >
                  {props.task.branch}
                </span>
              </Row>
            )}

            <Row label="Git">
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-kb-text">
                <input
                  type="checkbox"
                  checked={draft.gitEnabled}
                  onChange={(e) => set('gitEnabled', e.target.checked)}
                  aria-label="Push the branch and open a pull request"
                  data-testid="editor-git"
                  className="h-4 w-4 accent-[var(--kb-accent)]"
                />
                Push + open PR
              </label>
            </Row>
          </dl>

          {run && (
            <Section
              label="Agent"
              aside={
                <span className="text-[13px] text-kb-muted">{RUN_STATUS_LABEL[run.status] ?? run.status}</span>
              }
            >
              <dl className="grid gap-[2px]">
                <Row label="Runner">
                  <span data-testid="editor-run-runner" className="text-[14px]">
                    {run.runner}
                  </span>
                </Row>
                {run.model && (
                  <Row label="Model">
                    <span className="font-mono-kb block truncate text-[13px] text-kb-muted">
                      {run.model}
                    </span>
                  </Row>
                )}
                <Row label="Elapsed">
                  <span data-testid="editor-run-elapsed" className="font-mono-kb text-[13px]">
                    {elapsedLabel(runElapsed(run.startedAt, run.finishedAt, run.elapsedMs, now))}
                  </span>
                </Row>
                <Row label="Started">
                  <span className="text-[13px] text-kb-muted">
                    {absTime(new Date(run.startedAt).toISOString())}
                  </span>
                </Row>
                {run.finishedAt && (
                  <Row label="Finished">
                    <span className="text-[13px] text-kb-muted">
                      {absTime(new Date(run.finishedAt).toISOString())}
                    </span>
                  </Row>
                )}
                {run.branch && (
                  <Row label="Branch">
                    <span className="font-mono-kb block truncate text-[13px] text-kb-muted">
                      {run.branch}
                    </span>
                  </Row>
                )}
                {run.prUrl && (
                  <Row label="PR">
                    <a
                      href={run.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="editor-pr-link"
                      className="kb-accent inline-flex items-center gap-1 text-[13px] hover:underline"
                    >
                      {run.prNumber ? `#${run.prNumber}` : 'Open pull request'}
                      <Icon name="external" size={12} />
                    </a>
                  </Row>
                )}
                {run.error && (
                  <Row label="Error">
                    <span className="text-[13px] text-kb-danger">{run.error}</span>
                  </Row>
                )}
              </dl>
              {live && props.onRelease && (
                <button
                  onClick={() => props.onRelease!(props.task!.id)}
                  data-testid="editor-release"
                  className="kb-btn kb-btn-outline mt-1 h-8 self-start text-[13px]"
                >
                  Release claim
                </button>
              )}
            </Section>
          )}

          <Section label="Description">
            <textarea
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              placeholder="Notes, links, context…"
              aria-label="Details"
              data-testid="editor-details"
              className="kb-input min-h-[85px] resize-y rounded-[var(--kb-r-lg)] p-3 leading-[1.4]"
            />
          </Section>

          {props.task && (
            <Section
              label="Journal"
              aside={
                <span className="flex items-center gap-3 text-[14px] text-kb-muted">
                  {props.events.length} {props.events.length === 1 ? 'entry' : 'entries'}
                  {props.onClearTask && props.events.length > 0 && (
                    <button
                      onClick={props.onClearTask}
                      data-testid="editor-clear-history"
                      title="Delete all entries for this task"
                      className="text-[13px] text-kb-faint underline-offset-2 transition-colors duration-100 hover:text-kb-danger hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </span>
              }
            >
              <NoteComposer
                onSubmit={(note) => props.onAddNote(props.task!.id, note)}
                busy={props.notesBusy}
              />
              <Timeline
                events={props.events}
                emptyLabel="No entries yet — log the first one above."
                onDelete={props.onDeleteEntry}
              />
            </Section>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 px-5 pb-5 pt-2">
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!draft.title.trim()}
              data-testid="editor-save"
              className="kb-btn kb-btn-primary h-9 flex-1"
            >
              Save
              <kbd className="kb-kbd ml-0.5 border-white/25 bg-transparent text-white/70">⌃↵</kbd>
            </button>
            <button onClick={props.onClose} data-testid="editor-cancel" className="kb-btn kb-btn-ghost h-9">
              Cancel
            </button>
          </div>

          {props.task && (
            <div className="flex gap-2">
              <button
                onClick={() => props.onArchive(props.task!.id, !props.task!.archived)}
                data-testid="editor-archive"
                className="kb-btn kb-btn-outline h-9 flex-1"
              >
                <Icon name="archive" size={14} />
                {props.task.archived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                onClick={() => props.onDelete(props.task!.id)}
                data-testid="editor-delete"
                className="kb-btn kb-btn-danger h-9 flex-1"
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
