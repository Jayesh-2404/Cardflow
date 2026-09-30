import { useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Icon from './Icon';
import type { Column, Task } from '../types';
import TaskCard from './TaskCard';

/** Body droppables need an id distinct from the column's own sortable id. */
export const bodyDroppableId = (columnId: string) => `col-body-${columnId}`;

export interface ColumnDropHint {
  side: 'left' | 'right';
}

interface Props {
  column: Column;
  tasks: Task[];
  entryCounts: Record<string, number>;
  wide?: boolean;
  reorderable?: boolean;
  dragHint?: ColumnDropHint | null;
  onOpenTask: (t: Task) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onRename: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
}

export default function BoardColumn(props: Props) {
  const { column, tasks } = props;

  // The list itself is sortable so it can be dragged horizontally. Listeners
  // are attached only to the header grip, never the whole column, so dragging
  // a card inside it can never be mistaken for dragging the list.
  const {
    attributes: gripAttributes,
    listeners: gripListeners,
    setNodeRef: setColumnRef,
    transform: columnTransform,
    transition: columnTransition,
    isDragging: columnDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' },
    disabled: !props.reorderable,
  });

  const { setNodeRef: setBodyRef, isOver } = useDroppable({
    id: bodyDroppableId(column.id),
    data: { type: 'column-body', columnId: column.id },
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(column.title);

  function submitQuickAdd() {
    const title = draft.trim();
    if (title) props.onQuickAdd(column.id, title);
    setDraft('');
    setAdding(false);
  }

  const iconBtn =
    'grid h-6 w-6 place-items-center rounded-[5px] text-kb-faint transition-colors duration-100';

  return (
    <section
      ref={setColumnRef}
      style={{ transform: CSS.Translate.toString(columnTransform), transition: columnTransition }}
      aria-label={column.title}
      data-testid="board-column"
      data-column-id={column.id}
      className={`relative flex max-h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-[10px] border transition-[border-color,box-shadow] duration-100 ${
        props.wide ? 'w-full' : 'w-[19rem]'
      } ${
        columnDragging
          ? 'z-10 border-[var(--kb-accent)] opacity-90 shadow-[var(--kb-shadow-lg)]'
          : isOver
            ? 'border-[var(--kb-accent)] shadow-[var(--kb-shadow-md)]'
            : 'kb-border'
      }`}
    >
      {props.dragHint && (
        <span
          aria-hidden
          data-testid="column-drop-hint"
          className="pointer-events-none absolute inset-y-2 z-20 w-[3px] rounded-full bg-[var(--kb-accent)]"
          style={props.dragHint.side === 'left' ? { left: 2 } : { right: 2 }}
        />
      )}

      <header className="flex shrink-0 items-center gap-1 border-b kb-border px-2 py-1.5">
        {props.reorderable && (
          <button
            {...gripAttributes}
            {...gripListeners}
            aria-label={`Reorder list ${column.title}`}
            title="Drag to reorder this list"
            data-testid="column-grip"
            className={`${iconBtn} -ml-0.5 cursor-grab touch-none active:cursor-grabbing hover:bg-[var(--kb-sunken)] hover:text-kb-text`}
          >
            <Icon name="grip" size={14} strokeWidth={2.5} />
          </button>
        )}

        {renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={() => {
              const t = renameDraft.trim();
              if (t && t !== column.title) props.onRename(column.id, t);
              else setRenameDraft(column.title);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setRenameDraft(column.title);
                setRenaming(false);
              }
            }}
            aria-label={`Rename list ${column.title}`}
            className="kb-input h-7 min-w-0 flex-1 font-medium"
          />
        ) : (
          <h2
            className="flex min-w-0 flex-1 cursor-text items-baseline gap-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-kb-muted"
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            <span className="truncate">{column.title}</span>
            <span className="font-mono-kb text-[10.5px] font-normal text-kb-faint">
              {tasks.length}
            </span>
          </h2>
        )}

        <button
          title="Rename list"
          aria-label={`Rename ${column.title}`}
          onClick={() => setRenaming(true)}
          className={`${iconBtn} hover:bg-[var(--kb-sunken)] hover:text-kb-text`}
        >
          <Icon name="pencil" size={13} />
        </button>
        <button
          title="Delete list (cards move to the first list)"
          aria-label={`Delete ${column.title}`}
          onClick={() => props.onDelete(column.id)}
          className={`${iconBtn} hover:bg-[var(--kb-danger-soft)] hover:text-kb-danger`}
        >
          <Icon name="trash" size={13} />
        </button>
      </header>

      <div ref={setBodyRef} className="kb-scroll min-h-10 flex-1 space-y-1.5 overflow-y-auto p-1.5">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              entryCount={props.entryCounts[t.id] ?? 0}
              onOpen={props.onOpenTask}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
            <span className="text-kb-faint">
              <Icon name="inbox" size={18} strokeWidth={1.5} />
            </span>
            <p className="text-[11.5px] leading-snug text-kb-faint">Empty — drop a card here</p>
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t kb-border p-1.5">
        {adding ? (
          <div className="kb-panel-inset p-1.5">
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
              placeholder="Card title, then Enter"
              aria-label="New card title"
              data-testid="quick-add-input"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-kb-faint"
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                onClick={submitQuickAdd}
                data-testid="quick-add-submit"
                className="kb-btn kb-btn-primary h-6 px-2 text-[11.5px]"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setDraft('');
                }}
                className="kb-btn kb-btn-ghost h-6 px-2 text-[11.5px]"
              >
                Cancel
              </button>
              <kbd className="kb-kbd ml-auto">↵</kbd>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            data-testid="quick-add"
            className="flex w-full items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-left text-[12.5px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
          >
            <Icon name="plus" size={14} />
            Add card
          </button>
        )}
      </footer>
    </section>
  );
}
