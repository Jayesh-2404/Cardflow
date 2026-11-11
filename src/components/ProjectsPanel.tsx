import { useEffect, useState } from 'react';
import Icon from './Icon';
import { ApiError, api } from '../lib/api';
import type { Project } from '../types';

/**
 * The shared default root for each project key. The MCP checks the path on the
 * machine that runs the agent; server/project-roots.json wins there when two
 * laptops need different checkouts for the same key.
 */
export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');

  async function load() {
    setLoading(true);
    try {
      setProjects(await api.projects());
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function reset() {
    setEditingId(null);
    setKey('');
    setName('');
    setRootPath('');
    setError('');
  }

  function edit(project: Project) {
    setEditingId(project.id);
    setKey(project.key);
    setName(project.name);
    setRootPath(project.rootPath);
    setError('');
  }

  async function save() {
    if (!key.trim() || !rootPath.trim()) {
      setError('Key and root path are required.');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await api.updateProject(editingId, { name: name.trim(), rootPath: rootPath.trim() });
      } else {
        await api.createProject({
          key: key.trim().toLowerCase(),
          name: name.trim(),
          rootPath: rootPath.trim(),
        });
      }
      reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that project.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(project: Project) {
    if (!window.confirm(`Remove project "${project.key}"? Cards keep the key but the agent cannot open it.`)) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      if (editingId === project.id) reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that project.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-[13px]">
      <p className="leading-relaxed text-kb-muted">
        The agent opens this path on the machine running it. Use{' '}
        <span className="font-mono-kb text-kb-text">server/project-roots.json</span> when two
        computers need different checkouts for the same key.
      </p>

      {error && (
        <p role="alert" className="text-[12.5px] text-kb-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-kb-muted">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-kb-muted">No project roots yet. Add one below, then give a card that key.</p>
      ) : (
        <ul className="space-y-2" data-testid="project-list">
          {projects.map((project) => (
            <li
              key={project.id}
              data-testid="project-row"
              className="rounded-[var(--kb-r-lg)] border kb-border p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono-kb truncate text-[12.5px] text-kb-text">
                    {project.key}
                    {project.name && <span className="ml-2 text-kb-muted">{project.name}</span>}
                  </p>
                  <p
                    className="font-mono-kb mt-0.5 truncate text-[11.5px] text-kb-faint"
                    title={project.rootPath}
                  >
                    {project.rootPath}
                  </p>
                </div>
                <span className="flex shrink-0 gap-1">
                  <button
                    onClick={() => edit(project)}
                    title="Edit project"
                    aria-label={`Edit ${project.key}`}
                    data-testid="project-edit"
                    className="kb-focus grid h-7 w-7 place-items-center rounded-full text-kb-muted hover:bg-[var(--kb-sunken)] hover:text-kb-text"
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    onClick={() => void remove(project)}
                    title="Remove project"
                    aria-label={`Remove ${project.key}`}
                    data-testid="project-delete"
                    className="kb-focus grid h-7 w-7 place-items-center rounded-full text-kb-muted hover:bg-[var(--kb-danger-soft)] hover:text-kb-danger"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t kb-border pt-3" data-testid="project-form">
        <p className="text-[14px] font-medium text-kb-label">
          {editingId ? 'Edit project' : 'Add project'}
        </p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase())}
          disabled={Boolean(editingId)}
          placeholder="zex"
          aria-label="Project key"
          data-testid="project-key"
          className="kb-input kb-input-pill font-mono-kb"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name (optional)"
          aria-label="Project name"
          data-testid="project-name"
          className="kb-input kb-input-pill"
        />
        <input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="C:/Users/you/projects/zex"
          aria-label="Project root path"
          data-testid="project-root"
          className="kb-input kb-input-pill font-mono-kb"
        />
        <div className="flex gap-2">
          <button
            onClick={() => void save()}
            disabled={busy || !key.trim() || !rootPath.trim()}
            data-testid="project-save"
            className="kb-btn kb-btn-primary h-8 flex-1"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {editingId && (
            <button onClick={reset} disabled={busy} className="kb-btn kb-btn-ghost h-8">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
