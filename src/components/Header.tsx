import { forwardRef } from 'react';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  onNewTask: () => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
}

const Header = forwardRef<HTMLInputElement, Props>(function Header(props, searchRef) {
  return (
    <header className="shrink-0 border-b kb-card kb-border flex flex-wrap items-center gap-2 px-3 py-2 sm:h-14 sm:flex-nowrap sm:gap-3 sm:px-4">
      <span className="font-semibold tracking-tight order-1">My Board</span>
      <div className="flex-1 order-2 sm:hidden" />
      <div className="order-5 basis-full sm:order-2 sm:basis-auto sm:flex-1 sm:max-w-md relative">
        <input
          ref={searchRef}
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="Search tasks…  ( / )"
          className="w-full rounded-lg border kb-border kb-bg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        onClick={props.onOpenFilters}
        className="order-3 relative px-3 py-1.5 rounded-lg border kb-border text-sm hover:bg-black/5 dark:hover:bg-white/10"
      >
        Filters
        {props.activeFilterCount > 0 && (
          <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full kb-accent-bg text-white text-xs font-mono-kb">
            {props.activeFilterCount}
          </span>
        )}
      </button>
      <button
        onClick={props.onNewTask}
        className="order-4 px-3 py-1.5 rounded-lg kb-accent-bg text-white text-sm font-medium hover:opacity-90"
      >
        + New <span className="opacity-70 font-mono-kb text-xs ml-1 hidden sm:inline">N</span>
      </button>
    </header>
  );
});

export default Header;
