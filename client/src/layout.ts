import type { GraphEdge, GraphNode } from './api';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export const LAYOUT_DIRECTIONS: { id: LayoutDirection; label: string; icon: string }[] = [
  { id: 'TB', label: '自上而下', icon: '↓' },
  { id: 'BT', label: '自下而上', icon: '↑' },
  { id: 'LR', label: '从左到右', icon: '→' },
  { id: 'RL', label: '从右到左', icon: '←' },
];

const NODE_WIDTH = 168;
const NODE_HEIGHT = 56;
const H_GAP = 60;
const V_GAP = 80;

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  data: GraphNode;
}

interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  type: 'hierarchy' | 'link';
  relation?: string;
}

function setPosition(
  positions: Map<string, { x: number; y: number }>,
  id: string,
  main: number,
  cross: number,
  isVertical: boolean,
) {
  positions.set(id, isVertical ? { x: cross, y: main } : { x: main, y: cross });
}

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: LayoutDirection = 'TB',
): { nodes: LayoutNode[]; edges: LayoutEdge[]; direction: LayoutDirection } {
  const hierarchyEdges = edges.filter((e) => e.type === 'hierarchy');
  const linkEdges = edges.filter((e) => e.type === 'link');

  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of hierarchyEdges) {
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
    hasParent.add(edge.target);
  }

  const roots = nodes.filter((n) => !hasParent.has(n.id));
  const isVertical = direction === 'TB' || direction === 'BT';
  const mainForward = direction === 'TB' || direction === 'LR';
  const mainGap = isVertical ? NODE_HEIGHT + V_GAP : NODE_WIDTH + H_GAP;
  const crossSize = isVertical ? NODE_WIDTH : NODE_HEIGHT;
  const crossGap = isVertical ? H_GAP : V_GAP;

  const positions = new Map<string, { x: number; y: number }>();
  let nextCross = 0;

  function layoutSubtree(nodeId: string, depth: number): number {
    const kids = children.get(nodeId) || [];
    const main = mainForward ? depth * mainGap : -depth * mainGap;

    if (kids.length === 0) {
      const cross = nextCross;
      nextCross += crossSize + crossGap;
      setPosition(positions, nodeId, main, cross, isVertical);
      return cross + crossSize / 2;
    }

    const childCenters = kids.map((kid) => layoutSubtree(kid, depth + 1));
    const minCross = Math.min(...childCenters) - crossSize / 2;
    const maxCross = Math.max(...childCenters) + crossSize / 2;
    const centerCross = (minCross + maxCross) / 2;
    setPosition(positions, nodeId, main, centerCross - crossSize / 2, isVertical);
    return centerCross;
  }

  for (const root of roots) {
    layoutSubtree(root.id, 0);
    nextCross += crossGap * 2;
  }

  // 归一化到正坐标
  const allX = [...positions.values()].map((p) => p.x);
  const allY = [...positions.values()].map((p) => p.y);
  if (allX.length > 0) {
    const offsetX = -Math.min(...allX) + 50;
    const offsetY = -Math.min(...allY) + 50;
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.x + offsetX, y: pos.y + offsetY });
    }
  }

  const layoutNodes: LayoutNode[] = nodes
    .filter((n) => positions.has(n.id))
    .map((n) => ({
      id: n.id,
      x: positions.get(n.id)!.x,
      y: positions.get(n.id)!.y,
      data: n,
    }));

  const layoutEdges: LayoutEdge[] = [
    ...hierarchyEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'hierarchy' as const,
    })),
    ...linkEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'link' as const,
      relation: e.relation,
    })),
  ];

  return { nodes: layoutNodes, edges: layoutEdges, direction };
}

export { NODE_WIDTH, NODE_HEIGHT };
