import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import type {
  ContentGraph,
  CoverageStat,
  DuplicateWarning,
  GraphEdge,
  GraphNode,
  PlanningItem,
  Topic,
  TopicLink,
  TopicMeta,
} from './types.js';
import { getWorkspacePaths, resolveWorkspaceId } from './workspace.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseWikiLinks(content: string): TopicLink[] {
  const links: TopicLink[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(WIKI_LINK_RE)) {
    const id = slugify(match[1]);
    if (!seen.has(id)) {
      seen.add(id);
      links.push({ id, relation: 'related' });
    }
  }
  return links;
}

function normalizeMeta(raw: Record<string, unknown>, filePath: string): TopicMeta {
  const fileBase = path.basename(filePath, '.md');
  const id = (raw.id as string) || fileBase;
  const paths = Array.isArray(raw.paths) ? (raw.paths as string[]) : [];
  const links = Array.isArray(raw.links) ? (raw.links as TopicLink[]) : [];
  const tags = Array.isArray(raw.tags) ? (raw.tags as string[]) : [];

  return {
    id,
    title: (raw.title as string) || id,
    type: (raw.type as TopicMeta['type']) || 'topic',
    status: (raw.status as TopicMeta['status']) || 'idea',
    created: raw.created as string | undefined,
    published: raw.published as string | undefined,
    updated: raw.updated as string | undefined,
    paths,
    links,
    tags,
    priority: raw.priority as number | undefined,
    planned_date: raw.planned_date as string | undefined,
    blocked_by: raw.blocked_by as string[] | undefined,
  };
}

export function loadTopics(workspaceId: string): Topic[] {
  const ws = resolveWorkspaceId(workspaceId);
  const { topicsDir } = getWorkspacePaths(ws);

  if (!fs.existsSync(topicsDir)) {
    fs.mkdirSync(topicsDir, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(topicsDir).filter((f) => f.endsWith('.md'));
  const topics: Topic[] = [];

  for (const file of files) {
    const filePath = path.join(topicsDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);
    const meta = normalizeMeta(data as Record<string, unknown>, filePath);

    const wikiLinks = parseWikiLinks(content);
    const existingIds = new Set(meta.links.map((l) => l.id));
    for (const link of wikiLinks) {
      if (!existingIds.has(link.id)) {
        meta.links.push(link);
      }
    }

    topics.push({ meta, content, filePath });
  }

  return topics;
}

function loadTaxonomyPaths(workspaceId: string): string[] {
  const { taxonomyPath } = getWorkspacePaths(resolveWorkspaceId(workspaceId));
  if (!fs.existsSync(taxonomyPath)) return [];

  const raw = yaml.load(fs.readFileSync(taxonomyPath, 'utf-8')) as Record<string, unknown>;
  const paths: string[] = [];

  function walk(obj: unknown, prefix: string[] = []) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        paths.push([...prefix, String(item)].join('/'));
      }
      return;
    }
    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        walk(value, [...prefix, key]);
      }
    }
  }

  walk(raw);
  return paths;
}

function ensureCategoryNodes(nodes: Map<string, GraphNode>, categoryPath: string) {
  const parts = categoryPath.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const id = `cat:${current}`;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label: part,
        type: 'category',
      });
    }
  }
}

function ensureCategoryHierarchyEdges(
  categoryPath: string,
  edges: GraphEdge[],
  edgeSet: Set<string>,
) {
  const parts = categoryPath.split('/');
  for (let i = 1; i < parts.length; i++) {
    const parentPath = parts.slice(0, i).join('/');
    const childPath = parts.slice(0, i + 1).join('/');
    const edgeId = `cat:${parentPath}->cat:${childPath}`;
    if (!edgeSet.has(edgeId)) {
      edgeSet.add(edgeId);
      edges.push({
        id: edgeId,
        source: `cat:${parentPath}`,
        target: `cat:${childPath}`,
        type: 'hierarchy',
      });
    }
  }
}

