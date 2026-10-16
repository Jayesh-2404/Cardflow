import { useState, type ReactNode } from 'react';
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
        className={`kb-focus relative grid h-[30px] w-[30px] place-items-center rounded-[10px] transition-colors duration-100 ${
          active
            ? 'kb-accent-soft kb-accent'
            : 'text-kb-muted hover:bg-[var(--kb-sunken)] hover:text-kb-text'
        }`}
      >
        <Icon name={name} size={16} />
        {badge ? (
          <span className="kb-faint font-mono-kb absolute -right-0.5 -top-0.5 min-w-3.5 rounded-full bg-[var(--kb-bg)] px-[3px] text-center text-[9px] leading-[14px]">
            {badge > 99 ? '99' : badge}
          </span>
        ) : null}
      </button>
    );
  };

  /*
    The rail is chrome, not a panel: no card background and no rule, so the
    board reads as one surface with its icons floating in the gutter.
  */
  return (
    <>
      <nav
        aria-label="Board tools"
        className="flex w-12 shrink-0 flex-col items-center gap-1 py-3"
      >
        <button
          title="Toggle panel"
          aria-label="Toggle panel"
          data-testid="rail-toggle"
          onClick={props.onToggleRail}
          className="kb-focus grid h-[30px] w-[30px] place-items-center rounded-[10px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
        >
          <Icon name="menu" size={16} />
        </button>

        <span className="my-1.5 h-px w-5 bg-[var(--kb-border)]" />

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
          className="kb-focus grid h-[30px] w-[30px] place-items-center rounded-[10px] text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
        >
          <Icon name={props.theme === 'light' ? 'moon' : 'sun'} size={16} />
        </button>
      </nav>

      {/* Same treatment as the task drawer: a card floating in an 8px inset
          rather than a slab bolted to the frame. */}
      {railOpen && panel && (
        <div className="fixed inset-0 z-30">
          <div
            className="absolute inset-0 bg-black/10"
            onClick={props.onClosePanel}
            data-testid="panel-scrim"
          />
          <aside
            className="kb-rise-in-left absolute bottom-2 left-[56px] top-2 flex w-[min(22rem,calc(100vw-4rem))] flex-col overflow-hidden rounded-[var(--kb-r-2xl)] bg-[var(--kb-card)] shadow-[var(--kb-shadow-drawer)]"
            data-testid="side-panel"
          >
            <div className="shrink-0 px-5 pt-5">
              <div className="flex h-[30px] items-center justify-between gap-3">
                <h2 className="text-[14px] font-medium text-kb-label">{PANEL_TITLE[panel]}</h2>
                <button
                  onClick={props.onClosePanel}
                  aria-label="Close panel"
                  data-testid="close-panel"
                  className="kb-focus -mr-1.5 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-kb-muted transition-colors duration-100 hover:bg-[var(--kb-sunken)] hover:text-kb-text"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            </div>

            <div className="kb-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
              {panel === 'filters' && (
                <div className="space-y-5">
                  <div>
                    <GroupLabel>Priority</GroupLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {PRIORITIES.map((p) => (
                        <Chip
                          key={p}
                          active={filters.priorities.includes(p)}
                          testid={`filter-priority-${p}`}
                          onClick={() => togglePriority(p)}
                        >
                          <span className="capitalize">{p}</span>
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <GroupLabel>Agent</GroupLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {AGENT_FILTERS.map((a) => (
                        <Chip
                          key={a}
                          active={filters.agent.includes(a)}
                          testid={`filter-agent-${a}`}
                          onClick={() => toggleAgent(a)}
                        >
                          {a === 'under-review' ? 'Review' : 'Running'}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <GroupLabel>Tag</GroupLabel>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip
                        active={filters.tag === null}
                        onClick={() => props.onFiltersChange({ ...filters, tag: null })}
                      >
                        All
                      </Chip>
                      {allTags.map((t) => (
                        <Chip
                          key={t}
                          active={filters.tag === t}
                          onClick={() => props.onFiltersChange({ ...filters, tag: t })}
                        >
                          {t}
                        </Chip>
                      ))}
                      {allTags.length === 0 && (
                        <span className="text-[12px] text-kb-muted">No tags yet</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2.5 pt-1">
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
                  </div>
                  <button
                    onClick={props.onClearFilters}
                    data-testid="clear-filters"
                    className="kb-btn kb-btn-ghost h-8 px-3 text-[13px] text-kb-accent"
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

/** The panel's section head: the drawer's label, one size down. */
function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[14px] font-medium text-kb-label">{children}</p>;
}

/** A multi-select filter chip: accent fill when on, hairline outline when off. */
function Chip(props: {
  active: boolean;
  onClick: () => void;
  testid?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      data-testid={props.testid}
      aria-pressed={props.active}
      className={`kb-focus h-7 shrink-0 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-100 ${
        props.active
          ? 'kb-accent-bg border-transparent'
          : 'kb-border text-kb-muted hover:bg-[var(--kb-sunken)] hover:text-kb-text'
      }`}
    >
      {props.children}
    </button>
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
        <span className="block h-5 w-9 rounded-full bg-[var(--kb-sunken-strong)] transition-colors duration-100 peer-checked:bg-[var(--kb-accent)]" />
        <span className="kb-focus pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--kb-card)] shadow-[var(--kb-shadow-sm)] transition-transform duration-150 ease-[var(--kb-ease-snap)] peer-checked:translate-x-4" />
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
    <div className="space-y-5">
      <div>
        <GroupLabel>Backup</GroupLabel>
        <div className="flex gap-2">
          <button onClick={props.onExport} className="kb-btn kb-btn-outline h-8 px-3">
            <Icon name="download" size={14} />
            Export
          </button>
          <label className="kb-btn kb-btn-outline h-8 cursor-pointer px-3">
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
        <GroupLabel>Danger zone</GroupLabel>
        <div className="flex flex-col gap-1.5">
          <button onClick={props.onLock} className="kb-btn kb-btn-outline h-8 justify-start px-3">
            <Icon name="lock" size={14} />
            Lock board now
          </button>
          <button onClick={props.onResetDemo} className="kb-btn kb-btn-outline h-8 justify-start px-3">
            <Icon name="undo" size={14} />
            Reset to demo data
          </button>
          <button
            onClick={props.onWipe}
            className="kb-btn kb-btn-danger h-8 justify-start px-3"
          >
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

  return (
    <div>
      <GroupLabel>Password</GroupLabel>
      <input
        type="password"
        value={cur}
        onChange={(e) => setCur(e.target.value)}
        placeholder="Current"
        className="kb-input kb-input-pill mb-1.5"
      />
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
        }}
        placeholder="New (min 8 chars)"
        className="kb-input kb-input-pill"
      />
      {msg && (
        <p className={`mt-1.5 text-[12px] ${ok ? 'kb-ok' : 'kb-danger'}`} role="status">
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
        className="kb-btn kb-btn-primary mt-2.5 h-9 w-full"
      >
        Update password
      </button>
    </div>
  );
}
