import { useCallback, useEffect, useState } from 'react';
import GraphView from './components/GraphView';
import PlanningView from './components/PlanningView';
import TimelineView from './components/TimelineView';
import CoverageView from './components/CoverageView';
import NewTopicForm from './components/NewTopicForm';
import CreateWorkspaceModal from './components/CreateWorkspaceModal';
import ErrorBoundary from './components/ErrorBoundary';
import ConfirmDialog from './components/ConfirmDialog';
import { IconSpark, VIEW_ICONS } from './components/Icons';
import { fetchGraph, fetchTopics, subscribeToUpdates, type View } from './api';
import { useWorkspace } from './WorkspaceContext';

const VIEWS: { id: View; label: string; desc: string }[] = [
  { id: 'graph', label: '思维导图', desc: '当前工作区的结构与主题关联' },
  { id: 'planning', label: '写作规划', desc: '待写队列与重复检测' },
  { id: 'timeline', label: '时间线', desc: '发布记录与进行中' },
  { id: 'coverage', label: '覆盖度', desc: '各层级写作进度' },
  { id: 'new', label: '新建主题', desc: '在当前工作区添加主题' },
];

export default function App() {
  const { workspaceId, workspace, workspaces, switchWorkspace, version } = useWorkspace();
  const [view, setView] = useState<View>('graph');
  const [updatedAt, setUpdatedAt] = useState('');
  const [topicCount, setTopicCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [mmDirty, setMmDirty] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);

  const trySetView = (next: View) => {
    if (view === 'graph' && next !== 'graph' && mmDirty) {
      setPendingView(next);
      return;
    }
    setView(next);
  };

  const refresh = useCallback(() => {
    fetchGraph()
      .then((g) => setUpdatedAt(g.updatedAt))
      .catch(() => setUpdatedAt(''));
    fetchTopics()
      .then((topics) => {
        setTopicCount(topics.length);
        setPublishedCount(topics.filter((t) => t.status === 'published').length);
      })
      .catch(() => {
        setTopicCount(0);
        setPublishedCount(0);
      });
  }, []);

  useEffect(() => {
    refresh();
    return subscribeToUpdates(refresh);
  }, [refresh, workspaceId, version]);

  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <IconSpark />
          <div>
            <div className="sidebar-title">Blog Planner</div>
            <div className="sidebar-subtitle">内容规划</div>
          </div>
        </div>

        <div className="workspace-switcher">
          <label className="workspace-label">工作区</label>
          <select
            className="workspace-select"
            value={workspaceId}
            onChange={(e) => switchWorkspace(e.target.value)}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="workspace-add-btn"
            onClick={() => setShowCreateWs(true)}
            title="新建工作区"
          >
            +
          </button>
        </div>

        <nav className="sidebar-nav">
          {VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v.id];
            return (
              <button
                key={v.id}
                className={`sidebar-link ${view === v.id ? 'active' : ''}`}
                onClick={() => trySetView(v.id)}
              >
                <Icon size={17} />
                <span>{v.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-stats">
          <div className="stat-item">
            <span className="stat-value">{topicCount}</span>
            <span className="stat-label">主题</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{publishedCount}</span>
            <span className="stat-label">已发布</span>
          </div>
        </div>
      </aside>

      <div className="content-area">
        <header className="page-header">
          <div>
            <h1 className="page-title">{current.label}</h1>
            <p className="page-desc">
              {workspace ? `${workspace.name} · ${current.desc}` : current.desc}
            </p>
          </div>
          {updatedAt && (
            <div className="page-meta">
              <span className="live-dot" />
              同步于 {new Date(updatedAt).toLocaleString('zh-CN')}
            </div>
          )}
        </header>

        <main className="main" key={workspaceId}>
          <ErrorBoundary>
            {view === 'graph' && <GraphView key={version} onMindMapDirtyChange={setMmDirty} />}
            {view === 'planning' && <PlanningView key={version} onNewTopic={() => trySetView('new')} />}
            {view === 'timeline' && <TimelineView key={version} />}
            {view === 'coverage' && <CoverageView key={version} />}
            {view === 'new' && <NewTopicForm key={version} onCreated={refresh} />}
          </ErrorBoundary>
        </main>
      </div>

      {showCreateWs && <CreateWorkspaceModal onClose={() => setShowCreateWs(false)} />}

      {pendingView && (
        <ConfirmDialog
          title="未保存的更改"
          description="MD 导入中有未保存的修改，离开页面后将丢失这些更改。确定要离开吗？"
          confirmLabel="离开不保存"
          cancelLabel="继续编辑"
          variant="danger"
          onConfirm={() => { setView(pendingView); setPendingView(null); setMmDirty(false); }}
          onCancel={() => setPendingView(null)}
        />
      )}
    </div>
  );
}