export function buildGraph(workspaceId: string, topics: Topic[]): ContentGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  // 只从实际主题的路径生成导图节点，不展示 taxonomy 里无内容的占位分类
  for (const topic of topics) {
    const { meta } = topic;
    nodes.set(meta.id, {
      id: meta.id,
      label: meta.title,
      type: 'topic',
      status: meta.status,
      topicType: meta.type,
      created: meta.created,
      published: meta.published,
      planned_date: meta.planned_date,
      priority: meta.priority,
      tags: meta.tags,
      filePath: topic.filePath,
    });

    for (const p of meta.paths) {
      ensureCategoryNodes(nodes, p);
      ensureCategoryHierarchyEdges(p, edges, edgeSet);
      const parentId = `cat:${p}`;
      const edgeId = `${parentId}->${meta.id}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: parentId,
          target: meta.id,
          type: 'hierarchy',
        });
      }
    }
  }

  const topicIds = new Set(topics.map((t) => t.meta.id));
  for (const topic of topics) {
    for (const link of topic.meta.links) {
      if (!topicIds.has(link.id)) continue;
      const edgeId = `${topic.meta.id}->${link.id}:${link.relation}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: topic.meta.id,
          target: link.id,
          type: 'link',
          relation: link.relation,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    updatedAt: new Date().toISOString(),
  };
}

function titleSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().replace(/\s+/g, '');
  const nb = b.toLowerCase().replace(/\s+/g, '');
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  const setA = new Set(na.split(''));
  const setB = new Set(nb.split(''));
  const intersection = [...setA].filter((c) => setB.has(c)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function findDuplicates(topics: Topic[]): DuplicateWarning[] {
  const warnings: DuplicateWarning[] = [];

  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      const a = topics[i].meta;
      const b = topics[j].meta;

      const score = titleSimilarity(a.title, b.title);
      if (score >= 0.6) {
        warnings.push({
          topicA: a.id,
          topicB: b.id,
          titleA: a.title,
          titleB: b.title,
          reason: '标题相似',
          score,
        });
        continue;
      }

      const sharedPaths = a.paths.filter((p) => b.paths.includes(p));
      if (sharedPaths.length > 0 && a.status === 'published' && b.status !== 'published') {
        warnings.push({
          topicA: a.id,
          topicB: b.id,
          titleA: a.title,
          titleB: b.title,
          reason: `同路径「${sharedPaths[0]}」下已有已发布主题`,
          score: 0.7,
        });
      }

      const sharedTags = a.tags.filter((t) => b.tags.includes(t));
      if (sharedTags.length >= 2) {
        warnings.push({
          topicA: a.id,
          topicB: b.id,
          titleA: a.title,
          titleB: b.title,
          reason: `标签重叠: ${sharedTags.join(', ')}`,
          score: 0.5,
        });
      }
    }
  }

  return warnings.sort((x, y) => y.score - x.score);
}

export function getPlanningItems(topics: Topic[]): PlanningItem[] {
  return topics
    .filter((t) => t.meta.status !== 'published')
    .map((t) => ({
      id: t.meta.id,
      title: t.meta.title,
      status: t.meta.status,
      priority: t.meta.priority ?? 99,
      planned_date: t.meta.planned_date,
      paths: t.meta.paths,
      blocked_by: t.meta.blocked_by,
    }))
    .sort((a, b) => a.priority - b.priority || (a.planned_date ?? '').localeCompare(b.planned_date ?? ''));
}

