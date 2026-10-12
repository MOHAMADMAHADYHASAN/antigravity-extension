export type DiffType = 'upgrade' | 'downgrade' | 'added' | 'removed' | 'unchanged';

export interface DependencyDiff {
  name: string;
  oldVersion: string;
  newVersion: string;
  type: DiffType;
  isMajor: boolean;
  isMinor: boolean;
}

export type DependencyMap = Record<string, string>;

export interface WorkspaceSnapshot {
  timestamp: number;
  filePath: string;
  dependencies: DependencyMap;
}
