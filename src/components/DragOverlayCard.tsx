import { useCallback, useEffect, useRef } from 'react';
import { DragOverlay, type DropAnimationFunction } from '@dnd-kit/core';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { TaskCardOverlay } from './TaskCard';
import type { Task } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Lean per px/s of horizontal speed, and its ceiling. */
const TILT_PER_VELOCITY = 0.016;
const TILT_MAX = 7;

/** How much the card grows while it is being carried, and shrinks back on landing. */
const LIFT_SCALE = 1.02;

/** Milliseconds within which a measured velocity still counts as the throw. */
const THROW_FRESHNESS = 90;

/** The settle of the drop: the same curve as a card's slot glide. */
const DROP_SPRING = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.9 };

/*
  dnd-kit owns the follow: while dragging, the overlay wrapper is translated to
  the pointer once per frame with a plain transform, which is the cheapest thing
  a browser can do. motion owns the two things dnd-kit has no curve for: the
  lean that comes from horizontal speed, and the spring on release.

  The drop runs inside dnd-kit's own drop animation hook rather than after it.
  On release dnd-kit keeps a frozen clone of the overlay alive for exactly as
  long as this promise takes, so this is the only place with both rects in hand:
  where the card is, and the slot it has already been committed to. Animating
  the offsets that live on the clone's motion values keeps the landing pixel
  exact and lets it carry the throw's velocity and direction.
*/

interface Props {
  task: Task;
  entryCount: number;
  /** Horizontal pointer speed in px/s, written by the board on every move. */
  velocityX: MotionValue<number>;
  /** The last measured card speed, both axes, in px/s, with the time of it. */
  throwVelocity: { current: { x: number; y: number; at: number } };
  /** The card has landed; the board can put it back inside its slot. */
  onSettled: () => void;
}

export default function DragOverlayCard({
  task,
  entryCount,
  velocityX,
  throwVelocity,
  onSettled,
}: Props) {
  const reduced = useReducedMotion();

  const tilt = useSpring(
    useTransform(velocityX, (v) =>
      reduced ? 0 : clamp(-v * TILT_PER_VELOCITY, -TILT_MAX, TILT_MAX),
    ),
    { stiffness: 220, damping: 26, mass: 0.8 },
  );

  const dropX = useMotionValue(0);
  const dropY = useMotionValue(0);
  const scale = useMotionValue(reduced ? 1 : LIFT_SCALE);

  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  const dropAnimation = useCallback<DropAnimationFunction>(
    ({ active, dragOverlay }) => {
      // Nothing is being thrown any more, so the lean unwinds on its own spring.
      velocityX.set(0);

      // Offsets from where the overlay sits now to the slot the card was
      // committed to. Both rects come from live nodes: the card is already
      // drawn in its new list, so this is where it actually lands.
      const toX = active.rect.left - dragOverlay.rect.left;
      const toY = active.rect.top - dragOverlay.rect.top;
      const thrown = throwVelocity.current;
      // A hand that has been resting for a while is not a throw.
      const fresh = performance.now() - thrown.at <= THROW_FRESHNESS;
      const vx = fresh ? thrown.x : 0;
      const vy = fresh ? thrown.y : 0;

      if (reduced) {
        settled.current();
        return;
      }

      const springs = [
        animate(dropX, toX, { ...DROP_SPRING, velocity: vx }),
        animate(dropY, toY, { ...DROP_SPRING, velocity: vy }),
        animate(scale, 1, DROP_SPRING),
      ];

      return Promise.all(springs.map((controls) => controls.then(() => undefined))).then(() => {
        settled.current();
      });
    },
    [dropX, dropY, reduced, scale, throwVelocity, velocityX],
  );

  return (
    <DragOverlay dropAnimation={dropAnimation} zIndex={70}>
      {/*
        Two nodes, on purpose. dnd-kit measures the overlay's outermost element
        for both the follow and the landing, and a rotation or a scale would
        inflate that measured box and move the landing pixel. So the outer box
        carries only the drop's translation and every visual transform lives on
        the node inside it.
      */}
      <motion.div
        aria-hidden
        data-testid="drag-overlay"
        style={{ x: dropX, y: dropY, willChange: 'transform' }}
      >
        <motion.div style={{ rotate: tilt, scale }}>
          <TaskCardOverlay task={task} entryCount={entryCount} />
        </motion.div>
      </motion.div>
    </DragOverlay>
  );
}
