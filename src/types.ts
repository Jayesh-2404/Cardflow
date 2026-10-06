export type Priority = 'low' | 'medium' | 'high';

export type AgentState = 'idle' | 'running' | 'under-review' | 'completed';

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
  createdAt: number;
  updatedAt: number;
}

export interface Column {
  id: string;
  title: string;
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
