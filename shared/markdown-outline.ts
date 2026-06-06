export interface OutlineNode {
  label: string;
  level: number;
  lineIndex: number;
  prefix: string;
  sourceLine?: string;
  children: OutlineNode[];
}

function stripInlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function isTableSeparator(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function parseTableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => stripInlineMd(c));
}

function findColIndex(header: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const idx = header.findIndex((h) => p.test(h.trim()));
    if (idx >= 0) return idx;
  }
  return -1;
}

function tableCell(cells: string[], idx: number): string | null {
  if (idx < 0 || idx >= cells.length) return null;
  const v = stripInlineMd(cells[idx]);
  if (!v || v === '-') return null;
  return v;
}

function tableRowLabel(header: string[] | null, cells: string[]): string {
  const c = cells.map(stripInlineMd).filter((cell) => cell && cell !== '-');
  if (!c.length) return '（空行）';

  if (header) {
    const qidIdx = findColIndex(header, [/qid/i, /编号/, /^id$/i]);
    const questionIdx = findColIndex(header, [/核心问题/, /^问题$/, /主题/, /名称/, /模块/]);
    const statusIdx = findColIndex(header, [/状态/, /完成/]);
    const dateIdx = findColIndex(header, [/日期/, /时间/, /date/i]);
    const summaryIdx = findColIndex(header, [/标题摘要/, /^摘要$/, /标题/]);
    const slugIdx = findColIndex(header, [/slug/i]);

    const parts: string[] = [];
    const push = (idx: number) => {
      const v = tableCell(cells, idx);
      if (v) parts.push(v);
    };

    push(qidIdx);
    push(questionIdx);
    if (!parts.length && c[0]) parts.push(c[0]);
    push(statusIdx);
    push(dateIdx);
    const summary = tableCell(cells, summaryIdx);
    const slug = tableCell(cells, slugIdx);
    if (summary) parts.push(summary);
    else if (slug) parts.push(slug);

    if (parts.length) return parts.join(' · ');
  }

  return c.slice(0, 5).join(' · ');
}

function parseTableBlock(
  lines: string[],
  start: number,
): { rows: Array<{ cells: string[]; lineIndex: number; sourceLine: string }>; header: string[] | null; next: number } {
  const raw: Array<{ cells: string[]; lineIndex: number; sourceLine: string }> = [];
  let i = start;
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    if (!isTableSeparator(lines[i])) {
      raw.push({ cells: parseTableCells(lines[i]), lineIndex: i, sourceLine: lines[i] });
    }
    i++;
  }

  if (!raw.length) return { rows: [], header: null, next: start };

  const header = raw[0].cells;
  const body = raw.length > 1 ? raw.slice(1) : [];
  return { rows: body, header, next: i };
}

export function parseMarkdownOutline(md: string): OutlineNode[] {
  const lines = md.split('\n');
  const roots: OutlineNode[] = [];
  const stack: Array<[number, OutlineNode]> = [];

  const add = (level: number, label: string, lineIndex: number, prefix: string, sourceLine?: string) => {
    const clean = stripInlineMd(label);
    if (!clean) return;
    const node: OutlineNode = { label: clean, level, lineIndex, prefix, sourceLine, children: [] };
    while (stack.length && stack[stack.length - 1][0] >= level) stack.pop();
    if (!stack.length) roots.push(node);
    else stack[stack.length - 1][1].children.push(node);
    stack.push([level, node]);
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    const line = trimmed.trim();
    if (!line) continue;

    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      add(heading[1].length, heading[2], i, `${heading[1]} `, trimmed);
      continue;
    }

    if (line.startsWith('|')) {
      const { rows, header, next } = parseTableBlock(lines, i);
      i = next - 1;
      if (!rows.length) continue;
      const parentLevel = stack.length ? stack[stack.length - 1][0] : 0;
      const rowLevel = parentLevel + 1;
      for (const row of rows) {
        add(rowLevel, tableRowLabel(header, row.cells), row.lineIndex, '| ', row.sourceLine);
      }
      continue;
    }

    const bullet = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
    if (bullet) {
      const parentLevel = stack.length ? stack[stack.length - 1][0] : 0;
      add(
        parentLevel + 1 + Math.floor(bullet[1].length / 2),
        bullet[3],
        i,
        `${bullet[1]}${bullet[2]} `,
        trimmed,
      );
      continue;
    }

    const quote = line.match(/^>\s?(.*)/);
    if (quote && quote[1].trim()) {
      const parentLevel = stack.length ? stack[stack.length - 1][0] : 0;
      add(parentLevel + 1, quote[1], i, '> ', trimmed);
    }
  }

  return roots;
}

export function outlineRootsForTopic(content: string): OutlineNode[] {
  const roots = parseMarkdownOutline(content);
  if (roots.length === 1 && roots[0].level === 1 && roots[0].children.length > 0) {
    return roots[0].children;
  }
  return roots;
}

export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const flat: OutlineNode[] = [];
  const walk = (list: OutlineNode[]) => {
    for (const n of list) {
      flat.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return flat;
}

export function deleteOutlineNode(md: string, flat: OutlineNode[], targetId: string, getId: (n: OutlineNode) => string): string {
  const target = flat.find((n) => getId(n) === targetId);
  if (!target) return md;
  const lines = md.split('\n');
  const sorted = [...flat].sort((a, b) => a.lineIndex - b.lineIndex);
  const idx = sorted.findIndex((n) => getId(n) === targetId);
  let endLine = lines.length;
  for (let i = idx + 1; i < sorted.length; i++) {
    if (sorted[i].level <= target.level) {
      endLine = sorted[i].lineIndex;
      break;
    }
  }
  lines.splice(target.lineIndex, endLine - target.lineIndex);
  return lines.join('\n');
}

export function updateOutlineLabel(md: string, node: OutlineNode, newLabel: string): string {
  const lines = md.split('\n');
  const line = lines[node.lineIndex];
  if (!line) return md;
  if (line.trim().startsWith('|')) return md;
  lines[node.lineIndex] = node.prefix + newLabel;
  return lines.join('\n');
}

export function normalizeSnippetLevels(snippetLines: string[], parentLevel: number): string[] {
  let minHeading = 7;
  for (const line of snippetLines) {
    const m = line.match(/^(#{1,6})\s/);
    if (m) minHeading = Math.min(minHeading, m[1].length);
  }

  if (minHeading === 7) {
    return snippetLines.map((line) => {
      const bm = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
      if (bm) return `${'  '.repeat(parentLevel)}${bm[2]} ${bm[3]}`;
      return line;
    });
  }

  const offset = parentLevel + 1 - minHeading;
  return snippetLines.map((line) => {
    const hm = line.match(/^(#{1,6})(\s+.*)/);
    if (hm) {
      const newLevel = Math.min(6, Math.max(1, hm[1].length + offset));
      return `${'#'.repeat(newLevel)}${hm[2]}`;
    }
    return line;
  });
}

export function insertMdUnderNode(md: string, flat: OutlineNode[], targetId: string, getId: (n: OutlineNode) => string, snippet: string): string {
  const target = flat.find((n) => getId(n) === targetId);
  if (!target || !snippet.trim()) return md;
  const lines = md.split('\n');
  const insertAt = target.lineIndex + 1;
  const snippetLines = normalizeSnippetLevels(snippet.trim().split('\n'), target.level);
  lines.splice(insertAt, 0, ...snippetLines);
  return lines.join('\n');
}
