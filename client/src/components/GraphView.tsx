import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type ReactFlowInstance,
  MarkerType,
} from 'reactflow';
import { toPng, toSvg } from 'html-to-image';
import 'reactflow/dist/style.css';
import GraphNodeComponent from './GraphNodeComponent';
import TopicEditModal from './TopicEditModal';
import CategoryEditModal from './CategoryEditModal';
import MindMapImportView from './MindMapImportView';
import { GraphEditContext } from './GraphEditContext';
import { LayoutDirectionContext } from './LayoutDirectionContext';
import {
  fetchGraph,
  fetchLayout,
  saveLayoutDirection,
  subscribeToUpdates,
  type ContentGraph,
  type LayoutDirection,
} from '../api';
import { layoutGraph, NODE_WIDTH, LAYOUT_DIRECTIONS } from '../layout';

const nodeTypes = { custom: GraphNodeComponent };

const LEGEND = [
  { color: '#94a3b8', label: '想法', dashed: true },
  { color: '#fbbf24', label: '大纲' },
  { color: '#60a5fa', label: '草稿' },
  { color: '#4ade80', label: '已发布' },
  { color: '#c4b5fd', label: '正文节点', dashed: true },
];

const STATUS_ZH: Record<string, string> = {
  idea: '想法', outline: '大纲', draft: '草稿', published: '已发布',
};

