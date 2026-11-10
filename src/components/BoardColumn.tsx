import { useEffect, useRef, useState } from 'react';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'motion/react';
import Icon from './Icon';
import RollingCount from './RollingCount';
import TaskCard, { type CardDragState } from './TaskCard';
import type { Column, Task } from '../types';

/** Tray elements carry this so the board can read their rects while dragging. */
export const traySelector = '[data-tray-id]';

/**
 * Cards supply their own positions, so dnd-kit must not also translate them.
 * With no transform from the strategy, the rendered DOM order is the only
 * thing that moves a neighbour, and motion's layout spring animates it.
 */
const noSortTransform = () => null;

export interface ColumnDropHint {
  side: 'left' | 'right';
}

interface Props {
  column: Column;
  tasks: Task[];
  entryCounts: Record<string, number>;
  reorderable?: boolean;
  dragHint?: ColumnDropHint | null;
  /** The card in flight will land in this list. */
  armed?: boolean;
  /** The card in flight, and how the board is drawing it. */
  drag?: { taskId: string; state: CardDragState } | null;
  onOpenTask: (t: Task) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onRename: (columnId: string, title: string) => void;
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

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(column.title);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  function submitQuickAdd() {
    const title = draft.trim();
    if (title) props.onQuickAdd(column.id, title);
    setDraft('');
    setAdding(false);
  }

  const iconBtn =
    'grid h-7 w-7 place-items-center rounded-full text-kb-muted transition-colors duration-150 ease-[var(--kb-ease)] hover:bg-[var(--kb-sunken-strong)] hover:text-kb-text';

  return (
    <section
      ref={setColumnRef}
      style={{
        transform: CSS.Translate.toString(columnTransform),
        transition: columnTransition,
      }}
      aria-label={column.title}
      data-testid="board-column"
      data-column-id={column.id}
      className={`group/col relative flex max-h-full min-h-0 w-[235px] shrink-0 snap-start flex-col sm:w-[343px] ${
        columnDragging ? 'z-10 opacity-90' : ''
      }`}
    >
      {props.dragHint && (
        <span
          aria-hidden
          data-testid="column-drop-hint"
          className="pointer-events-none absolute inset-y-8 z-20 w-[3px] rounded-full bg-[var(--kb-accent)]"
          style={props.dragHint.side === 'left' ? { left: -7 } : { right: -7 }}
        />
      )}

      {/* Header sits above the tray, the way the reference board reads: the
          name and count label the container rather than living inside it. */}
      <header className="flex h-10 shrink-0 items-center gap-1 pl-3 pr-1">
        {props.reorderable && (
          <button
            {...gripAttributes}
            {...gripListeners}
            aria-label={`Reorder list ${column.title}`}
            title="Drag to reorder this list"
            data-testid="column-grip"
            className="-ml-1 grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center text-kb-faint opacity-0 transition-opacity duration-150 ease-[var(--kb-ease)] group-hover/col:opacity-100 hover:text-kb-text focus-visible:opacity-100 active:cursor-grabbing"
          >
            <Icon name="grip" size={14} strokeWidth={2.25} />
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
          <h2 className="flex min-w-0 items-baseline gap-1.5">
            <button
              onClick={() => setRenaming(true)}
              title="Rename list"
              tabIndex={-1}
              aria-hidden
              className="truncate text-left text-[14px] font-medium"
            >
              {column.title}
            </button>
            <RollingCount value={tasks.length} className="text-[14px] text-kb-muted" />
          </h2>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-[var(--kb-ease)] focus-within:opacity-100 group-hover/col:opacity-100">
          <button
            title="Rename list"
            aria-label={`Rename ${column.title}`}
            onClick={() => setRenaming(true)}
            className={iconBtn}
          >
            <Icon name="pencil" size={13} />
          </button>
        </span>

        <button
          title="Add a card to this list"
          aria-label={`Add a card to ${column.title}`}
          onClick={() => setAdding(true)}
          data-testid="quick-add-top"
          className={iconBtn}
        >
          <Icon name="plus" size={15} strokeWidth={2} />
        </button>
      </header>

      {/* `layoutScroll` because the tray scrolls: without it a layout spring
          measures cards against the tray's scrolled position and they land in
          the wrong place by the scroll offset. */}
      <motion.div
        layoutScroll
        data-tray-id={column.id}
        className={`kb-scroll kb-tray mt-0.5 flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto p-2 ${
          props.armed ? 'kb-tray-armed' : ''
        }`}
      >
        {/* Real DOM order is the board order, so opening a slot is a reorder,
            not a translated copy: the cards glide with a layout spring. */}
        <SortableContext items={tasks.map((t) => t.id)} strategy={noSortTransform}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              entryCount={props.entryCounts[t.id] ?? 0}
              columnTitle={column.title}
              onOpen={props.onOpenTask}
              dragState={props.drag?.taskId === t.id ? props.drag.state : 'idle'}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 py-6 text-center">
            <span className="text-kb-faint">
              <Icon name="inbox" size={18} strokeWidth={1.5} />
            </span>
            <p className="text-[12px] leading-snug text-kb-faint">No cards yet</p>
          </div>
        )}

        <div className="pt-0.5">
          {adding ? (
            <div className="kb-border grid gap-2 rounded-[var(--kb-r-lg)] border bg-[var(--kb-card)] p-3 shadow-[var(--kb-shadow-sm)]">
              <input
                ref={addInputRef}
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
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-kb-faint"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitQuickAdd}
                  data-testid="quick-add-submit"
                  className="kb-btn kb-btn-primary h-7 px-2.5 text-[12px]"
                >
                  Add card
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setDraft('');
                  }}
                  className="kb-btn kb-btn-ghost h-7 px-2 text-[12px]"
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
              className="flex h-[34px] w-full items-center gap-1.5 rounded-[var(--kb-r-md)] px-2 text-left text-[14px] text-kb-muted transition-colors duration-150 ease-[var(--kb-ease)] hover:bg-[var(--kb-sunken-strong)] hover:text-kb-text"
            >
              <Icon name="plus" size={15} />
              Add card
            </button>
          )}
        </div>
      </motion.div>
    </section>
  );
}
