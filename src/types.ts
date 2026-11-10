export type Priority = 'low' | 'medium' | 'high';

export type ColumnKind = 'todo' | 'active' | 'review' | 'done';

export type AgentState = 'idle' | 'running' | 'under-review' | 'completed';

export type RunStatus =
  | 'claimed'
  | 'running'
  | 'review'
  | 'completed'
  | 'failed'
  | 'abandoned';

export interface TaskRun {
  id: string;
  status: RunStatus;
  runner: string;
  model: string | null;
  branch: string | null;
  worktree: string | null;
  prUrl: string | null;
  prNumber: number | null;
  startedAt: number;
  heartbeatAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
  error: string | null;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  rootPath: string;
}

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null; // ISO yyyy-mm-dd
  tags: string[];
  archived: boolean;
  projectKey: string;
  agentState: AgentState;
  gitEnabled: boolean;
  branch: string | null;
  lastCommit: string | null;
  run: TaskRun | null;
  createdAt: number;
  updatedAt: number;
}

export interface Column {
  id: string;
  title: string;
  kind: ColumnKind;
  createdAt: number;
}

export interface BoardState {
  columns: Column[];
  tasks: Task[];
}

export interface FilterState {
  query: string;
  priorities: Priority[];
  tag: string | null;
  overdueOnly: boolean;
  showArchived: boolean;
  agent: AgentState[];
}

export const DEFAULT_FILTERS: FilterState = {
  query: '',
  priorities: [],
  tag: null,
  overdueOnly: false,
  showArchived: false,
  agent: [],
};
