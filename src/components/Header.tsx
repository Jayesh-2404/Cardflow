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

const Header = forwardRef<HTMLInputElement, Props>(function Header(props, searchRef) {
  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b kb-border bg-[var(--kb-card)] px-3 py-2 sm:h-13 sm:flex-nowrap sm:gap-2.5 sm:px-4">
      <h1 className="order-1 shrink-0 text-[13px] font-semibold tracking-[-0.01em]">
        Cardflow
      </h1>
      <span
        data-testid="live-status"
        title={props.live === 'live' ? 'Live sync on' : 'Reconnecting'}
        className={`order-1 flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono-kb text-[10px] ${
          props.live === 'live' ? 'text-kb-muted' : 'text-kb-danger'
        }`}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: props.live === 'live' ? 'var(--kb-ok)' : 'var(--kb-danger)' }}
        />
        {props.live === 'live' ? 'Live' : 'Sync'}
      </span>

      {/* search drops to its own row below sm so it never gets crushed */}
      <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1 sm:max-w-md">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-kb-faint">
            <Icon name="search" size={14} />
          </span>
          <input
            ref={searchRef}
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            placeholder="Filter cards"
            aria-label="Filter cards"
            data-testid="search-input"
            className="kb-input h-8 pl-8 pr-14"
          />
          <kbd className="kb-kbd pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex">
            /
          </kbd>
        </div>
      </div>

      <div className="order-2 ml-auto flex items-center gap-1.5 sm:order-3 sm:ml-0">
        <span
          className="mr-1 hidden font-mono-kb text-[11px] text-kb-muted lg:inline"
          title="Cards in Done"
          data-testid="done-counter"
        >
          {props.doneToday}/{props.totalOpen}
        </span>
        {props.onOpenPalette && (
          <button
            onClick={props.onOpenPalette}
            title="Command palette"
            data-testid="open-palette"
            className="kb-btn h-8 px-2"
          >
            <Icon name="sparkle" size={14} />
            <span className="hidden sm:inline">Commands</span>
            <kbd className="kb-kbd ml-0.5 hidden sm:inline-flex">⌃K</kbd>
          </button>
        )}
        <button
          onClick={props.onOpenFilters}
          data-testid="open-filters"
          className="kb-btn relative h-8 px-2"
          title="Filters"
        >
          <Icon name="filter" size={14} />
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
          className="kb-btn kb-btn-primary h-8"
          title="New task (N)"
        >
          <Icon name="plus" size={14} strokeWidth={2.25} />
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
