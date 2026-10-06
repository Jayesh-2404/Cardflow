import { useRef, useState, type ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import type { AgentState, FilterState, Priority } from '../types';

export type PanelName = 'filters' | 'archive' | 'settings' | 'journal';

interface Props {
  railOpen: boolean;
  panel: PanelName | null;
  filters: FilterState;
  allTags: string[];
  archivedCount: number;
  theme: 'light' | 'dark';
  onToggleRail: () => void;
  onOpenPanel: (p: PanelName) => void;
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
  journalList: ReactNode;
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const AGENT_FILTERS: AgentState[] = ['running', 'under-review'];

const PANEL_TITLE: Record<PanelName, string> = {
  filters: 'Filters',
  archive: 'Archive',
  journal: 'Journal',
  settings: 'Settings',
};

export default function Sidebar(props: Props) {
  const { railOpen, panel, filters, allTags } = props;

  function togglePriority(p: Priority) {
    const has = filters.priorities.includes(p);
    props.onFiltersChange({
      ...filters,
      priorities: has ? filters.priorities.filter((x) => x !== p) : [...filters.priorities, p],
    });
  }

  function toggleAgent(a: AgentState) {
    const has = filters.agent.includes(a);
    props.onFiltersChange({
      ...filters,
      agent: has ? filters.agent.filter((x) => x !== a) : [...filters.agent, a],
    });
  }

  const railBtn = (name: IconName, label: string, target: PanelName, badge?: number) => {
    const active = panel === target;
    return (
      <button
        title={badge ? `${label} (${badge})` : label}
        aria-label={label}
        aria-pressed={active}
        data-testid={`rail-${target}`}
        onClick={() => props.onOpenPanel(target)}
        className={`relative grid h-8 w-8 place-items-center rounded-[6px] transition-colors duration-100 ${
          active
            ? 'kb-accent-soft kb-accent'
            : 'text-kb-muted hover:bg-[var(--kb-sunken)] hover:text-kb-text'
        }`}
      >
        <Icon name={name} size={16} />
        {badge ? (
          <span className="kb-faint font-mono-kb absolute -right-0.5 -top-0.5 min-w-3.5 rounded-full bg-[var(--kb-card)] px-[3px] text-center text-[9px] leading-[14px]">
            {badge > 99 ? '99' : badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <>
      <nav
        aria-label="Board tools"
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-r kb-border bg-[var(--kb-card)] py-2.5"
      >
        <button
          title="Toggle panel"
          aria-label="Toggle panel"
          data-testid="rail-toggle"
          onClick={props.onToggleRail}
          className="grid h-8 w-8 place-items-center rounded-[6px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
        >
          <Icon name="menu" size={16} />
        </button>

        <span className="my-1 h-px w-5 kb-border bg-[var(--kb-border)]" />

        {railBtn('columns', 'Board', 'filters')}
        {railBtn('activity', 'Journal', 'journal')}
        {railBtn('archive', 'Archive', 'archive', props.archivedCount)}
        {railBtn('settings', 'Settings', 'settings')}

        <div className="flex-1" />

        <button
          title={props.theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          aria-label="Toggle theme"
          data-testid="rail-theme"
          onClick={props.onToggleTheme}
          className="grid h-8 w-8 place-items-center rounded-[6px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
        >
          <Icon name={props.theme === 'light' ? 'moon' : 'sun'} size={16} />
        </button>
      </nav>

      {railOpen && panel && (
        <div className="fixed inset-0 z-30">
          <div
            className="absolute inset-0 bg-black/25"
            onClick={props.onClosePanel}
            data-testid="panel-scrim"
          />
          <aside
            className="absolute left-12 top-0 flex h-full w-[min(20rem,calc(100vw-3rem))] flex-col border-r kb-border bg-[var(--kb-card)] shadow-[var(--kb-shadow-lg)]"
            data-testid="side-panel"
          >
            <div className="flex shrink-0 items-center justify-between border-b kb-border px-3.5 py-2.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-kb-muted">
                {PANEL_TITLE[panel]}
              </h2>
              <button
                onClick={props.onClosePanel}
                aria-label="Close panel"
                data-testid="close-panel"
                className="grid h-6 w-6 place-items-center rounded-[5px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="kb-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
              {panel === 'filters' && (
                <div className="space-y-4 text-[13px]">
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
                      Priority
                    </p>
                    <div className="flex gap-1.5">
                      {PRIORITIES.map((p) => (
                        <button
                          key={p}
                          onClick={() => togglePriority(p)}
                          data-testid={`filter-priority-${p}`}
                          className={`rounded-full border px-2.5 py-0.5 text-[11.5px] capitalize transition-colors duration-100 ${
                            filters.priorities.includes(p)
                              ? 'kb-accent-bg border-transparent'
                              : 'kb-border text-kb-muted hover:border-[var(--kb-border-strong)]'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
                      Agent
                    </p>
                    <div className="flex gap-1.5">
                      {AGENT_FILTERS.map((a) => (
                        <button
                          key={a}
                          onClick={() => toggleAgent(a)}
                          data-testid={`filter-agent-${a}`}
                          className={`rounded-full border px-2.5 py-0.5 text-[11.5px] capitalize transition-colors duration-100 ${
                            filters.agent.includes(a)
                              ? 'kb-accent-bg border-transparent'
                              : 'kb-border text-kb-muted hover:border-[var(--kb-border-strong)]'
                          }`}
                        >
                          {a === 'under-review' ? 'Review' : 'Running'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
                      Tag
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => props.onFiltersChange({ ...filters, tag: null })}
                        className={`rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors duration-100 ${
                          filters.tag === null
                            ? 'kb-accent-bg border-transparent'
                            : 'kb-border text-kb-muted hover:border-[var(--kb-border-strong)]'
                        }`}
                      >
                        All
                      </button>
                      {allTags.map((t) => (
                        <button
                          key={t}
                          onClick={() => props.onFiltersChange({ ...filters, tag: t })}
                          className={`rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors duration-100 ${
                            filters.tag === t
                              ? 'kb-accent-bg border-transparent'
                              : 'kb-border text-kb-muted hover:border-[var(--kb-border-strong)]'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                      {allTags.length === 0 && (
                        <span className="text-[11.5px] text-kb-faint">No tags yet</span>
                      )}
                    </div>
                  </div>
                  <Toggle
                    label="Overdue only"
                    checked={filters.overdueOnly}
                    onChange={(v) => props.onFiltersChange({ ...filters, overdueOnly: v })}
                  />
                  <Toggle
                    label="Show archived on board"
                    checked={filters.showArchived}
                    onChange={(v) => props.onFiltersChange({ ...filters, showArchived: v })}
                  />
                  <button
                    onClick={props.onClearFilters}
                    data-testid="clear-filters"
                    className="kb-accent text-[12px] hover:underline"
                  >
                    Clear all filters
                  </button>
                </div>
              )}

              {panel === 'archive' && <div className="space-y-2">{props.archiveList}</div>}

              {panel === 'journal' && <div>{props.journalList}</div>}

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
          </aside>
        </div>
      )}
    </>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
      <span>{props.label}</span>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="block h-[18px] w-8 rounded-full border kb-border bg-[var(--kb-sunken)] transition-colors duration-100 peer-checked:border-transparent peer-checked:bg-[var(--kb-accent)]" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-[var(--kb-card)] shadow-[var(--kb-shadow-sm)] transition-transform duration-100 peer-checked:translate-x-3.5" />
      </span>
    </label>
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
    <div className="space-y-5 text-[13px]">
      <div>
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
          Backup
        </p>
        <div className="flex gap-2">
          <button onClick={props.onExport} className="kb-btn">
            <Icon name="download" size={14} />
            Export
          </button>
          <label className="kb-btn cursor-pointer">
            <Icon name="upload" size={14} />
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
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
          Danger zone
        </p>
        <div className="flex flex-col gap-1.5">
          <button onClick={props.onLock} className="kb-btn justify-start">
            <Icon name="lock" size={14} />
            Lock board now
          </button>
          <button onClick={props.onResetDemo} className="kb-btn justify-start">
            <Icon name="undo" size={14} />
            Reset to demo data
          </button>
          <button onClick={props.onWipe} className="kb-btn kb-btn-danger justify-start">
            <Icon name="trash" size={14} />
            Erase everything
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordForm(props: {
  onChangePassword: (cur: string, next: string) => Promise<boolean>;
}) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-kb-faint">
        Password
      </p>
      <input
        ref={first}
        type="password"
        value={cur}
        onChange={(e) => setCur(e.target.value)}
        placeholder="Current"
        className="kb-input mb-1.5"
      />
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
        }}
        placeholder="New (min 8 chars)"
        className="kb-input"
      />
      {msg && (
        <p className={`mt-1.5 text-[11.5px] ${ok ? 'kb-ok' : 'kb-danger'}`} role="status">
          {msg}
        </p>
      )}
      <button
        onClick={async () => {
          if (next.length < 8) {
            setOk(false);
            setMsg('New password must be at least 8 characters.');
            return;
          }
          const good = await props.onChangePassword(cur, next);
          setOk(good);
          setMsg(good ? 'Password updated.' : 'Current password is wrong.');
          if (good) {
            setCur('');
            setNext('');
          }
        }}
        className="kb-btn mt-2 w-full"
      >
        Update password
      </button>
    </div>
  );
}
