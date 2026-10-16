import type { Task } from '../types';
import { shortId } from './format';

/**
 * Live-region copy for a drag.
 *
 * dnd-kit announces through an `aria-live="assertive"` region, and the board
 * answers with these strings from its own slot state, so every message is
 * written to be useful on its own, the moment it lands, without the listener
 * having seen the previous one: the card, the list, and the position are all
 * restated every time. A move that does not change the slot produces the same
 * string as the last one, and an unchanged live region is not re-announced.
 */
const position = (index: number, count: number) => `position ${index + 1} of ${count}`;

const name = (task: Task) => `${task.title} (${shortId(task.id)})`;

export function pickUpMessage(task: Task, columnTitle: string, index: number, count: number): string {
  return `Picked up ${name(task)}. ${columnTitle}, ${position(index, count)}. Arrow keys move it, Space or Enter drops it, Escape cancels.`;
}

export function moveMessage(task: Task, columnTitle: string, index: number, count: number): string {
  return `${name(task)} is now in ${columnTitle}, ${position(index, count)}.`;
}

export function dropMessage(task: Task, columnTitle: string, index: number, count: number): string {
  return `Dropped ${name(task)} in ${columnTitle}, ${position(index, count)}.`;
}

export function cancelMessage(task: Task, columnTitle: string, index: number, count: number): string {
  return `Move cancelled. ${name(task)} is back in ${columnTitle}, ${position(index, count)}.`;
}

/**
 * What a screen reader hears when focus lands on a card. dnd-kit wires this to
 * `aria-describedby`, so the instructions are not repeated in every card label.
 */
export const screenReaderInstructions = {
  draggable:
    'Press Space to pick up a card. While a card is picked up, use the arrow keys to move it, Space or Enter to drop it, and Escape to cancel. Press Enter on a card to open its details.',
};
