import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  description?: string;
  created: string;
}

export interface WorkspacePaths {
  id: string;
  root: string;
  topicsDir: string;
  taxonomyPath: string;
  graphPath: string;
  metaPath: string;
}

export const WORKSPACES_DIR = path.join(ROOT, 'workspaces');

const DEFAULT_TAXONOMY = `# 层级结构（可选）
# 思维导图只显示有主题的分类；这里用于「覆盖度」页面的规划
{}
`;

export function getWorkspacePaths(workspaceId: string): WorkspacePaths {
  const root = path.join(WORKSPACES_DIR, workspaceId);
  return {
    id: workspaceId,
    root,
    topicsDir: path.join(root, 'topics'),
    taxonomyPath: path.join(root, 'taxonomy.yaml'),
    graphPath: path.join(root, 'graph.json'),
    metaPath: path.join(root, 'workspace.yaml'),
  };
}

function readWorkspaceMeta(paths: WorkspacePaths): WorkspaceMeta | null {
  if (!fs.existsSync(paths.metaPath)) return null;
  const raw = yaml.load(fs.readFileSync(paths.metaPath, 'utf-8')) as Record<string, unknown>;
  return {
    id: paths.id,
    name: (raw.name as string) || paths.id,
    description: raw.description as string | undefined,
    created: (raw.created as string) || new Date().toISOString().slice(0, 10),
  };
}

export function ensureWorkspacesReady() {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

  const legacyTopics = path.join(ROOT, 'topics');
  const legacyTaxonomy = path.join(ROOT, 'taxonomy.yaml');
  const defaultPaths = getWorkspacePaths('default');

  if (fs.existsSync(legacyTopics) && !fs.existsSync(defaultPaths.root)) {
    fs.mkdirSync(defaultPaths.root, { recursive: true });
    fs.renameSync(legacyTopics, defaultPaths.topicsDir);
    if (fs.existsSync(legacyTaxonomy)) {
      fs.renameSync(legacyTaxonomy, defaultPaths.taxonomyPath);
    }
    const legacyGraph = path.join(ROOT, 'graph.json');
    if (fs.existsSync(legacyGraph)) {
      fs.renameSync(legacyGraph, defaultPaths.graphPath);
    }
    fs.writeFileSync(
      defaultPaths.metaPath,
      yaml.dump({
        id: 'default',
        name: '默认工作区',
        description: '从旧版迁移的内容',
        created: new Date().toISOString().slice(0, 10),
      }, { lineWidth: -1 }),
      'utf-8',
    );
  }

  if (!fs.existsSync(defaultPaths.root)) {
    createWorkspace('默认工作区', '默认博客规划');
  }
}

export function listWorkspaces(): WorkspaceMeta[] {
  ensureWorkspacesReady();
  if (!fs.existsSync(WORKSPACES_DIR)) return [];

  const dirs = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const workspaces: WorkspaceMeta[] = [];
  for (const id of dirs) {
    const paths = getWorkspacePaths(id);
    const meta = readWorkspaceMeta(paths);
    workspaces.push(
      meta ?? {
        id,
        name: id,
        created: new Date().toISOString().slice(0, 10),
      },
    );
  }

  return workspaces.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export function workspaceExists(workspaceId: string): boolean {
  return fs.existsSync(getWorkspacePaths(workspaceId).root);
}

export function createWorkspace(name: string, description?: string): WorkspaceMeta {
  ensureWorkspacesReady();
  const id = slugify(name);
  if (!id) throw new Error('工作区名称无效');

  const paths = getWorkspacePaths(id);
  if (fs.existsSync(paths.root)) {
    throw new Error(`工作区「${name}」已存在`);
  }

  fs.mkdirSync(paths.topicsDir, { recursive: true });
  fs.writeFileSync(paths.taxonomyPath, DEFAULT_TAXONOMY, 'utf-8');

  const meta: WorkspaceMeta = {
    id,
    name,
    description,
    created: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(paths.metaPath, yaml.dump(meta, { lineWidth: -1 }), 'utf-8');

  return meta;
}

export function getWorkspace(workspaceId: string): WorkspaceMeta | null {
  if (!workspaceExists(workspaceId)) return null;
  const paths = getWorkspacePaths(workspaceId);
  return readWorkspaceMeta(paths) ?? { id: workspaceId, name: workspaceId, created: '' };
}

export function resolveWorkspaceId(id?: string): string {
  ensureWorkspacesReady();
  const ws = id || 'default';
  if (!workspaceExists(ws)) {
    throw new Error(`工作区 "${ws}" 不存在`);
  }
  return ws;
}