function graphToMarkdown(graph: ContentGraph): string {
  const lines: string[] = ['# 博客内容导图\n'];
  const catChildIds = new Set(
    graph.edges.filter((e) => e.type !== 'link').map((e) => e.target),
  );
  const categories = graph.nodes.filter((n) => n.type === 'category');

  for (const cat of categories) {
    lines.push(`## ${cat.data.label}`);
    const childIds = graph.edges
      .filter((e) => e.source === cat.id && e.type !== 'link')
      .map((e) => e.target);
    for (const id of childIds) {
      const topic = graph.nodes.find((n) => n.id === id);
      if (topic) {
        const status = STATUS_ZH[topic.data.status as string] ?? topic.data.status ?? '';
        lines.push(`- ${topic.data.label}（${status}）`);
      }
    }
    lines.push('');
  }

  const uncategorized = graph.nodes.filter(
    (n) => n.type === 'topic' && !catChildIds.has(n.id),
  );
  if (uncategorized.length) {
    lines.push('## 未分类');
    for (const t of uncategorized) {
      const status = STATUS_ZH[t.data.status as string] ?? t.data.status ?? '';
      lines.push(`- ${t.data.label}（${status}）`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function GraphCanvas() {
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState<ContentGraph | null>(null);
  const [loadError, setLoadError] = useState('');
  const [direction, setDirection] = useState<LayoutDirection>('TB');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ path: string; label: string } | null>(null);
  const [exportBusy, setExportBusy] = useState<'' | 'png' | 'svg' | 'md'>('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const rfInstance = useReactFlow();

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Element)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  const fitViewSafe = useCallback(() => {
    requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.2, duration: 200 });
    });
  }, []);

  const load = useCallback(() => {
    setLoadError('');
    Promise.all([fetchGraph(), fetchLayout()])
      .then(([g, layout]) => {
        setGraph(g);
        setDirection(layout.direction ?? 'TB');
      })
      .catch((err) => {
        setLoadError((err as Error).message);
        setGraph(null);
      });
  }, []);

  useEffect(() => {
    load();
    return subscribeToUpdates(load);
  }, [load]);

  const changeDirection = useCallback(
    async (dir: LayoutDirection) => {
      setDirection(dir);
      try { await saveLayoutDirection(dir); } catch { /* ignore */ }
      fitViewSafe();
    },
    [fitViewSafe],
  );

  const openEditor = useCallback((nodeId: string, type: 'category' | 'topic', label: string) => {
    if (type === 'topic') {
      setEditingTopicId(nodeId);
      setEditingCategory(null);
    } else {
      const path = nodeId.replace(/^cat:/, '');
      setEditingCategory({ path, label });
      setEditingTopicId(null);
    }
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const type = node.data?.type as 'category' | 'topic' | 'outline';
      const label = (node.data?.label as string) || '';
      if (type === 'outline' && node.data?.parentTopicId) {
        openEditor(node.data.parentTopicId as string, 'topic', label);
        return;
      }
      if (type === 'topic' || type === 'category') openEditor(node.id, type, label);
    },
    [openEditor],
  );

  const editContextValue = useMemo(() => ({ onEditNode: openEditor }), [openEditor]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph) return { flowNodes: [], flowEdges: [] };
    const { nodes, edges } = layoutGraph(graph.nodes, graph.edges, direction);

    const flowNodes: Node[] = nodes.map((n) => ({
      id: n.id,
      type: 'custom',
      position: { x: n.x, y: n.y },
      data: n.data,
      style: { width: NODE_WIDTH },
    }));

    const flowEdges: Edge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type === 'link' ? 'smoothstep' : 'default',
      animated: e.type === 'link',
      style: {
        stroke: e.type === 'link' ? '#fbbf24' : '#475569',
        strokeWidth: e.type === 'link' ? 2 : 1.5,
        strokeDasharray: e.type === 'link' ? '6 4' : undefined,
        opacity: e.type === 'link' ? 0.85 : 0.6,
      },
      markerEnd: e.type === 'link'
        ? { type: MarkerType.ArrowClosed, color: '#fbbf24', width: 16, height: 16 }
        : undefined,
      label: e.relation,
      labelStyle: { fill: '#fbbf24', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: '#1e293b', fillOpacity: 0.9 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { flowNodes, flowEdges };
  }, [graph, direction]);

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async (type: 'png' | 'svg' | 'md') => {
    setShowExportMenu(false);
    if (!graph) return;

    if (type === 'md') {
      const blob = new Blob([graphToMarkdown(graph)], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `blog-graph-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }

    const el = containerRef.current?.querySelector('.react-flow__renderer') as HTMLElement | null;
    if (!el) return;
    setExportBusy(type);

    try {
      const allNodes = rfInstance.getNodes();
      const bounds = getNodesBounds(allNodes);
      const W = 1800, H = 1200;
      const { x, y, zoom } = getViewportForBounds(bounds, W, H, 0.1, 2, 0.18);
      const opts = {
        backgroundColor: '#0f172a',
        width: W, height: H, pixelRatio: type === 'png' ? 3 : 1,
        style: { transform: `translate(${x}px,${y}px) scale(${zoom})`, transformOrigin: '0 0' },
        filter: (n: HTMLElement) =>
          !n.classList?.contains('react-flow__minimap') &&
          !n.classList?.contains('react-flow__controls') &&
          !n.classList?.contains('react-flow__attribution'),
      };

      if (type === 'png') {
        const dataUrl = await toPng(el, opts);
        const a = document.createElement('a');
        a.href = dataUrl; a.download = `blog-graph-${Date.now()}.png`; a.click();
      } else {
        const dataUrl = await toSvg(el, opts);
        const blob = new Blob([atob(dataUrl.split(',')[1])], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `blog-graph-${Date.now()}.svg`; a.click();
        URL.revokeObjectURL(a.href);
      }
    } finally { setExportBusy(''); }
  }, [graph, rfInstance]);

  // ── Render states ─────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>无法加载数据</h3>
        <p>{loadError}</p>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          请在终端运行 <code>npm run dev</code>，并确认 API（3001 端口）已启动
        </p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={load}>重试</button>
      </div>
    );
  }

  if (!graph) {
    return <div className="empty-state"><div className="spinner" /><p>加载图谱中...</p></div>;
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🗺️</div>
        <h3>还没有内容</h3>
        <p>添加第一个主题，思维导图会自动生成</p>
      </div>
    );
  }

  const topicCount = graph.nodes.filter((n) => n.type === 'topic').length;
  const linkCount = graph.edges.filter((e) => e.type === 'link').length;

  return (
    <LayoutDirectionContext.Provider value={direction}>
      <GraphEditContext.Provider value={editContextValue}>
        <div className="graph-panel">
          <div className="graph-toolbar">
            <div className="graph-stats">
              <span className="pill">{graph.nodes.filter((n) => n.type === 'category').length} 分类</span>
              <span className="pill">{topicCount} 主题</span>
              <span className="pill pill-accent">{linkCount} 链接</span>
              <span className="pill pill-hint">双击节点编辑</span>
            </div>
            <div className="direction-picker">
              <span className="direction-label">方向</span>
              {LAYOUT_DIRECTIONS.map((d) => (
                <button key={d.id} type="button"
                  className={`direction-btn ${direction === d.id ? 'active' : ''}`}
                  title={d.label} onClick={() => changeDirection(d.id)}>
                  {d.icon}
                </button>
              ))}
            </div>
            <div className="graph-legend">
              {LEGEND.map((item) => (
                <div key={item.label} className="legend-item">
                  <span className={`legend-dot ${item.dashed ? 'dashed' : ''}`}
                    style={{ background: item.color, borderColor: item.color }} />
                  {item.label}
                </div>
              ))}
              <div className="legend-item"><span className="legend-line" />跨级链接</div>
            </div>

            {/* Export dropdown */}
            <div className="gv-export-wrap" ref={exportMenuRef}>
              <button
                className={`mm-export-btn${exportBusy ? ' loading' : ''}`}
                disabled={!!exportBusy}
                onClick={() => setShowExportMenu((v) => !v)}
              >
                {exportBusy ? <span className="mm-export-spinner" /> : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                {exportBusy ? '导出中…' : '导出'}
                {!exportBusy && <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.6 }}>▾</span>}
              </button>
              {showExportMenu && (
                <div className="mm-export-menu">
                  <button className="mm-export-menu-item" onClick={() => handleExport('png')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    PNG 图片（3x 高清）
                  </button>
                  <button className="mm-export-menu-item" onClick={() => handleExport('svg')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                    SVG 矢量图
                  </button>
                  <button className="mm-export-menu-item" onClick={() => handleExport('md')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></svg>
                    Markdown 大纲
                  </button>
                </div>
              )}
            </div>
          </div>

          <div ref={containerRef}
            className={`graph-container${editingTopicId || editingCategory ? ' graph-container-locked' : ''}`}>
            <ReactFlow
              nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes}
              onInit={(instance) => { flowRef.current = instance; instance.fitView({ padding: 0.2, duration: 200 }); }}
              onNodeDoubleClick={onNodeDoubleClick}
              nodesDraggable={false} nodesConnectable={false}
              elementsSelectable zoomOnDoubleClick={false} panOnScroll
              minZoom={0.15} maxZoom={2} proOptions={{ hideAttribution: true }}
            >
              <Background color="#334155" gap={24} size={1} />
              <Controls className="graph-controls" />
              <MiniMap className="graph-minimap"
                nodeColor={(n) => {
                  if (n.data?.type === 'category') return '#818cf8';
                  if (n.data?.type === 'outline') return '#c4b5fd';
                  const s = n.data?.status;
                  if (s === 'published') return '#4ade80';
                  if (s === 'draft') return '#60a5fa';
                  if (s === 'outline') return '#fbbf24';
                  return '#94a3b8';
                }}
                maskColor="rgba(15, 23, 42, 0.75)"
              />
            </ReactFlow>
          </div>

          {editingTopicId && (
            <TopicEditModal
              topicId={editingTopicId}
              onClose={() => setEditingTopicId(null)}
              onSaved={load}
              onOpenTopic={setEditingTopicId}
            />
          )}
          {editingCategory && (
            <CategoryEditModal path={editingCategory.path} label={editingCategory.label}
              onClose={() => setEditingCategory(null)} onSaved={load} />
          )}
        </div>
      </GraphEditContext.Provider>
    </LayoutDirectionContext.Provider>
  );
}

export default function GraphView() {
  const [tab, setTab] = useState<'graph' | 'mindmap'>('graph');

  return (
    <div className="gv-wrap">
      <div className="gv-tabs">
        <button className={`gv-tab${tab === 'graph' ? ' active' : ''}`} onClick={() => setTab('graph')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5 }}>
            <circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="9" /><line x1="12" y1="15" x2="12" y2="21" />
          </svg>
          博客导图
        </button>
        <button className={`gv-tab${tab === 'mindmap' ? ' active' : ''}`} onClick={() => setTab('mindmap')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          MD 导入
        </button>
      </div>
      {tab === 'graph' ? (
        <ReactFlowProvider>
          <GraphCanvas />
        </ReactFlowProvider>
      ) : (
        <MindMapImportView />
      )}
    </div>
  );
}
