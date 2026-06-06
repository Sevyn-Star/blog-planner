import { findDuplicates, loadTopics } from './graph-builder.js';
import { ensureWorkspacesReady, listWorkspaces } from './workspace.js';

ensureWorkspacesReady();

const ws = process.argv[2];
const workspaces = ws ? [{ id: ws }] : listWorkspaces();

for (const workspace of workspaces) {
  const topics = loadTopics(workspace.id);
  const warnings = findDuplicates(topics);

  console.log(`\n=== 工作区: ${workspace.id} ===`);
  if (warnings.length === 0) {
    console.log('未发现重复或相似主题。');
  } else {
    console.log(`发现 ${warnings.length} 条警告:\n`);
    for (const w of warnings) {
      console.log(`  [${(w.score * 100).toFixed(0)}%] ${w.titleA} ↔ ${w.titleB}`);
      console.log(`         原因: ${w.reason}\n`);
    }
  }
}
