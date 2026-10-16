import type { Task } from '../types';

/**
 * Where a card sits: its list, plus its index inside that list.
 *
 * Board order is list-scoped, so a slot is not a position in the flat task
 * array. The flat array stays grouped by list; only the index matters, and it
 * is the index the move API takes.
 */
export interface Slot {
  columnId: string;
  index: number;
}

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TrayBox extends Rect {
  columnId: string;
}

export interface CardBox extends Rect {
  id: string;
  columnId: string;
}

export interface Point {
  x: number;
  y: number;
}

const centreY = (b: Rect) => (b.top + b.bottom) / 2;

/** Horizontal distance from `x` to the nearest edge of `box`; 0 when inside. */
function xGap(x: number, box: Rect): number {
  if (x < box.left) return box.left - x;
  if (x > box.right) return x - box.right;
  return 0;
}

/**
 * The list whose tray owns a probe x. A probe whose x sits in the gap between
 * two trays takes the nearer one, so dragging straight down the middle of that
 * gap never leaves the board without a target.
 */
export function pickTray(x: number, trays: TrayBox[]): TrayBox | null {
  let best: TrayBox | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const tray of trays) {
    const gap = xGap(x, tray);
    if (gap === 0) return tray;
    if (gap < bestGap) {
      bestGap = gap;
      best = tray;
    }
  }
  return best;
}

/**
 * The index a dropped card takes in a list.
 *
 * The index is the number of cards whose centre sits above the probe, which is
 * the gap the probe's centre has fallen into. `dragId` is skipped so the index
 * is the index the card will have once it has left its old position: while
 * dragging, the card is already drawn in its target slot, and the count has to
 * agree with what is on screen.
 */
export function indexInTray(y: number, cards: CardBox[], dragId: string): number {
  let index = 0;
  for (const card of cards) {
    if (card.id === dragId) continue;
    if (centreY(card) < y) index += 1;
  }
  return index;
}

/**
 * The render list while a card is in flight: the card moved to `slot`, the rest
 * pushed aside.
 *
 * `slot.index` counts the *visible* cards, because that is what the user picks
 * against, while the array itself holds every card. The card is inserted before
 * the visible card that will sit below it, so a filtered board and an unfiltered
 * one agree on where it lands, and the position the move API is given is the
 * one this list shows. Pure, so the board keeps `board.tasks` as the committed
 * truth and throws the result away on cancel.
 */
export function applySlot(
  tasks: Task[],
  dragId: string,
  slot: Slot | null,
  isVisible: (t: Task) => boolean,
): Task[] {
  if (!slot) return tasks;
  const moving = tasks.find((t) => t.id === dragId);
  if (!moving) return tasks;

  const rest = tasks.filter((t) => t.id !== dragId);
  const below = rest.filter((t) => t.columnId === slot.columnId && isVisible(t))[slot.index];

  let insertAt = rest.length;
  if (below) {
    insertAt = rest.findIndex((t) => t.id === below.id);
  } else {
    // Past the last visible card: the end of the list's real order, so the card
    // still lands at the bottom of the list rather than behind a hidden card.
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i].columnId === slot.columnId) {
        insertAt = i + 1;
        break;
      }
    }
  }

  return [...rest.slice(0, insertAt), { ...moving, columnId: slot.columnId }, ...rest.slice(insertAt)];
}

/** The position of the dragged card in its list in the order `tasks` gives. */
export function positionOf(tasks: Task[], dragId: string): number {
  const moving = tasks.find((t) => t.id === dragId);
  if (!moving) return -1;
  return tasks.filter((t) => t.columnId === moving.columnId).findIndex((t) => t.id === dragId);
}

/** True when two orders hold the same cards in the same sequence. */
export function sameOrder(a: Task[], b: Task[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t.id === b[i].id) && a.every((t, i) => t.columnId === b[i].columnId);
}

/** Move a slot one step within its list, clamped to that list's bounds. */
export function stepSlotWithinColumn(
  slot: Slot,
  delta: number,
  visible: Task[],
  dragId: string,
): Slot {
  const count = visible.filter((t) => t.columnId === slot.columnId && t.id !== dragId).length;
  return { ...slot, index: Math.max(0, Math.min(slot.index + delta, count)) };
}

/**
 * Move a slot sideways to the neighbouring list, keeping the depth as close as
 * that list allows.
 */
export function stepSlotToNeighbourColumn(
  slot: Slot,
  delta: number,
  columns: { id: string }[],
  visible: Task[],
  dragId: string,
): Slot {
  const from = columns.findIndex((c) => c.id === slot.columnId);
  if (from < 0) return slot;
  const to = from + delta;
  if (to < 0 || to >= columns.length) return slot;
  const columnId = columns[to].id;
  const count = visible.filter((t) => t.columnId === columnId && t.id !== dragId).length;
  return { columnId, index: Math.min(slot.index, count) };
}
