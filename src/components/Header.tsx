import { forwardRef } from 'react';
import Icon from './Icon';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  onNewTask: () => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onOpenPalette?: () => void;
  doneToday: number;
  totalOpen: number;
  live?: 'live' | 'retry' | 'off';
}

/**
 * The board's toolbar: what the board is, how far along it is, and the three
 * things a keyboard-first user reaches for.
 *
 * It copies the reference's toolbar rather than inventing a new one — one
 * 72px row with no rule under it, the title and its count as one 14px line in
 * text and muted greys, and pill controls at the right for the actions the
 * reference keeps in its per-column rows.
 */
const Header = forwardRef<HTMLInputElement, Props>(function Header(props, searchRef) {
  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:h-[72px] sm:flex-nowrap sm:px-6 sm:pb-4 sm:pt-5">
      <div className="order-1 flex min-w-0 items-center gap-3">
        <h1 className="shrink-0 truncate text-[14px] font-normal text-kb-text">Cardflow</h1>
        <span
          className="tabular-kb shrink-0 text-[14px] text-kb-muted"
          title="Cards in Done"
          data-testid="done-counter"
        >
          {props.doneToday}/{props.totalOpen}
        </span>
        <span
          data-testid="live-status"
          title={props.live === 'live' ? 'Live sync on' : 'Reconnecting'}
          className={`flex shrink-0 items-center gap-1.5 text-[12px] ${
            props.live === 'live' ? 'text-kb-muted' : 'text-kb-danger'
          }`}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: props.live === 'live' ? 'var(--kb-ok)' : 'var(--kb-danger)' }}
          />
          {props.live === 'live' ? 'Live' : 'Sync'}
        </span>
      </div>

      {/* search drops to its own row below sm so it never gets crushed */}
      <div className="order-3 w-full sm:order-2 sm:w-auto sm:max-w-sm sm:flex-1">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-kb-faint">
            <Icon name="search" size={15} />
          </span>
          <input
            ref={searchRef}
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            placeholder="Filter cards"
            aria-label="Filter cards"
            data-testid="search-input"
            className="kb-input kb-input-pill pl-10 pr-12"
          />
          <kbd className="kb-kbd pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex">
            /
          </kbd>
        </div>
      </div>

      <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:ml-0">
        {props.onOpenPalette && (
          <button
            onClick={props.onOpenPalette}
            title="Command palette"
            data-testid="open-palette"
            className="kb-btn kb-btn-outline h-9 px-3"
          >
            <Icon name="sparkle" size={15} />
            <span className="hidden sm:inline">Commands</span>
            <kbd className="kb-kbd ml-0.5 hidden sm:inline-flex">⌃K</kbd>
          </button>
        )}
        <button
          onClick={props.onOpenFilters}
          data-testid="open-filters"
          className="kb-btn kb-btn-outline h-9 px-3"
          title="Filters"
        >
          <Icon name="filter" size={15} />
          <span className="hidden sm:inline">Filter</span>
          {props.activeFilterCount > 0 && (
            <span className="kb-chip-accent font-mono-kb ml-0.5 h-4 min-w-4 px-1 text-[10px] leading-4">
              {props.activeFilterCount}
            </span>
          )}
        </button>
        <button
          onClick={props.onNewTask}
          data-testid="new-task"
          className="kb-btn kb-btn-primary h-9 px-3.5"
          title="New task (N)"
        >
          <Icon name="plus" size={15} strokeWidth={2.25} />
          New
          <kbd className="kb-kbd ml-0.5 hidden border-white/25 bg-transparent text-white/70 lg:inline-flex">
            N
          </kbd>
        </button>
      </div>
    </header>
  );
});

export default Header;
