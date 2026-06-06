import { syncGraph } from './graph-builder.js';
import { ensureWorkspacesReady, listWorkspaces } from './workspace.js';

ensureWorkspacesReady();

const ws = process.argv[2];
if (ws) {
  const graph = syncGraph(ws);
  console.log(`[${ws}] Graph synced: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
} else {
  for (const workspace of listWorkspaces()) {
    const graph = syncGraph(workspace.id);
    console.log(`[${workspace.id}] ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  }
}
