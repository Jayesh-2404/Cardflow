export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null; // ISO yyyy-mm-dd
  tags: string[];
  archived: boolean;
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
}

export const DEFAULT_FILTERS: FilterState = {
  query: '',
  priorities: [],
  tag: null,
  overdueOnly: false,
  showArchived: false,
};
