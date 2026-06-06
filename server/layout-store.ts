import fs from 'node:fs';
import { getWorkspacePaths, resolveWorkspaceId } from './workspace.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface GraphLayout {
  version: 1;
  direction: LayoutDirection;
  nodes: Record<string, { x: number; y: number }>;
  updatedAt?: string;
}

const DEFAULT_LAYOUT: GraphLayout = {
  version: 1,
  direction: 'TB',
  nodes: {},
};

function layoutPath(workspaceId: string): string {
  return `${getWorkspacePaths(resolveWorkspaceId(workspaceId)).root}/layout.json`;
}

export function loadLayout(workspaceId: string): GraphLayout {
  const file = layoutPath(workspaceId);
  if (!fs.existsSync(file)) return { ...DEFAULT_LAYOUT };

  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<GraphLayout>;
    return {
      version: 1,
      direction: raw.direction ?? 'TB',
      nodes: raw.nodes ?? {},
      updatedAt: raw.updatedAt,
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveLayoutDirection(workspaceId: string, direction: LayoutDirection): GraphLayout {
  const ws = resolveWorkspaceId(workspaceId);
  const layout = loadLayout(ws);
  layout.direction = direction;
  layout.updatedAt = new Date().toISOString();
  fs.writeFileSync(layoutPath(ws), JSON.stringify(layout, null, 2), 'utf-8');
  return layout;
}
