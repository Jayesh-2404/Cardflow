import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import type { Column, Task } from '../types';
import TaskCard from './TaskCard';

interface Props {
  column: Column;
  tasks: Task[];
  wide?: boolean;
  onOpenTask: (t: Task) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onRename: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
}

export default function BoardColumn(props: Props) {
  const { column, tasks } = props;
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(column.title);

  function submitQuickAdd() {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      setDraft('');
      return;
    }
    props.onQuickAdd(column.id, title);
    setDraft('');
    setAdding(false);
  }

  return (
    <section
      className={`${props.wide ? 'w-full' : 'w-[80vw] max-w-72 snap-start'} shrink-0 rounded-xl border kb-border kb-bg flex flex-col max-h-full ${
        isOver ? 'ring-2 ring-indigo-500' : ''
      }`}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        {renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={() => {
              const t = renameDraft.trim();
              if (t) props.onRename(column.id, t);
              else setRenameDraft(column.title);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setRenameDraft(column.title);
                setRenaming(false);
              }
            }}
            className="flex-1 min-w-0 rounded-md border kb-border kb-card px-2 py-1 text-sm font-medium outline-none"
          />
        ) : (
          <h2
            className="flex-1 min-w-0 truncate text-sm font-semibold uppercase tracking-wide cursor-text"
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            {column.title}{' '}
            <span className="kb-muted font-mono-kb font-normal ml-1">{tasks.length}</span>
          </h2>
        )}
        <button
          title="Rename column"
          onClick={() => setRenaming(true)}
          className="kb-muted hover:kb-text text-sm px-1"
        >
          ✎
        </button>
        <button
          title="Delete column (tasks move to first column)"
          onClick={() => props.onDelete(column.id)}
          className="kb-muted hover:text-red-500 text-sm px-1"
        >
          🗑
        </button>
      </header>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto kb-scroll px-2 pb-2 space-y-2 min-h-10">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onOpen={props.onOpenTask} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="text-xs kb-muted text-center py-4">Drop tasks here</p>
        )}
      </div>

      <footer className="p-2">
        {adding ? (
          <div className="kb-card border kb-border rounded-lg p-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitQuickAdd();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setDraft('');
                }
              }}
              placeholder="Task title + Enter"
              className="w-full text-sm outline-none bg-transparent"
            />
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={submitQuickAdd}
                className="px-2.5 py-1 rounded-md kb-accent-bg text-white text-xs font-medium"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setDraft('');
                }}
                className="px-2.5 py-1 rounded-md text-xs kb-muted hover:kb-text"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-left px-2 py-1.5 rounded-lg text-sm kb-muted hover:kb-text hover:bg-black/5 dark:hover:bg-white/10"
          >
            + Add card
          </button>
        )}
      </footer>
    </section>
  );
}
