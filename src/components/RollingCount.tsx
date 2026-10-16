import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** One digit line box. The strip steps by exactly this, so it never drifts. */
const STEP_EM = 1.4;

/**
 * A column count that rolls to its new value instead of snapping.
 *
 * Each digit is a 0-9 strip inside a one-line-tall window, moved by transform,
 * so a change composites instead of reflowing the header. The value is also
 * rendered as plain text for screen readers: the strip's own characters read
 * out as "zero one two three".
 */
export default function RollingCount({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const text = String(value);
  const digits = text.split('');

  // A 9 rolling to 10 gains a digit. Keep the old width while the new one
  // rolls in, so the strip is not remounted and the roll is visible.
  const [width, setWidth] = useState(digits.length);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (digits.length >= width) {
      setWidth(digits.length);
      return;
    }
    timer.current = window.setTimeout(() => setWidth(digits.length), reduced ? 0 : 460);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [digits.length, width, reduced]);

  const padded = text.padStart(width, '0').split('');

  return (
    <span className={`tabular-kb inline-flex items-baseline leading-none ${className}`}>
      <span className="kb-sr-only">{text}</span>
      <span
        aria-hidden
        className="inline-flex overflow-hidden"
        style={{ height: `${STEP_EM}em` }}
      >
        {padded.map((digit, i) => (
          <span
            key={i}
            className="relative inline-block"
            style={{ width: '1ch', height: `${STEP_EM}em` }}
          >
            <span
              className="block"
              style={{
                transform: `translateY(${-Number(digit) * STEP_EM}em)`,
                transition: reduced ? 'none' : 'transform 420ms var(--kb-ease-snap)',
              }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="flex items-center justify-center" style={{ height: `${STEP_EM}em` }}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
