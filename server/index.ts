import express from 'express';
import cors from 'cors';
import chokidar from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTopic,
  deleteTopic,
  findDuplicates,
  getCoverageStats,
  getPlanningItems,
  loadTopics,
  syncGraph,
  updateTopic,
  renameCategoryPath,
} from './graph-builder.js';
import {
  createWorkspace,
  ensureWorkspacesReady,
  getWorkspace,
  getWorkspacePaths,
  listWorkspaces,
  WORKSPACES_DIR,
} from './workspace.js';
import { loadLayout, saveLayoutDirection, type LayoutDirection } from './layout-store.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

ensureWorkspacesReady();

const graphCache = new Map<string, ReturnType<typeof syncGraph>>();

function getWorkspaceId(req: express.Request): string {
  const id = (req.query.workspace as string) || (req.headers['x-workspace'] as string) || 'default';
  if (!getWorkspace(id)) {
    return 'default';
  }
  return id;
}

function refresh(workspaceId: string) {
  const graph = syncGraph(workspaceId);
  graphCache.set(workspaceId, graph);
  return graph;
}

function getGraph(workspaceId: string) {
  if (!graphCache.has(workspaceId)) {
    refresh(workspaceId);
  }
  return graphCache.get(workspaceId)!;
}

// Warm up all workspaces
for (const ws of listWorkspaces()) {
  refresh(ws.id);
}

app.get('/api/workspaces', (_req, res) => {
  res.json(listWorkspaces());
});

app.post('/api/workspaces', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: '请填写工作区名称' });
    }
    const ws = createWorkspace(name.trim(), description?.trim());
    refresh(ws.id);
    res.status(201).json(ws);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/graph', (req, res) => {
  const ws = getWorkspaceId(req);
  res.json(getGraph(ws));
});

app.get('/api/topics', (req, res) => {
  const ws = getWorkspaceId(req);
  const topics = loadTopics(ws);
  res.json(topics.map((t) => ({ ...t.meta, filePath: t.filePath })));
});

app.get('/api/topics/:id', (req, res) => {
  const ws = getWorkspaceId(req);
  const topics = loadTopics(ws);
  const topic = topics.find((t) => t.meta.id === req.params.id);
  if (!topic) return res.status(404).json({ error: '未找到主题' });
  res.json(topic);
});

app.post('/api/topics', (req, res) => {
  const ws = getWorkspaceId(req);
  try {
    const topic = createTopic(ws, req.body);
    refresh(ws);
    res.status(201).json(topic.meta);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.put('/api/topics/:id', (req, res) => {
  const ws = getWorkspaceId(req);
  try {
    const topic = updateTopic(ws, req.params.id, req.body);
    refresh(ws);
    res.json(topic);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete('/api/topics/:id', (req, res) => {
  const ws = getWorkspaceId(req);
  try {
    deleteTopic(ws, req.params.id);
    refresh(ws);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.put('/api/paths/rename', (req, res) => {
  const ws = getWorkspaceId(req);
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: '请提供 oldPath 和 newPath' });
    }
    const count = renameCategoryPath(ws, oldPath, newPath);
    refresh(ws);
    res.json({ updatedTopics: count });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/planning', (req, res) => {
  const ws = getWorkspaceId(req);
  const topics = loadTopics(ws);
  res.json(getPlanningItems(topics));
});

app.get('/api/coverage', (req, res) => {
  const ws = getWorkspaceId(req);
  const topics = loadTopics(ws);
  res.json(getCoverageStats(ws, topics));
});

app.get('/api/duplicates', (req, res) => {
  const ws = getWorkspaceId(req);
  const topics = loadTopics(ws);
  res.json(findDuplicates(topics));
});

app.get('/api/taxonomy', (req, res) => {
  const ws = getWorkspaceId(req);
  const { taxonomyPath } = getWorkspacePaths(ws);
  if (!fs.existsSync(taxonomyPath)) return res.type('text/yaml').send('');
  const raw = fs.readFileSync(taxonomyPath, 'utf-8');
  res.type('text/yaml').send(raw);
});

app.get('/api/taxonomy/paths', (req, res) => {
  const ws = getWorkspaceId(req);
  const topics = loadTopics(ws);
  const graph = getGraph(ws);
  const fromTopics = new Set(topics.flatMap((t) => t.meta.paths));
  const fromGraph = graph.nodes
    .filter((n) => n.type === 'category')
    .map((n) => n.id.replace(/^cat:/, ''));
  const paths = [...new Set([...fromTopics, ...fromGraph])].sort();
  res.json(paths);
});

app.post('/api/sync', (req, res) => {
  const ws = getWorkspaceId(req);
  const graph = refresh(ws);
  res.json(graph);
});

app.get('/api/layout', (req, res) => {
  const ws = getWorkspaceId(req);
  res.json(loadLayout(ws));
});

app.put('/api/layout', (req, res) => {
  const ws = getWorkspaceId(req);
  const { direction } = req.body as { direction?: LayoutDirection };
  const valid: LayoutDirection[] = ['TB', 'BT', 'LR', 'RL'];
  if (!direction || !valid.includes(direction)) {
    return res.status(400).json({ error: 'direction 必须是 TB | BT | LR | RL' });
  }
  res.json(saveLayoutDirection(ws, direction));
});

interface SseClient {
  res: express.Response;
  workspaceId: string;
}

const sseClients = new Set<SseClient>();

app.get('/api/events', (req, res) => {
  const workspaceId = getWorkspaceId(req);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('data: connected\n\n');
  const client: SseClient = { res, workspaceId };
  sseClients.add(client);
  req.on('close', () => sseClients.delete(client));
});

function broadcast(workspaceId: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (client.workspaceId === workspaceId) {
      client.res.write(payload);
    }
  }
}

function detectWorkspaceFromPath(filePath: string): string | null {
  const rel = path.relative(WORKSPACES_DIR, filePath);
  const parts = rel.split(path.sep);
  if (parts.length > 0 && parts[0] && !parts[0].startsWith('.')) {
    return parts[0];
  }
  return null;
}

const watcher = chokidar.watch(
  [
    path.join(WORKSPACES_DIR, '*', 'topics', '*.md'),
    path.join(WORKSPACES_DIR, '*', 'taxonomy.yaml'),
  ],
  {
    ignoreInitial: true,
    persistent: true,
    ignorePermissionErrors: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  },
);

watcher.on('error', (error) => {
  console.error('[watcher] 文件监听异常（服务继续运行）:', error.message);
});

watcher.on('all', (_event, filePath) => {
  const ws = detectWorkspaceFromPath(filePath);
  if (!ws) return;
  const graph = refresh(ws);
  broadcast(ws, 'graph-updated', { updatedAt: graph.updatedAt, nodeCount: graph.nodes.length, workspace: ws });
});

const server = app.listen(PORT, () => {
  console.log(`Blog Planner API running at http://localhost:${PORT}`);
  console.log(`Workspaces: ${WORKSPACES_DIR}`);
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down...`);

  for (const client of sseClients) {
    client.res.end();
  }
  sseClients.clear();

  watcher.close().catch(() => {});

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
