export interface WorkspaceMeta {
  id: string;
  name: string;
  description?: string;
  created: string;
}

const STORAGE_KEY = 'blog-planner-workspace';

let currentWorkspace = typeof localStorage !== 'undefined'
  ? localStorage.getItem(STORAGE_KEY) || 'default'
  : 'default';

export function getWorkspaceId(): string {
  return currentWorkspace;
}

export function setWorkspaceId(id: string): void {
  currentWorkspace = id;
  localStorage.setItem(STORAGE_KEY, id);
}

function wsUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `/api${path}${sep}workspace=${encodeURIComponent(currentWorkspace)}`;
}

export async function fetchWorkspaces(): Promise<WorkspaceMeta[]> {
  try {
    const res = await fetch('/api/workspaces');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function createWorkspace(name: string, description?: string): Promise<WorkspaceMeta> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '创建工作区失败');
  }
  return res.json();
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'category' | 'topic' | 'outline';
  status?: 'idea' | 'outline' | 'draft' | 'published';
  topicType?: 'topic' | 'series' | 'pillar';
  created?: string;
  published?: string;
  planned_date?: string;
  priority?: number;
  tags?: string[];
  filePath?: string;
  parentTopicId?: string;
  outlineLevel?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'hierarchy' | 'link';
  relation?: string;
}

export interface ContentGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

export interface TopicSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  created?: string;
  published?: string;
  paths: string[];
  tags: string[];
  priority?: number;
  planned_date?: string;
  filePath: string;
}

export interface TopicDetail {
  meta: TopicSummary & {
    links?: { id: string; relation: string }[];
    blocked_by?: string[];
    updated?: string;
  };
  content: string;
  filePath: string;
}

export interface PlanningItem {
  id: string;
  title: string;
  status: string;
  priority: number;
  planned_date?: string;
  paths: string[];
  blocked_by?: string[];
}

export interface CoverageStat {
  path: string;
  idea: number;
  outline: number;
  draft: number;
  published: number;
  total: number;
}

export interface DuplicateWarning {
  topicA: string;
  topicB: string;
  titleA: string;
  titleB: string;
  reason: string;
  score: number;
}

export type View = 'graph' | 'planning' | 'timeline' | 'coverage' | 'new';

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

export async function fetchLayout(): Promise<GraphLayout> {
  try {
    const res = await fetch(wsUrl('/layout'));
    if (!res.ok) return { ...DEFAULT_LAYOUT };
    return res.json();
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export async function saveLayoutDirection(direction: LayoutDirection): Promise<void> {
  const res = await fetch(wsUrl('/layout'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '保存布局失败');
  }
}

export async function fetchGraph(): Promise<ContentGraph> {
  const res = await fetch(wsUrl('/graph'));
  if (!res.ok) throw new Error('无法连接后端 API，请确认 npm run dev 已启动');
  return res.json();
}

export async function fetchTopics(): Promise<TopicSummary[]> {
  const res = await fetch(wsUrl('/topics'));
  return res.json();
}

export async function fetchTopic(id: string): Promise<TopicDetail> {
  const res = await fetch(wsUrl(`/topics/${id}`));
  if (!res.ok) throw new Error('加载主题失败');
  return res.json();
}

export async function updateTopic(
  id: string,
  data: {
    title?: string;
    status?: string;
    paths?: string[];
    tags?: string[];
    priority?: number;
    planned_date?: string;
    blocked_by?: string[];
    published?: string;
    content?: string;
  },
): Promise<void> {
  const res = await fetch(wsUrl(`/topics/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '保存失败');
  }
}

export async function deleteTopic(id: string): Promise<void> {
  const res = await fetch(wsUrl(`/topics/${id}`), { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '删除失败');
  }
}

export async function fetchPlanning(): Promise<PlanningItem[]> {
  const res = await fetch(wsUrl('/planning'));
  return res.json();
}

export async function fetchCoverage(): Promise<CoverageStat[]> {
  const res = await fetch(wsUrl('/coverage'));
  return res.json();
}

export async function fetchDuplicates(): Promise<DuplicateWarning[]> {
  const res = await fetch(wsUrl('/duplicates'));
  return res.json();
}

export async function fetchTaxonomyPaths(): Promise<string[]> {
  const res = await fetch(wsUrl('/taxonomy/paths'));
  return res.json();
}

export async function createTopic(data: {
  title: string;
  paths: string[];
  status?: string;
  tags?: string[];
  priority?: number;
  planned_date?: string;
}): Promise<void> {
  const res = await fetch(wsUrl('/topics'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '创建失败');
  }
}

export async function renameCategoryPath(oldPath: string, newPath: string): Promise<void> {
  const res = await fetch(wsUrl('/paths/rename'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '重命名失败');
  }
}

export function subscribeToUpdates(onUpdate: () => void): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource(wsUrl('/events'));
    es.addEventListener('graph-updated', () => onUpdate());
    es.onerror = () => {
      es?.close();
      es = null;
    };
  } catch {
    // 后端未启动时静默忽略
  }
  return () => es?.close();
}

export const STATUS_LABELS: Record<string, string> = {
  idea: '想法',
  outline: '大纲',
  draft: '草稿',
  published: '已发布',
};

export const STATUS_COLORS: Record<string, string> = {
  idea: '#94a3b8',
  outline: '#f59e0b',
  draft: '#3b82f6',
  published: '#22c55e',
};

export const STATUS_OPTIONS = [
  { value: 'idea', label: '想法', icon: '💡', color: STATUS_COLORS.idea },
  { value: 'outline', label: '大纲', icon: '📝', color: STATUS_COLORS.outline },
  { value: 'draft', label: '草稿', icon: '✏️', color: STATUS_COLORS.draft },
  { value: 'published', label: '已发布', icon: '✅', color: STATUS_COLORS.published },
] as const;
