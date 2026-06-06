export interface OutlineNode {
  label: string;
  level: number;
  children: OutlineNode[];
}

export function parseMarkdownOutline(md: string): OutlineNode[] {
  const lines = md.split('\n');
  const roots: OutlineNode[] = [];
  const stack: Array<[number, OutlineNode]> = [];

  const add = (level: number, label: string) => {
    if (!label.trim()) return;
    const node: OutlineNode = { label: label.trim(), level, children: [] };
    while (stack.length && stack[stack.length - 1][0] >= level) stack.pop();
    if (!stack.length) roots.push(node);
    else stack[stack.length - 1][1].children.push(node);
    stack.push([level, node]);
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const heading = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      add(heading[1].length, heading[2]);
      continue;
    }
    const bullet = trimmed.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
    if (bullet) {
      const parentLevel = stack.length ? stack[stack.length - 1][0] : 0;
      add(parentLevel + 1 + Math.floor(bullet[1].length / 2), bullet[3]);
    }
  }

  return roots;
}

/** If content has a single top-level H1, use its children as topic branches. */
export function outlineRootsForTopic(content: string): OutlineNode[] {
  const roots = parseMarkdownOutline(content);
  if (roots.length === 1 && roots[0].level === 1 && roots[0].children.length > 0) {
    return roots[0].children;
  }
  return roots;
}
