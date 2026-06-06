import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
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
import 'reactflow/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { LAYOUT_DIRECTIONS } from '../layout';
import type { LayoutDirection } from '../api';
import { createTopic } from '../api';

// ── History (localStorage) ───────────────────────────────────────────────────

const HISTORY_KEY = 'mm-history';
const MAX_HISTORY = 20;

interface HistoryEntry {
  id: string;
  title: string;
  filename?: string;
  content: string;
  editedLabels: Record<string, string>;
  customColors: Record<string, string>;
  nodeNotes: Record<string, string>;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch { return []; }
}
function saveHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY))); } catch {}
}
function extractTitle(md: string): string {
  const h1 = md.match(/^#\s+(.+)/m);
  return h1 ? h1[1].trim() : '未命名文档';
}
function countNodes(md: string): number {
  return md.split('\n').filter(l => /^#{1,6}\s/.test(l) || /^\s*([-*+]|\d+\.)\s/.test(l)).length;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} 天前` : fmtDate(iso);
}

// ── Markdown parser ──────────────────────────────────────────────────────────

interface MdNode {
  id: string; label: string; level: number;
  lineIndex: number; // line index in the source md
  prefix: string;    // e.g. "## " or "  - "
  children: MdNode[];
}

function parseMarkdown(md: string): MdNode[] {
  const lines = md.split('\n'), roots: MdNode[] = [];
  const stack: Array<[number, MdNode]> = [];
  let counter = 0;
  const nextId = () => `mm-${++counter}`;
  const add = (level: number, label: string, lineIndex: number, prefix: string) => {
    if (!label.trim()) return;
    const node: MdNode = { id: nextId(), label: label.trim(), level, lineIndex, prefix, children: [] };
    while (stack.length && stack[stack.length - 1][0] >= level) stack.pop();
    if (!stack.length) roots.push(node); else stack[stack.length - 1][1].children.push(node);
    stack.push([level, node]);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) { add(hm[1].length, hm[2], i, hm[1] + ' '); continue; }
    const bm = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
    if (bm) { const pl = stack.length ? stack[stack.length - 1][0] : 0; add(pl + 1 + Math.floor(bm[1].length / 2), bm[3], i, bm[1] + bm[2] + ' '); }
  }
  return roots;
}

function flattenMdNodes(nodes: MdNode[]): MdNode[] {
  const r: MdNode[] = [];
  const v = (n: MdNode) => { r.push(n); n.children.forEach(v); };
  nodes.forEach(v);
  return r;
}

/**
 * Insert a new placeholder node into the markdown text.
 * Returns { newMd, insertedLineIndex } so we can find and open the new node.
 */
function insertNodeInMd(
  md: string, flat: MdNode[], targetId: string, pos: 'sibling' | 'child',
): { newMd: string; insertedLineIndex: number } {
  const target = flat.find(n => n.id === targetId);
  if (!target) return { newMd: md, insertedLineIndex: -1 };
  const lines = md.split('\n');
  let insertAt: number;
  let newPrefix: string;

  if (pos === 'child') {
    insertAt = target.lineIndex + 1;
    if (/^#+\s/.test(target.prefix)) {
      const hashes = target.prefix.match(/^(#+)/)?.[1] ?? '#';
      newPrefix = hashes.length < 6 ? hashes + '# ' : '  - ';
    } else {
      newPrefix = '  ' + target.prefix;
    }
  } else {
    // sibling: insert after the end of this node's subtree
    const sorted = [...flat].sort((a, b) => a.lineIndex - b.lineIndex);
    const idx = sorted.findIndex(n => n.id === targetId);
    let insertLine = lines.length;
    for (let i = idx + 1; i < sorted.length; i++) {
      if (sorted[i].level <= target.level) { insertLine = sorted[i].lineIndex; break; }
    }
    insertAt = insertLine;
    newPrefix = target.prefix;
  }

  lines.splice(insertAt, 0, newPrefix + '新节点');
  return { newMd: lines.join('\n'), insertedLineIndex: insertAt };
}

/** Remap label/color/note overrides to new node IDs after a markdown edit. */
function remapOverridesByLabel(
  overrides: Record<string, string>, oldFlat: MdNode[], newFlat: MdNode[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const old of oldFlat) {
    if (!overrides[old.id]) continue;
    const match = newFlat.find(n => n.label === old.label);
    if (match) result[match.id] = overrides[old.id];
  }
  return result;
}

// ── Tree layout ──────────────────────────────────────────────────────────────

const NODE_W = 200, NODE_H = 52, H_GAP = 64, V_GAP = 32;

function layoutTree(roots: MdNode[], direction: LayoutDirection) {
  const placed: Array<{ id: string; x: number; y: number; label: string; level: number }> = [];
  const parentMap = new Map<string, string>();
  const iv = direction === 'TB' || direction === 'BT';
  const fwd = direction === 'TB' || direction === 'LR';
  const ms = iv ? NODE_H + V_GAP : NODE_W + H_GAP;
  const cs = iv ? NODE_W + H_GAP : NODE_H + V_GAP;
  let nc = 0;
  function place(node: MdNode, depth: number, pid?: string): number {
    if (pid) parentMap.set(node.id, pid);
    const main = fwd ? depth * ms : -depth * ms;
    if (!node.children.length) {
      const c = nc; nc += cs;
      placed.push({ id: node.id, label: node.label, level: node.level, x: iv ? c : main, y: iv ? main : c });
      return c + (iv ? NODE_W : NODE_H) / 2;
    }
    const centers = node.children.map(ch => place(ch, depth + 1, node.id));
    const hc = (iv ? NODE_W : NODE_H) / 2;
    const center = (Math.min(...centers) + Math.max(...centers)) / 2;
    placed.push({ id: node.id, label: node.label, level: node.level, x: iv ? center - hc : main, y: iv ? main : center - hc });
    return center;
  }
  for (const r of roots) { place(r, 0); nc += cs; }
  if (placed.length) {
    const mx = Math.min(...placed.map(n => n.x)), my = Math.min(...placed.map(n => n.y));
    placed.forEach(p => { p.x = p.x - mx + 48; p.y = p.y - my + 48; });
  }
  return { placed, parentMap };
}

// ── Colors ───────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<number, string> = { 1: '#818cf8', 2: '#38bdf8', 3: '#4ade80', 4: '#fbbf24', 5: '#f87171', 6: '#a78bfa' };
const COLOR_PRESETS = ['#818cf8', '#38bdf8', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#94a3b8'];
function levelColor(level: number) { return LEVEL_COLORS[Math.min(level, 6)] ?? '#94a3b8'; }

// ── Build flow elements ───────────────────────────────────────────────────────

function buildFlowElements(roots: MdNode[], direction: LayoutDirection): { nodes: Node[]; edges: Edge[] } {
  if (!roots.length) return { nodes: [], edges: [] };
  const { placed, parentMap } = layoutTree(roots, direction);
  const childSet = new Set<string>();
  const edges: Edge[] = [];
  for (const [child, parent] of parentMap) {
    childSet.add(parent);
    edges.push({ id: `e-${parent}-${child}`, source: parent, target: child, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#475569' },
      style: { stroke: '#475569', strokeWidth: 1.5 } });
  }
  const nodes: Node[] = placed.map(p => ({
    id: p.id, type: 'mindmapNode', position: { x: p.x, y: p.y },
    data: { label: p.label, level: p.level, color: levelColor(p.level), direction, hasChildren: childSet.has(p.id) },
  }));
  return { nodes, edges };
}

// ── Node actions context ──────────────────────────────────────────────────────

const NodeActionsCtx = createContext<{ onToggleCollapse: (id: string) => void }>({ onToggleCollapse: () => {} });

// ── MindMapNode ───────────────────────────────────────────────────────────────

interface NodeData {
  label: string; level: number; color: string; direction: LayoutDirection;
  hasChildren: boolean; collapsed?: boolean; note?: string;
  highlighted?: boolean; dimmed?: boolean; edited?: boolean;
}

function MindMapNode({ id, data }: { id: string; data: NodeData }) {
  const { onToggleCollapse } = useContext(NodeActionsCtx);
  const [showNote, setShowNote] = useState(false);
  const isRoot = data.level === 1;
  const iv = data.direction === 'TB' || data.direction === 'BT';
  const sp = data.direction === 'TB' ? Position.Bottom : data.direction === 'BT' ? Position.Top : data.direction === 'LR' ? Position.Right : Position.Left;
  const tp = data.direction === 'TB' ? Position.Top : data.direction === 'BT' ? Position.Bottom : data.direction === 'LR' ? Position.Left : Position.Right;
  const hs: React.CSSProperties = { background: 'transparent', border: 'none', width: 6, height: 6 };

  const opacity = data.dimmed ? 0.3 : 1;
  const borderAlpha = isRoot ? 'cc' : data.highlighted ? 'ff' : data.edited ? '99' : '44';
  const glow = data.highlighted ? `0 0 0 2px ${data.color}66, 0 0 20px ${data.color}44` : isRoot ? `0 0 20px ${data.color}25` : 'none';

  return (
    <div title="双击编辑" style={{
      width: NODE_W, minHeight: NODE_H, display: 'flex', alignItems: 'center',
      padding: iv ? '8px 10px 8px 12px' : '6px 10px 6px 12px', borderRadius: isRoot ? 10 : 8,
      background: isRoot ? `linear-gradient(135deg,${data.color}28,${data.color}12)` : 'rgba(22,27,38,0.92)',
      border: `1.5px solid ${data.color}${borderAlpha}`, boxShadow: glow,
      fontSize: isRoot ? 13 : 12, fontWeight: isRoot ? 600 : 400,
      color: isRoot ? data.color : '#cbd5e1', wordBreak: 'break-word', lineHeight: 1.5,
      cursor: 'default', userSelect: 'none', fontFamily: 'inherit', position: 'relative', opacity,
      transition: 'opacity 0.2s, border-color 0.2s, box-shadow 0.2s',
    }}>
      <Handle type="target" position={tp} style={hs} />

      {/* Collapse toggle */}
      {data.hasChildren && (
        <span
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(id); }}
          style={{
            width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${data.color}22`, border: `1px solid ${data.color}44`, marginRight: 8,
            fontSize: 9, color: data.color, cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
          }}
          title={data.collapsed ? '展开' : '折叠'}
        >
          {data.collapsed ? '▶' : '▼'}
        </span>
      )}

      {data.level > 1 && !data.hasChildren && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: data.color, flexShrink: 0, marginRight: 8, opacity: 0.75 }} />
      )}

      <span style={{ flex: 1, minWidth: 0 }}>{data.label}</span>

      {/* Note indicator */}
      {data.note && (
        <span
          style={{ marginLeft: 6, flexShrink: 0, color: data.color, opacity: 0.7, cursor: 'help', fontSize: 11, position: 'relative' }}
          onMouseEnter={() => setShowNote(true)} onMouseLeave={() => setShowNote(false)}
        >
          📝
          {showNote && (
            <span style={{
              position: 'absolute', bottom: '130%', right: 0, background: '#1e2433', border: `1px solid ${data.color}44`,
              borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#cbd5e1', whiteSpace: 'pre-wrap',
              maxWidth: 240, minWidth: 120, zIndex: 9999, lineHeight: 1.6,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)', pointerEvents: 'none',
            }}>
              {data.note}
            </span>
          )}
        </span>
      )}

      <Handle type="source" position={sp} style={hs} />
    </div>
  );
}

const nodeTypes = { mindmapNode: MindMapNode };

// ── NodeEditModal ─────────────────────────────────────────────────────────────

interface NodeEditSave { label: string; color: string | null; note: string; }
interface EditModalProps {
  nodeId: string; label: string; color: string; defaultColor: string; note: string;
  onSave: (id: string, data: NodeEditSave) => void;
  onClose: () => void;
  onCreateTopic: (title: string) => Promise<void>;
  onAddSibling: () => void;
  onAddChild: () => void;
}

function NodeEditModal({ nodeId, label, color, defaultColor, note, onSave, onClose, onCreateTopic, onAddSibling, onAddChild }: EditModalProps) {
  const [labelVal, setLabelVal] = useState(label);
  const [colorVal, setColorVal] = useState(color);
  const [noteVal, setNoteVal] = useState(note);
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); textareaRef.current?.select(); }, []);

  const handleSave = () => {
    const t = labelVal.trim(); if (!t) return;
    onSave(nodeId, { label: t, color: colorVal !== defaultColor ? colorVal : null, note: noteVal.trim() });
    onClose();
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
  };
  const handleCreate = async () => {
    const t = labelVal.trim(); if (!t || creating) return;
    setCreating(true);
    try { await onCreateTopic(t); setCreateStatus('ok'); setTimeout(() => setCreateStatus('idle'), 2500); }
    catch { setCreateStatus('err'); setTimeout(() => setCreateStatus('idle'), 2500); }
    finally { setCreating(false); }
  };

  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  return (
    <div
      className="mm-modal-overlay"
      onMouseDown={(e) => { mouseDownTargetRef.current = e.target; }}
      onMouseUp={(e) => {
        if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) onClose();
        mouseDownTargetRef.current = null;
      }}
    >
      <div className="mm-modal" style={{ '--node-color': colorVal } as React.CSSProperties}>
        <div className="mm-modal-header">
          <span className="mm-modal-dot" style={{ background: colorVal }} />
          <span className="mm-modal-title">编辑节点</span>
          <button className="mm-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="mm-modal-body">

          {/* Label */}
          <div className="mm-modal-section-label">标题文字</div>
          <textarea ref={textareaRef} className="mm-modal-textarea" value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)} onKeyDown={handleKeyDown} placeholder="节点文字…" />

          {/* Color */}
          <div className="mm-modal-section-label">节点颜色</div>
          <div className="mm-color-row">
            {COLOR_PRESETS.map(c => (
              <button key={c} className={`mm-color-swatch${colorVal === c ? ' active' : ''}`}
                style={{ background: c, boxShadow: colorVal === c ? `0 0 0 2px #0c0e14, 0 0 0 4px ${c}` : 'none' }}
                onClick={() => setColorVal(c)} />
            ))}
            <input type="color" className="mm-color-picker" value={colorVal}
              onChange={(e) => setColorVal(e.target.value)} title="自定义颜色" />
            {color !== defaultColor && (
              <button className="mm-color-reset" onClick={() => setColorVal(defaultColor)} title="重置默认颜色">↺</button>
            )}
          </div>

          {/* Note */}
          <div className="mm-modal-section-label">备注 <span style={{ opacity: 0.5, fontWeight: 400 }}>（hover 显示）</span></div>
          <textarea className="mm-modal-textarea mm-note-textarea" value={noteVal}
            onChange={(e) => setNoteVal(e.target.value)} placeholder="添加备注说明…" rows={3} />

          {/* Add sibling / child */}
          <div className="mm-modal-section-label">添加节点</div>
          <div className="mm-add-node-row">
            <button className="mm-add-node-btn" onClick={onAddSibling} title="在当前节点之后插入同级节点">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="9" width="8" height="6" rx="1.5" />
                <rect x="14" y="9" width="8" height="6" rx="1.5" />
                <path d="M10 12h4" />
              </svg>
              添加同级节点
            </button>
            <button className="mm-add-node-btn" onClick={onAddChild} title="在当前节点下插入子节点">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="4" width="8" height="6" rx="1.5" />
                <rect x="14" y="14" width="8" height="6" rx="1.5" />
                <path d="M6 10v4h8" />
              </svg>
              添加子节点
            </button>
          </div>

          {/* Create topic */}
          <button className={`mm-create-topic-btn${creating ? ' loading' : ''} ${createStatus === 'ok' ? 'ok' : createStatus === 'err' ? 'err' : ''}`}
            onClick={handleCreate} disabled={creating || !labelVal.trim()}>
            {creating ? <span className="mm-export-spinner" style={{ borderTopColor: 'var(--success)' }} /> : createStatus === 'ok' ? '✓' : createStatus === 'err' ? '✗' : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            {creating ? '创建中…' : createStatus === 'ok' ? '已创建为博客主题！' : createStatus === 'err' ? '创建失败' : '创建为博客主题'}
          </button>

          <p className="mm-modal-hint">⌘↵ 保存 &nbsp;·&nbsp; Esc 取消</p>
        </div>
        <div className="mm-modal-footer">
          <button className="mm-modal-footer-btn" onClick={onClose}>取消</button>
          <button className="mm-modal-footer-btn" onClick={handleSave} disabled={!labelVal.trim()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── HistoryList ────────────────────────────────────────────────────────────────

function HistoryList({ entries, onRestore, onDelete }: { entries: HistoryEntry[]; onRestore: (e: HistoryEntry) => void; onDelete: (id: string) => void }) {
  if (!entries.length) return null;
  return (
    <div className="mm-history">
      <div className="mm-history-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        历史记录 <span className="mm-history-count">{entries.length}</span>
      </div>
      <div className="mm-history-list">
        {entries.map(e => (
          <div key={e.id} className="mm-history-item" onClick={() => onRestore(e)}>
            <div className="mm-history-avatar" style={{ background: 'linear-gradient(135deg,#818cf844,#38bdf822)', border: '1px solid #818cf833' }}>
              {e.title.slice(0, 1)}
            </div>
            <div className="mm-history-info">
              <div className="mm-history-title">{e.title}</div>
              <div className="mm-history-meta">
                <span title={fmtDate(e.createdAt)}>上传于 {fmtRelative(e.createdAt)}</span>
                {e.updatedAt !== e.createdAt && <><span className="mm-history-sep">·</span><span title={fmtDate(e.updatedAt)}>编辑于 {fmtRelative(e.updatedAt)}</span></>}
                <span className="mm-history-sep">·</span><span>{e.nodeCount} 节点</span>
              </div>
            </div>
            <div className="mm-history-actions">
              <button className="mm-history-restore" onClick={(ev) => { ev.stopPropagation(); onRestore(e); }} title="恢复">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
              </button>
              <button className="mm-history-delete" onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} title="删除">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Outline view (时间线) ─────────────────────────────────────────────────────

function OutlineView({
  roots, editedLabels, customColors, nodeNotes, searchQuery, onNodeClick,
}: {
  roots: MdNode[];
  editedLabels: Record<string, string>;
  customColors: Record<string, string>;
  nodeNotes: Record<string, string>;
  searchQuery: string;
  onNodeClick: (n: MdNode) => void;
}) {
  const q = searchQuery.trim().toLowerCase();

  const renderNode = (node: MdNode, depth: number): React.ReactNode => {
    const label = editedLabels[node.id] ?? node.label;
    const color = customColors[node.id] ?? levelColor(node.level);
    const note = nodeNotes[node.id] ?? '';
    const matched = q ? label.toLowerCase().includes(q) : false;
    const dimmed = !!q && !matched;

    return (
      <div key={node.id}>
        <div
          className={`mm-outline-item${matched ? ' highlighted' : ''}${dimmed ? ' dimmed' : ''}`}
          style={{ paddingLeft: depth * 22 + 14 }}
          onClick={() => onNodeClick(node)}
          title={note || undefined}
        >
          <span className="mm-outline-dot" style={{ background: color, boxShadow: matched ? `0 0 6px ${color}` : 'none' }} />
          <span className="mm-outline-lvbadge" style={{ background: `${color}22`, color, borderColor: `${color}44` }}>
            {node.level <= 6 ? `H${node.level}` : '•'}
          </span>
          <span className="mm-outline-label">{label}</span>
          {note && <span className="mm-outline-note-icon" title={note}>📝</span>}
          {node.children.length > 0 && (
            <span className="mm-outline-children-count">{node.children.length} 项</span>
          )}
        </div>
        {node.children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  if (!roots.length) return <div className="mm-subview-empty">暂无内容</div>;

  return (
    <div className="mm-outline-view">
      <div className="mm-outline-hint">点击任意节点可编辑</div>
      {roots.map(r => renderNode(r, 0))}
    </div>
  );
}

// ── Stats view (覆盖度) ────────────────────────────────────────────────────────

function StatsView({ roots, editedLabels }: { roots: MdNode[]; editedLabels: Record<string, string> }) {
  const flat = useMemo(() => flattenMdNodes(roots), [roots]);
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null);
  const [expandedRoot, setExpandedRoot] = useState<string | null>(null);

  const levelCounts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const n of flat) m[n.level] = (m[n.level] ?? 0) + 1;
    return m;
  }, [flat]);

  const levelNodes = useMemo(() => {
    const m: Record<number, MdNode[]> = {};
    for (const n of flat) {
      if (!m[n.level]) m[n.level] = [];
      m[n.level].push(n);
    }
    return m;
  }, [flat]);

  const maxDepth = useMemo(() => {
    let d = 0;
    const walk = (nodes: MdNode[], cur: number) => { for (const n of nodes) { d = Math.max(d, cur); walk(n.children, cur + 1); } };
    walk(roots, 1);
    return d;
  }, [roots]);

  const levels = Object.keys(levelCounts).map(Number).sort((a, b) => a - b);
  const maxCount = Math.max(1, ...Object.values(levelCounts));
  const leafCount = flat.filter(n => !n.children.length).length;
  const avgChildren = flat.length
    ? (flat.reduce((s, n) => s + n.children.length, 0) / flat.length).toFixed(1)
    : '0';

  return (
    <div className="mm-stats-view">
      <div className="mm-stats-cards">
        {[
          { v: flat.length, l: '节点总数' },
          { v: roots.length, l: '根节点' },
          { v: maxDepth, l: '最大深度' },
          { v: leafCount, l: '叶子节点' },
          { v: levels.length, l: '层级数' },
          { v: avgChildren, l: '平均子节点' },
        ].map(({ v, l }) => (
          <div className="mm-stats-card" key={l}>
            <div className="mm-stats-card-val">{v}</div>
            <div className="mm-stats-card-lbl">{l}</div>
          </div>
        ))}
      </div>

      <div className="mm-stats-section-title">各层级节点分布</div>
      <div className="mm-stats-bars">
        {levels.map(level => {
          const count = levelCounts[level];
          const color = levelColor(level);
          const pct = Math.round((count / maxCount) * 100);
          const levelLabel = level <= 6 ? `H${level} 标题` : '列表项';
          const isOpen = expandedLevel === level;
          const nodes = levelNodes[level] ?? [];
          return (
            <div key={level} className="mm-stats-level-group">
              <div
                className={`mm-stats-bar-row mm-stats-bar-row-clickable${isOpen ? ' expanded' : ''}`}
                onClick={() => setExpandedLevel(isOpen ? null : level)}
                title="点击查看该层节点"
              >
                <div className="mm-stats-bar-label">
                  <span className="mm-stats-bar-dot" style={{ background: color }} />
                  <span style={{ color }}>{levelLabel}</span>
                  <span className="mm-stats-expand-arrow" style={{ color }}>{isOpen ? '▾' : '▸'}</span>
                </div>
                <div className="mm-stats-bar-track">
                  <div className="mm-stats-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${color}cc,${color}55)` }} />
                </div>
                <span className="mm-stats-bar-count" style={{ color }}>{count}</span>
              </div>
              {isOpen && (
                <div className="mm-stats-node-list">
                  {nodes.map((n, i) => {
                    const label = editedLabels[n.id] ?? n.label;
                    return (
                      <div key={n.id} className="mm-stats-node-item" style={{ borderLeftColor: color }}>
                        <span className="mm-stats-node-index" style={{ color }}>{i + 1}</span>
                        <span className="mm-stats-node-label" title={label}>{label}</span>
                        {n.children.length > 0 && (
                          <span className="mm-stats-node-sub" style={{ color }}>{n.children.length} 子节点</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mm-stats-section-title" style={{ marginTop: 28 }}>根节点覆盖分布</div>
      <div className="mm-stats-bars">
        {roots.map(r => {
          const sub = flattenMdNodes([r]).length;
          const pct = Math.round((sub / Math.max(1, flat.length)) * 100);
          const color = levelColor(r.level);
          const label = editedLabels?.[r.id] ?? r.label;
          const isOpen = expandedRoot === r.id;
          const children = flattenMdNodes([r]).filter(n => n.id !== r.id);
          return (
            <div key={r.id} className="mm-stats-level-group">
              <div
                className={`mm-stats-bar-row mm-stats-bar-row-clickable${isOpen ? ' expanded' : ''}`}
                onClick={() => setExpandedRoot(isOpen ? null : r.id)}
                title="点击查看子节点"
              >
                <div className="mm-stats-bar-label">
                  <span className="mm-stats-bar-dot" style={{ background: color }} />
                  <span style={{ color, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }} title={label}>{label}</span>
                  <span className="mm-stats-expand-arrow" style={{ color }}>{isOpen ? '▾' : '▸'}</span>
                </div>
                <div className="mm-stats-bar-track">
                  <div className="mm-stats-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${color}aa,${color}33)` }} />
                </div>
                <span className="mm-stats-bar-count" style={{ color }}>{sub} 节点</span>
              </div>
              {isOpen && (
                <div className="mm-stats-node-list">
                  {children.map((n, i) => {
                    const nodeLabel = editedLabels[n.id] ?? n.label;
                    const nodeColor = levelColor(n.level);
                    return (
                      <div key={n.id} className="mm-stats-node-item" style={{ borderLeftColor: nodeColor }}>
                        <span className="mm-stats-node-index" style={{ color: nodeColor }}>{i + 1}</span>
                        <span className="mm-stats-node-badge" style={{ background: `${nodeColor}22`, color: nodeColor, borderColor: `${nodeColor}44` }}>
                          {n.level <= 6 ? `H${n.level}` : '•'}
                        </span>
                        <span className="mm-stats-node-label" title={nodeLabel}>{nodeLabel}</span>
                        {n.children.length > 0 && (
                          <span className="mm-stats-node-sub" style={{ color: nodeColor }}>{n.children.length} 子</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DropZone ──────────────────────────────────────────────────────────────────

function DropZone({ onMd }: { onMd: (text: string, filename?: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const readFile = (file: File) => { const r = new FileReader(); r.onload = e => onMd((e.target?.result as string) ?? '', file.name); r.readAsText(file, 'utf-8'); };
  return (
    <div className={`mm-dropzone${dragging ? ' mm-dropzone--over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
      onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept=".md,.txt" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ color: 'var(--accent)', opacity: 0.8 }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 12 15 15" />
      </svg>
      <p className="mm-dropzone-title">拖入 Markdown 文件，或点击选择</p>
      <p className="mm-dropzone-sub">支持 .md / .txt · 标题层级自动生成思维导图</p>
    </div>
  );
}

// ── Canvas ─────────────────────────────────────────────────────────────────────

export interface CanvasHandle {
  exportPng: () => Promise<void>;
  exportSvg: () => Promise<void>;
  getMarkdown: () => string;
}
interface CanvasProps {
  mdText: string; direction: LayoutDirection; searchQuery: string;
  editedLabels: Record<string, string>; customColors: Record<string, string>; nodeNotes: Record<string, string>;
  onNodeDoubleClick: (id: string, label: string, color: string, defaultColor: string, note: string) => void;
}

const MindMapCanvas = forwardRef<CanvasHandle, CanvasProps>(
  function MindMapCanvas({ mdText, direction, searchQuery, editedLabels, customColors, nodeNotes, onNodeDoubleClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<ReactFlowInstance | null>(null);
    const { fitView, getNodes, getEdges } = useReactFlow();
    const [collapsedNodes, setCollapsedNodes] = useState(() => new Set<string>());

    const onToggleCollapse = useCallback((id: string) => {
      setCollapsedNodes(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    }, []);

    const { rawNodes, rawEdges } = useMemo(() => {
      const roots = parseMarkdown(mdText);
      const { nodes, edges } = buildFlowElements(roots, direction);
      return { rawNodes: nodes, rawEdges: edges };
    }, [mdText, direction]);

    // children map for collapse logic
    const childrenMap = useMemo(() => {
      const m = new Map<string, string[]>();
      for (const e of rawEdges) { if (!m.has(e.source)) m.set(e.source, []); m.get(e.source)!.push(e.target); }
      return m;
    }, [rawEdges]);

    // descendants of all collapsed nodes
    const hiddenNodes = useMemo(() => {
      const hidden = new Set<string>();
      const hide = (id: string) => { for (const c of childrenMap.get(id) ?? []) { hidden.add(c); hide(c); } };
      for (const id of collapsedNodes) hide(id);
      return hidden;
    }, [childrenMap, collapsedNodes]);

    // all nodes with overrides + search highlight
    const allNodes = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      return rawNodes.map(n => {
        const label = editedLabels[n.id] ?? (n.data as { label: string }).label;
        const defColor = (n.data as { color: string }).color;
        const color = customColors[n.id] ?? defColor;
        const note = nodeNotes[n.id] ?? '';
        const hasChildren = (n.data as { hasChildren: boolean }).hasChildren;
        const collapsed = collapsedNodes.has(n.id);
        const highlighted = q ? label.toLowerCase().includes(q) : false;
        const dimmed = q ? !highlighted : false;
        const edited = !!(editedLabels[n.id] || customColors[n.id] || nodeNotes[n.id]);
        return { ...n, data: { ...n.data, label, color, note, hasChildren, collapsed, highlighted, dimmed, edited } };
      });
    }, [rawNodes, editedLabels, customColors, nodeNotes, collapsedNodes, searchQuery]);

    const visibleNodes = useMemo(() => allNodes.filter(n => !hiddenNodes.has(n.id)), [allNodes, hiddenNodes]);
    const visibleEdges = useMemo(() => rawEdges.filter(e => !hiddenNodes.has(e.target)), [rawEdges, hiddenNodes]);

    // refs for export (all nodes, including hidden)
    const allNodesRef = useRef(allNodes);
    const rawEdgesRef = useRef(rawEdges);
    allNodesRef.current = allNodes;
    rawEdgesRef.current = rawEdges;

    const onInit = useCallback((instance: ReactFlowInstance) => {
      flowRef.current = instance;
      requestAnimationFrame(() => instance.fitView({ padding: 0.15, duration: 300 }));
    }, []);
    useEffect(() => {
      requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.15, duration: 300 }));
    }, [direction, visibleNodes.length]);

    const handleNodeDoubleClick = useCallback<NodeMouseHandler>((_e, node) => {
      const d = node.data as { label: string; color: string; note?: string; level: number };
      onNodeDoubleClick(node.id, d.label, d.color, levelColor(d.level), d.note ?? '');
    }, [onNodeDoubleClick]);

    const doCapture = useCallback(async (format: 'png' | 'svg') => {
      const allNd = getNodes();
      if (!allNd.length) return;
      const bounds = getNodesBounds(allNd);
      const PAD = 60, PR = 3;
      const iw = Math.round(bounds.width + PAD * 2);
      const ih = Math.round(bounds.height + PAD * 2);
      const vp = getViewportForBounds(bounds, iw, ih, 0.1, 4, PAD / Math.max(iw, ih));
      const vpEl = containerRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
      if (!vpEl) return;
      const opts = {
        backgroundColor: '#0c0e14', width: iw, height: ih,
        pixelRatio: format === 'png' ? PR : 1,
        style: { width: `${iw}px`, height: `${ih}px`, transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})`, transformOrigin: 'top left' },
      };
      const dataUrl = format === 'png' ? await toPng(vpEl, opts) : await toSvg(vpEl, opts);
      const a = document.createElement('a');
      a.href = dataUrl; a.download = `mindmap-${Date.now()}.${format}`; a.click();
    }, [getNodes]);

    useImperativeHandle(ref, () => ({
      exportPng: () => doCapture('png'),
      exportSvg: () => doCapture('svg'),
      getMarkdown: () => {
        const nodes = allNodesRef.current;
        const edges = rawEdgesRef.current;
        const cm = new Map<string, string[]>();
        for (const e of edges) { if (!cm.has(e.source)) cm.set(e.source, []); cm.get(e.source)!.push(e.target); }
        const hasParent = new Set(edges.map(e => e.target));
        const nm = new Map(nodes.map(n => [n.id, n]));
        const roots = nodes.filter(n => !hasParent.has(n.id));
        const lines: string[] = [];
        const visit = (id: string, depth: number) => {
          const n = nm.get(id); if (!n) return;
          const lbl = (n.data as { label: string }).label;
          lines.push(depth < 4 ? `${'#'.repeat(depth + 1)} ${lbl}` : `${'  '.repeat(depth - 4)}- ${lbl}`);
          for (const c of cm.get(id) ?? []) visit(c, depth + 1);
        };
        for (const r of roots) visit(r.id, 0);
        return lines.join('\n');
      },
    }));

    return (
      <NodeActionsCtx.Provider value={{ onToggleCollapse }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
          <ReactFlow nodes={visibleNodes} edges={visibleEdges} nodeTypes={nodeTypes}
            onInit={onInit} onNodeDoubleClick={handleNodeDoubleClick}
            fitView nodesDraggable nodesConnectable={false} elementsSelectable={false} minZoom={0.05} maxZoom={2}>
            <Background color="#1e2433" gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={n => ((n.data as { color: string }).color ?? '#818cf8') + '99'}
              maskColor="rgba(12,14,20,0.7)" style={{ background: 'rgba(18,21,30,0.9)' }} />
          </ReactFlow>
        </div>
      </NodeActionsCtx.Provider>
    );
  }
);

// ── Main view ─────────────────────────────────────────────────────────────────

export default function MindMapImportView() {
  const [mdText, setMdText] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState('');
  const [direction, setDirection] = useState<LayoutDirection>('LR');
  const [searchQuery, setSearchQuery] = useState('');
  const [editedLabels, setEditedLabels] = useState<Record<string, string>>({});
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [nodeNotes, setNodeNotes] = useState<Record<string, string>>({});
  const [editingNode, setEditingNode] = useState<{ id: string; label: string; color: string; defaultColor: string; note: string } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<'' | 'png' | 'svg' | 'md'>('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [subView, setSubView] = useState<'map' | 'outline' | 'stats'>('map');
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const hasMd = mdText.trim().length > 0;
  const parsedRoots = useMemo(() => parseMarkdown(mdText), [mdText]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Element)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  const persistHistory = useCallback((id: string, patch: Partial<HistoryEntry>) => {
    setHistory(prev => { const next = prev.map(e => e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e); saveHistory(next); return next; });
  }, []);

  const loadDoc = useCallback((content: string, filename?: string, existing?: HistoryEntry) => {
    if (existing) {
      setMdText(existing.content);
      setEditedLabels(existing.editedLabels);
      setCustomColors(existing.customColors ?? {});
      setNodeNotes(existing.nodeNotes ?? {});
      setCurrentEntryId(existing.id);
      setSearchQuery('');
      return;
    }
    const now = new Date().toISOString();
    const entry: HistoryEntry = {
      id: crypto.randomUUID(), title: extractTitle(content), filename, content,
      editedLabels: {}, customColors: {}, nodeNotes: {},
      nodeCount: countNodes(content), createdAt: now, updatedAt: now,
    };
    setHistory(prev => { const next = [entry, ...prev.filter(e => e.content !== content)]; saveHistory(next); return next; });
    setCurrentEntryId(entry.id);
    setMdText(content);
    setEditedLabels({}); setCustomColors({}); setNodeNotes({});
    setSearchQuery('');
  }, []);

  const handleReset = () => {
    setMdText(''); setPasteMode(false); setPasteBuffer('');
    setEditedLabels({}); setCustomColors({}); setNodeNotes({});
    setEditingNode(null); setCurrentEntryId(null); setSearchQuery(''); setSubView('map');
  };

  const handleNodeDoubleClick = useCallback((id: string, label: string, color: string, defaultColor: string, note: string) => {
    setEditingNode({ id, label, color, defaultColor, note });
  }, []);

  const handleSaveNode = useCallback((id: string, data: NodeEditSave) => {
    const now = new Date().toISOString();
    setEditedLabels((prev) => {
      const nextLabels = { ...prev };
      if (data.label) nextLabels[id] = data.label; else delete nextLabels[id];

      setCustomColors((ccPrev) => {
        const nextColors = { ...ccPrev };
        if (data.color) nextColors[id] = data.color; else delete nextColors[id];

        setNodeNotes((nnPrev) => {
          const nextNotes = { ...nnPrev };
          if (data.note) nextNotes[id] = data.note; else delete nextNotes[id];

          if (currentEntryId) {
            persistHistory(currentEntryId, {
              editedLabels: nextLabels,
              customColors: nextColors,
              nodeNotes: nextNotes,
              updatedAt: now,
            });
          }
          return nextNotes;
        });
        return nextColors;
      });
      return nextLabels;
    });
  }, [currentEntryId, persistHistory]);

  const handleCreateTopic = useCallback(async (title: string) => {
    await createTopic({ title, paths: [], status: 'idea' });
  }, []);

  const handleAddNode = useCallback((pos: 'sibling' | 'child') => {
    if (!editingNode) return;
    const oldRoots = parseMarkdown(mdText);
    const oldFlat = flattenMdNodes(oldRoots);
    const { newMd, insertedLineIndex } = insertNodeInMd(mdText, oldFlat, editingNode.id, pos);
    const newRoots = parseMarkdown(newMd);
    const newFlat = flattenMdNodes(newRoots);
    // Remap existing overrides to new IDs
    const newLabels = remapOverridesByLabel(editedLabels, oldFlat, newFlat);
    const newColors = remapOverridesByLabel(customColors, oldFlat, newFlat);
    const newNotes = remapOverridesByLabel(nodeNotes, oldFlat, newFlat);
    setMdText(newMd);
    setEditedLabels(newLabels);
    setCustomColors(newColors);
    setNodeNotes(newNotes);
    if (currentEntryId) {
      persistHistory(currentEntryId, {
        content: newMd, nodeCount: countNodes(newMd),
        editedLabels: newLabels, customColors: newColors, nodeNotes: newNotes,
      });
    }
    // Auto-open the edit modal for the newly inserted node
    const inserted = newFlat.find(n => n.lineIndex === insertedLineIndex);
    if (inserted) {
      const defColor = levelColor(inserted.level);
      setEditingNode({ id: inserted.id, label: inserted.label, color: defColor, defaultColor: defColor, note: '' });
    } else {
      setEditingNode(null);
    }
  }, [editingNode, mdText, editedLabels, customColors, nodeNotes, currentEntryId, persistHistory]);

  const handleExport = useCallback(async (type: 'png' | 'svg' | 'md') => {
    if (!canvasRef.current || exportBusy) return;
    setShowExportMenu(false);
    setExportBusy(type);
    try {
      if (type === 'md') {
        const md = canvasRef.current.getMarkdown();
        const blob = new Blob([md], { type: 'text/markdown' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `mindmap-${Date.now()}.md`; a.click();
        URL.revokeObjectURL(a.href);
      } else if (type === 'png') {
        await canvasRef.current.exportPng();
      } else {
        await canvasRef.current.exportSvg();
      }
    } finally { setExportBusy(''); }
  }, [exportBusy]);

  return (
    <div className="mm-view">
      {!hasMd ? (
        <div className="mm-empty">
          <DropZone onMd={(t, f) => loadDoc(t, f)} />
          <div className="mm-divider"><span>或</span></div>
          {pasteMode ? (
            <div className="mm-paste-area">
              <textarea className="mm-textarea" placeholder={'# 文章标题\n## 第一章节\n### 子节\n- 要点\n## 第二章节'}
                autoFocus rows={12} value={pasteBuffer} onChange={e => setPasteBuffer(e.target.value)} />
              <div className="mm-paste-actions">
                <button className="btn-secondary" onClick={() => { setPasteMode(false); setPasteBuffer(''); }}>取消</button>
                <button className="btn-primary" disabled={!pasteBuffer.trim()} onClick={() => { loadDoc(pasteBuffer); setPasteMode(false); }}>生成导图</button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost mm-paste-btn" onClick={() => setPasteMode(true)}>粘贴 Markdown 文本</button>
          )}
          <HistoryList entries={history} onRestore={e => loadDoc(e.content, e.filename, e)} onDelete={id => setHistory(prev => { const n = prev.filter(e => e.id !== id); saveHistory(n); return n; })} />
        </div>
      ) : (
        <div className="mm-canvas-wrap">
          <div className="mm-toolbar">
            <button className="mm-back-btn" onClick={handleReset}>← 重新导入</button>

            {/* Search */}
            <div className="mm-search-wrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mm-search-icon">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input className="mm-search-input" placeholder="搜索节点…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setSearchQuery('')} />
              {searchQuery && <button className="mm-search-clear" onClick={() => setSearchQuery('')}>×</button>}
            </div>

            <div className="mm-toolbar-right">
              <div className="mm-dir-group">
                {LAYOUT_DIRECTIONS.map(d => (
                  <button key={d.id} className={`mm-dir-btn${direction === d.id ? ' active' : ''}`}
                    onClick={() => setDirection(d.id)} title={d.label}>{d.icon}</button>
                ))}
              </div>

              {/* Export dropdown */}
              <div className="mm-export-wrap" ref={exportMenuRef}>
                <button className={`mm-export-btn${exportBusy ? ' loading' : ''}`}
                  onClick={() => setShowExportMenu(v => !v)} disabled={!!exportBusy}>
                  {exportBusy ? <span className="mm-export-spinner" /> : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  )}
                  {exportBusy ? `导出中…` : '导出'}
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
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                      Markdown 大纲
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sub-view tabs */}
          <div className="mm-subtabs">
            <button className={`mm-subtab${subView === 'map' ? ' active' : ''}`} onClick={() => setSubView('map')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5 }}>
                <circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="9" /><line x1="12" y1="15" x2="12" y2="21" />
              </svg>
              思维导图
            </button>
            <button className={`mm-subtab${subView === 'outline' ? ' active' : ''}`} onClick={() => setSubView('outline')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5 }}>
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              时间线
            </button>
            <button className={`mm-subtab${subView === 'stats' ? ' active' : ''}`} onClick={() => setSubView('stats')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5 }}>
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              覆盖度
            </button>
          </div>

          {subView === 'map' && (
            <div className="mm-flow">
              <ReactFlowProvider>
                <MindMapCanvas ref={canvasRef} mdText={mdText} direction={direction} searchQuery={searchQuery}
                  editedLabels={editedLabels} customColors={customColors} nodeNotes={nodeNotes}
                  onNodeDoubleClick={handleNodeDoubleClick} />
              </ReactFlowProvider>
            </div>
          )}
          {subView === 'outline' && (
            <OutlineView
              roots={parsedRoots} editedLabels={editedLabels} customColors={customColors}
              nodeNotes={nodeNotes} searchQuery={searchQuery}
              onNodeClick={node => {
                const color = customColors[node.id] ?? levelColor(node.level);
                setEditingNode({ id: node.id, label: editedLabels[node.id] ?? node.label, color, defaultColor: levelColor(node.level), note: nodeNotes[node.id] ?? '' });
              }}
            />
          )}
          {subView === 'stats' && <StatsView roots={parsedRoots} editedLabels={editedLabels} />}

          {editingNode && (
            <NodeEditModal
              nodeId={editingNode.id} label={editingNode.label} color={editingNode.color}
              defaultColor={editingNode.defaultColor} note={editingNode.note}
              onSave={handleSaveNode} onClose={() => setEditingNode(null)}
              onCreateTopic={handleCreateTopic}
              onAddSibling={() => handleAddNode('sibling')}
              onAddChild={() => handleAddNode('child')} />
          )}
        </div>
      )}
    </div>
  );
}
