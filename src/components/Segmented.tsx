import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  'aria-label': string;
  'data-testid'?: string;
  className?: string;
}

/** The pill's slide: quick out, no overshoot to speak of. */
const PILL_SPRING = { type: 'spring' as const, stiffness: 520, damping: 40, mass: 0.7 };

/**
 * A segmented control: one sunken track, one raised pill under the chosen
 * option, `role="radiogroup"` and radios inside it.
 *
 * The pill is a sibling of the options, moved by transform, so choosing an
 * option composites a movement instead of repainting a border, and the option
 * keeps a stable hit area. Its box is measured from the chosen option rather
 * than divided out of the track: labels are content, so the widths only come
 * out right if the browser lays them out.
 */
export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  'data-testid': testId,
  className = '',
}: Props<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const reduced = useReducedMotion();

  // Layout effect on purpose: the pill is in place for the first paint, so a
  // freshly opened drawer does not show the choice without its pill.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const active = track.querySelector<HTMLElement>('[aria-checked="true"]');
      if (active)
        setPill({
          x: active.offsetLeft,
          y: active.offsetTop,
          w: active.offsetWidth,
          h: active.offsetHeight,
        });
    };
    measure();
    // Inter arrives after first paint and moves the labels: measure again once
    // the font is in, or the pill sits a few pixels off its option.
    void document.fonts?.ready?.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [value, options]);

  /** Radiogroup convention: arrows move the choice and the focus with it. */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    e.preventDefault();
    const from = options.findIndex((o) => o.value === value);
    const to = (from + step + options.length) % options.length;
    optionRefs.current[to]?.focus();
    onChange(options[to].value);
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={`kb-seg h-[38px] w-full ${className}`}
    >
      {pill && (
        <motion.span
          aria-hidden
          className="kb-seg-pill"
          initial={false}
          animate={{ x: pill.x, y: pill.y, width: pill.w, height: pill.h }}
          transition={reduced ? { duration: 0 } : PILL_SPRING}
        />
      )}
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => {
            optionRefs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          data-testid={`${testId ?? 'segmented'}-option`}
          data-value={option.value}
          onClick={() => onChange(option.value)}
          className="kb-seg-option h-[30px] min-w-0 flex-1 truncate px-3"
        >
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
