import { useState, type ReactNode } from 'react';
import type { FilterState, Priority } from '../types';

interface Props {
  railOpen: boolean;
  panel: 'filters' | 'archive' | 'settings' | null;
  filters: FilterState;
  allTags: string[];
  archivedCount: number;
  theme: 'light' | 'dark';
  onToggleRail: () => void;
  onOpenPanel: (p: 'filters' | 'archive' | 'settings') => void;
  onClosePanel: () => void;
  onFiltersChange: (f: FilterState) => void;
  onClearFilters: () => void;
  onToggleTheme: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onResetDemo: () => void;
  onChangePassword: (cur: string, next: string) => Promise<boolean>;
  onLock: () => void;
  onWipe: () => void;
  archiveList: ReactNode;
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export default function Sidebar(props: Props) {
  const { railOpen, panel, filters, allTags } = props;

  function togglePriority(p: Priority) {
    const has = filters.priorities.includes(p);
    props.onFiltersChange({
      ...filters,
      priorities: has ? filters.priorities.filter((x) => x !== p) : [...filters.priorities, p],
    });
  }

  return (
    <>
      {/* icon rail */}
      <aside className="w-14 shrink-0 border-r kb-card kb-border flex flex-col items-center py-3 gap-1">
        <button
          title="Menu"
          onClick={props.onToggleRail}
          className="w-9 h-9 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-lg"
        >
          ☰
        </button>
        <button
          title="Filters"
          onClick={() => props.onOpenPanel('filters')}
          className={`w-9 h-9 rounded-lg text-lg ${panel === 'filters' ? 'bg-indigo-100 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
        >
          ⏷
        </button>
        <button
          title={`Archive (${props.archivedCount})`}
          onClick={() => props.onOpenPanel('archive')}
          className={`w-9 h-9 rounded-lg text-lg ${panel === 'archive' ? 'bg-indigo-100 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
        >
          🗄
        </button>
        <button
          title="Settings"
          onClick={() => props.onOpenPanel('settings')}
          className={`w-9 h-9 rounded-lg text-lg ${panel === 'settings' ? 'bg-indigo-100 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
        >
          ⚙
        </button>
        <div className="flex-1" />
        <button
          title={props.theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          onClick={props.onToggleTheme}
          className="w-9 h-9 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-lg"
        >
          {props.theme === 'light' ? '◑' : '☀'}
        </button>
      </aside>

      {/* overlay panel */}
      {railOpen && panel && (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/20" onClick={props.onClosePanel} />
          <div className="absolute left-14 top-0 bottom-0 w-[calc(100vw-3.5rem)] max-w-72 kb-card border-r kb-border p-4 overflow-y-auto shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold capitalize">{panel}</h2>
              <button onClick={props.onClosePanel} className="text-lg kb-muted hover:kb-text">
                ✕
              </button>
            </div>

            {panel === 'filters' && (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="kb-muted mb-1.5 text-xs uppercase tracking-wide">Priority</p>
                  <div className="flex gap-1.5">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        onClick={() => togglePriority(p)}
                        className={`px-2.5 py-1 rounded-full border text-xs capitalize ${
                          filters.priorities.includes(p)
                            ? 'kb-accent-bg text-white border-transparent'
                            : 'kb-border hover:bg-black/5 dark:hover:bg-white/10'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="kb-muted mb-1.5 text-xs uppercase tracking-wide">Tag</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => props.onFiltersChange({ ...filters, tag: null })}
                      className={`px-2.5 py-1 rounded-full border text-xs ${filters.tag === null ? 'kb-accent-bg text-white border-transparent' : 'kb-border'}`}
                    >
                      All
                    </button>
                    {allTags.map((t) => (
                      <button
                        key={t}
                        onClick={() => props.onFiltersChange({ ...filters, tag: t })}
                        className={`px-2.5 py-1 rounded-full border text-xs ${filters.tag === t ? 'kb-accent-bg text-white border-transparent' : 'kb-border'}`}
                      >
                        {t}
                      </button>
                    ))}
                    {allTags.length === 0 && <span className="kb-muted text-xs">No tags yet</span>}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filters.overdueOnly}
                    onChange={(e) => props.onFiltersChange({ ...filters, overdueOnly: e.target.checked })}
                  />
                  Overdue only
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filters.showArchived}
                    onChange={(e) => props.onFiltersChange({ ...filters, showArchived: e.target.checked })}
                  />
                  Show archived on board
                </label>
                <button onClick={props.onClearFilters} className="text-xs kb-accent hover:underline">
                  Clear all filters
                </button>
              </div>
            )}

            {panel === 'archive' && <div className="space-y-2">{props.archiveList}</div>}

            {panel === 'settings' && (
              <SettingsPanel
                onExport={props.onExport}
                onImport={props.onImport}
                onResetDemo={props.onResetDemo}
                onChangePassword={props.onChangePassword}
                onLock={props.onLock}
                onWipe={props.onWipe}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SettingsPanel(props: {
  onExport: () => void;
  onImport: (file: File) => void;
  onResetDemo: () => void;
  onChangePassword: (cur: string, next: string) => Promise<boolean>;
  onLock: () => void;
  onWipe: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="kb-muted text-xs uppercase tracking-wide mb-1.5">Backup</p>
        <div className="flex gap-2">
          <button onClick={props.onExport} className="px-3 py-1.5 rounded-lg border kb-border hover:bg-black/5 dark:hover:bg-white/10">
            Export JSON
          </button>
          <label className="px-3 py-1.5 rounded-lg border kb-border hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
            Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) props.onImport(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      <ChangePasswordForm onChangePassword={props.onChangePassword} />
      <div>
        <p className="kb-muted text-xs uppercase tracking-wide mb-1.5">Danger</p>
        <div className="flex flex-col gap-2">
          <button onClick={props.onLock} className="px-3 py-1.5 rounded-lg border kb-border text-left hover:bg-black/5 dark:hover:bg-white/10">
            Lock board now
          </button>
          <button onClick={props.onResetDemo} className="px-3 py-1.5 rounded-lg border kb-border text-left hover:bg-black/5 dark:hover:bg-white/10">
            Reset to demo data
          </button>
          <button onClick={props.onWipe} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-500 text-left hover:bg-red-50 dark:hover:bg-red-950">
            Erase everything
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordForm(props: { onChangePassword: (cur: string, next: string) => Promise<boolean> }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div>
      <p className="kb-muted text-xs uppercase tracking-wide mb-1.5">Password</p>
      <input
        type="password"
        value={cur}
        onChange={(e) => setCur(e.target.value)}
        placeholder="Current"
        className="w-full rounded-lg border kb-border kb-card px-2.5 py-1.5 text-sm mb-1.5 outline-none"
      />
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="New (min 4 chars)"
        className="w-full rounded-lg border kb-border kb-card px-2.5 py-1.5 text-sm outline-none"
      />
      {msg && <p className="text-xs mt-1 kb-muted">{msg}</p>}
      <button
        onClick={async () => {
          if (next.length < 4) {
            setMsg('New password too short.');
            return;
          }
          const ok = await props.onChangePassword(cur, next);
          setMsg(ok ? 'Password updated.' : 'Current password wrong.');
          if (ok) {
            setCur('');
            setNext('');
          }
        }}
        className="mt-2 px-3 py-1.5 rounded-lg border kb-border hover:bg-black/5 dark:hover:bg-white/10"
      >
        Update password
      </button>
    </div>
  );
}
