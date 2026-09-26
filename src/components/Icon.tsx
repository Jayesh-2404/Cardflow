import type { SVGProps } from 'react';

/**
 * Single-stroke 24x24 icon set drawn to one spec: 1.75 stroke, round caps and
 * joins, no fills. Replaces the emoji glyphs that rendered at inconsistent
 * sizes and weights across platforms.
 */
const PATHS = {
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  filter: ['M3.5 5.5h17l-6.6 7.6V19l-3.8-2.2v-3.7L3.5 5.5Z'],
  archive: ['M4 7.5h16V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V7.5Z', 'M3 4.5h18v3H3z', 'M10 11.5h4'],
  settings: [
    'M4 7h8.5M16.5 7H20M4 12h3.5M11.5 12H20M4 17h8.5M16.5 17H20',
    'M14.75 7a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0Z',
    'M9.75 12a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0Z',
    'M14.75 17a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0Z',
  ],
  sun: [
    'M12 16.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z',
    'M12 2.75v1.8M12 19.45v1.8M21.25 12h-1.8M4.55 12h-1.8M18.54 5.46l-1.27 1.27M6.73 17.27l-1.27 1.27M18.54 18.54l-1.27-1.27M6.73 6.73 5.46 5.46',
  ],
  moon: ['M20.25 14.6A8.5 8.5 0 0 1 9.4 3.75a8.5 8.5 0 1 0 10.85 10.85Z'],
  pencil: ['M4 20.25h4.2L19.4 9.05a2.12 2.12 0 0 0-3-3L5.2 17.05l-1.2 3.2Z', 'M14.6 6.4l3 3'],
  trash: [
    'M4.5 7h15',
    'M9.75 7V5.4A1.4 1.4 0 0 1 11.15 4h1.7a1.4 1.4 0 0 1 1.4 1.4V7',
    'M6.6 7l.75 12.05A1.5 1.5 0 0 0 8.85 20.5h6.3a1.5 1.5 0 0 0 1.5-1.45L17.4 7',
    'M10.25 10.75v6M13.75 10.75v6',
  ],
  plus: ['M12 5.25v13.5M5.25 12h13.5'],
  search: ['M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z', 'M20 20l-4.1-4.1'],
  close: ['M6.25 6.25l11.5 11.5M17.75 6.25 6.25 17.75'],
  calendar: [
    'M5 6.75h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.75a1 1 0 0 1 1-1Z',
    'M4 10.75h16',
    'M8.5 4v3.5M15.5 4v3.5',
  ],
  flag: ['M6 20.25V4.5', 'M6 5.4h9.4l-1.4 3 1.4 3H6'],
  tag: [
    'M4.5 10.65V5.5a1 1 0 0 1 1-1h5.15a1 1 0 0 1 .7.3l7 7a1 1 0 0 1 0 1.4l-5.15 5.15a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1-.3-.7Z',
    'M8.85 8.85h.01',
  ],
  clock: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M12 7.75V12l3 1.8'],
  note: [
    'M6 4.5h9.05L19 8.45V19.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z',
    'M14.5 4.75V8.5h3.75',
    'M8.5 12.75h7M8.5 16.25h4.5',
  ],
  journal: [
    'M4.5 5.25A1.25 1.25 0 0 1 5.75 4h4.4A2.85 2.85 0 0 1 12 5.2 2.85 2.85 0 0 1 13.85 4h4.4a1.25 1.25 0 0 1 1.25 1.25v11.5A1.25 1.25 0 0 1 18.25 18h-4.4A2.85 2.85 0 0 0 12 19.2 2.85 2.85 0 0 0 8.15 18h-4.4a1.25 1.25 0 0 1-1.25-1.25V5.25Z',
    'M12 5.2v14',
  ],
  check: ['M5 12.5l4.6 4.6L19 7.5'],
  inbox: [
    'M3.5 13.5h4.2l1.5 2.75h5.6l1.5-2.75h4.2',
    'M6.1 5.25h11.8a1 1 0 0 1 .92.6L21 11.4V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7.6l2.18-5.55a1 1 0 0 1 .92-.6Z',
  ],
  keyboard: [
    'M3.75 7.5h16.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z',
    'M7 10.75h.01M10.5 10.75h.01M14 10.75h.01M17 10.75h.01',
    'M8 14.25h8',
  ],
  download: ['M12 4v10.5', 'M7.75 10.5 12 14.75l4.25-4.25', 'M4.5 19.5h15'],
  upload: ['M12 15V4.5', 'M7.75 8.75 12 4.5l4.25 4.25', 'M4.5 19.5h15'],
  lock: [
    'M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
    'M8.75 10.5V8a3.25 3.25 0 0 1 6.5 0v2.5',
  ],
  alert: ['M12 4.5 21 19.5H3L12 4.5Z', 'M12 10.25v4M12 16.75h.01'],
  chevronRight: ['M9.75 5.5 16.25 12l-6.5 6.5'],
  chevronDown: ['M5.5 9.25 12 15.75l6.5-6.5'],
  columns: ['M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z', 'M9.17 5.5v13M14.83 5.5v13'],
  activity: ['M3.5 12.5h3.6l2.4-6 4 12 2.4-6h4.6'],
  enter: ['M9 5.25v6.75a2 2 0 0 0 2 2h8', 'M15.5 10.5 19 14l-3.5 3.5'],
  hash: ['M6 9.5h12M5.5 14.5h12M10 5 8.5 19M15 5l-1.5 14'],
  list: ['M8.5 7h11M8.5 12h11M8.5 17h11', 'M4.75 7h.01M4.75 12h.01M4.75 17h.01'],
  sparkle: ['M12 4.5l1.7 4.4 4.4 1.7-4.4 1.7L12 16.7l-1.7-4.4L5.9 10.6l4.4-1.7L12 4.5Z'],
  undo: ['M9 5.5 4.5 10 9 14.5', 'M4.5 10h9.25a5.75 5.75 0 0 1 0 11.5H11'],
} as const;

export type IconName = keyof typeof PATHS;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export default function Icon({ name, size = 16, strokeWidth = 1.75, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