export function getCoverageStats(workspaceId: string, topics: Topic[]): CoverageStat[] {
  const stats = new Map<string, CoverageStat>();

  for (const catPath of loadTaxonomyPaths(workspaceId)) {
    stats.set(catPath, {
      path: catPath,
      idea: 0,
      outline: 0,
      draft: 0,
      published: 0,
      total: 0,
    });
  }

  for (const topic of topics) {
    for (const p of topic.meta.paths) {
      if (!stats.has(p)) {
        stats.set(p, { path: p, idea: 0, outline: 0, draft: 0, published: 0, total: 0 });
      }
      const stat = stats.get(p)!;
      stat[topic.meta.status]++;
      stat.total++;
    }
  }

  return Array.from(stats.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export function syncGraph(workspaceId: string): ContentGraph {
  const ws = resolveWorkspaceId(workspaceId);
  const topics = loadTopics(ws);
  const graph = buildGraph(ws, topics);
  const { graphPath } = getWorkspacePaths(ws);
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
  return graph;
}

export function createTopic(
  workspaceId: string,
  data: Partial<TopicMeta> & { title: string; content?: string },
): Topic {
  const ws = resolveWorkspaceId(workspaceId);
  const { topicsDir } = getWorkspacePaths(ws);
  const id = data.id || slugify(data.title);
  const filePath = path.join(topicsDir, `${id}.md`);
  if (fs.existsSync(filePath)) {
    throw new Error(`主题 "${id}" 已存在`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const meta: TopicMeta = {
    id,
    title: data.title,
    type: data.type || 'topic',
    status: data.status || 'idea',
    created: today,
    paths: data.paths || [],
    links: data.links || [],
    tags: data.tags || [],
    priority: data.priority,
    planned_date: data.planned_date,
    blocked_by: data.blocked_by,
  };

  const frontmatter = yaml.dump(meta, { lineWidth: -1 });
  const content = data.content || `# ${data.title}\n\n`;
  const file = `---\n${frontmatter}---\n\n${content}`;

  fs.mkdirSync(topicsDir, { recursive: true });
  fs.writeFileSync(filePath, file, 'utf-8');

  return { meta, content, filePath };
}

export function updateTopic(
  workspaceId: string,
  id: string,
  data: Partial<Omit<TopicMeta, 'id'>> & { content?: string },
): Topic {
  const topics = loadTopics(workspaceId);
  const existing = topics.find((t) => t.meta.id === id);
  if (!existing) {
    throw new Error(`主题 "${id}" 未找到`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const meta: TopicMeta = {
    ...existing.meta,
    title: data.title ?? existing.meta.title,
    type: data.type ?? existing.meta.type,
    status: data.status ?? existing.meta.status,
    paths: data.paths ?? existing.meta.paths,
    links: data.links ?? existing.meta.links,
    tags: data.tags ?? existing.meta.tags,
    priority: data.priority ?? existing.meta.priority,
    planned_date: data.planned_date ?? existing.meta.planned_date,
    blocked_by: data.blocked_by ?? existing.meta.blocked_by,
    created: existing.meta.created,
    published: data.published ?? existing.meta.published,
    updated: today,
  };

  if (meta.status === 'published' && !meta.published) {
    meta.published = today;
  }

  const frontmatter = yaml.dump(meta, { lineWidth: -1 });
  const content = data.content ?? existing.content;
  const file = `---\n${frontmatter}---\n\n${content}`;

  fs.writeFileSync(existing.filePath, file, 'utf-8');

  return { meta, content, filePath: existing.filePath };
}

function renameInTaxonomyFile(workspaceId: string, oldPath: string, newPath: string) {
  const { taxonomyPath } = getWorkspacePaths(resolveWorkspaceId(workspaceId));
  if (!fs.existsSync(taxonomyPath)) return;

  const raw = yaml.load(fs.readFileSync(taxonomyPath, 'utf-8'));
  if (!raw || typeof raw !== 'object') return;

  const oldParts = oldPath.split('/');
  const newParts = newPath.split('/');
  if (oldParts.length !== newParts.length) return;

  let node: unknown = raw;
  for (let i = 0; i < oldParts.length - 1; i++) {
    if (!node || typeof node !== 'object') return;
    node = (node as Record<string, unknown>)[oldParts[i]];
  }

  const lastOld = oldParts[oldParts.length - 1];
  const lastNew = newParts[newParts.length - 1];
  if (lastOld === lastNew) return;

  if (Array.isArray(node)) {
    const idx = node.indexOf(lastOld);
    if (idx >= 0) node[idx] = lastNew;
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (lastOld in obj) {
      obj[lastNew] = obj[lastOld];
      delete obj[lastOld];
    }
  }

  fs.writeFileSync(taxonomyPath, yaml.dump(raw, { lineWidth: -1 }), 'utf-8');
}

export function renameCategoryPath(workspaceId: string, oldPath: string, newPath: string): number {
  const trimmedOld = oldPath.trim();
  const trimmedNew = newPath.trim();
  if (!trimmedOld || !trimmedNew) throw new Error('路径不能为空');
  if (trimmedOld === trimmedNew) return 0;

  const ws = resolveWorkspaceId(workspaceId);
  let updatedTopics = 0;

  for (const topic of loadTopics(ws)) {
    const newPaths = topic.meta.paths.map((p) => {
      if (p === trimmedOld) return trimmedNew;
      if (p.startsWith(`${trimmedOld}/`)) return trimmedNew + p.slice(trimmedOld.length);
      return p;
    });
    if (JSON.stringify(newPaths) !== JSON.stringify(topic.meta.paths)) {
      updateTopic(ws, topic.meta.id, { paths: newPaths });
      updatedTopics++;
    }
  }

  renameInTaxonomyFile(ws, trimmedOld, trimmedNew);
  return updatedTopics;
}

export { ROOT, slugify };
