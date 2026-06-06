export interface TopicMeta {
  id: string;
  title: string;
  type: 'topic' | 'series' | 'pillar';
  status: 'idea' | 'outline' | 'draft' | 'published';
  created?: string;
  published?: string;
  updated?: string;
  paths: string[];
  links: TopicLink[];
  tags: string[];
  priority?: number;
  planned_date?: string;
  blocked_by?: string[];
}

export interface TopicLink {
  id: string;
  relation: 'related' | 'prerequisite' | 'sequel' | 'contrast';
}

export interface Topic {
  meta: TopicMeta;
  content: string;
  filePath: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'category' | 'topic';
  status?: TopicMeta['status'];
  topicType?: TopicMeta['type'];
  created?: string;
  published?: string;
  planned_date?: string;
  priority?: number;
  tags?: string[];
  filePath?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'hierarchy' | 'link';
  relation?: TopicLink['relation'];
}

export interface ContentGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

export interface DuplicateWarning {
  topicA: string;
  topicB: string;
  titleA: string;
  titleB: string;
  reason: string;
  score: number;
}

export interface PlanningItem {
  id: string;
  title: string;
  status: TopicMeta['status'];
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
