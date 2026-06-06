import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import {
  fetchPlanning,
  fetchDuplicates,
  deleteTopic,
  subscribeToUpdates,
  STATUS_LABELS,
  type PlanningItem,
  type DuplicateWarning,
} from '../api';
import TopicEditModal from './TopicEditModal';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  onNewTopic: () => void;
}

export default function PlanningView({ onNewTopic }: Props) {
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [warnings, setWarnings] = useState<DuplicateWarning[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlanningItem | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(() => {
    fetchPlanning().then(setItems);
    fetchDuplicates().then(setWarnings);
  }, []);

  useEffect(() => {
    load();
    return subscribeToUpdates(load);
  }, [load]);

  function requestDelete(item: PlanningItem, e: MouseEvent) {
    e.stopPropagation();
    setDeleteError('');
    setPendingDelete(item);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    setDeleteError('');
    try {
      await deleteTopic(pendingDelete.id);
      setPendingDelete(null);
      load();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="view-stack">
      {warnings.length > 0 && (
        <div className="alert alert-warning alert-readonly">
          <div className="alert-title">⚠ 重复检测 ({warnings.length})</div>
          <p className="alert-hint">系统自动检测，不可编辑。如需消除警告，请修改下方主题的标题或路径。</p>
          <ul className="alert-list">
            {warnings.map((w) => (
              <li key={`${w.topicA}-${w.topicB}`}>
                <strong>「{w.titleA}」</strong> ↔ <strong>「{w.titleB}」</strong>
                <span className="alert-reason">{w.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deleteError && (
        <div className="alert alert-warning">
          <div className="alert-title">删除失败</div>
          <p>{deleteError}</p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>没有待写主题</h3>
          <p>所有主题都已发布，或者还没有添加计划</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={onNewTopic}>
            + 新建主题
          </button>
        </div>
      ) : (
        <>
          <div className="view-toolbar">
            <p className="view-hint">点击卡片可编辑，右上角可删除主题</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onNewTopic}>
              + 新建主题
            </button>
          </div>
          <div className="card-grid">
            {items.map((item) => (
              <article
                key={item.id}
                className="card card-hover card-editable"
                onClick={() => setEditingId(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setEditingId(item.id)}
              >
                <div className="card-top">
                  <div className="card-top-left">
                    <span className={`badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                    {item.priority < 99 && (
                      <span className="priority-tag">P{item.priority}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="card-delete-btn"
                    title="删除主题"
                    disabled={deletingId === item.id}
                    onClick={(e) => requestDelete(item, e)}
                  >
                    {deletingId === item.id ? '…' : '×'}
                  </button>
                </div>
                <h3 className="card-title">{item.title}</h3>
                <div className="card-meta">
                  {item.planned_date && (
                    <span className="meta-chip">
                      <span className="meta-icon">📅</span>
                      {item.planned_date}
                    </span>
                  )}
                  {item.paths.map((p) => (
                    <span key={p} className="meta-chip path-chip">{p}</span>
                  ))}
                  {item.blocked_by && item.blocked_by.length > 0 && (
                    <span className="meta-chip deps-chip">
                      依赖 {item.blocked_by.join(', ')}
                    </span>
                  )}
                </div>
                <span className="card-edit-hint">点击编辑</span>
              </article>
            ))}
          </div>
        </>
      )}

      {editingId && (
        <TopicEditModal
          topicId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={load}
          onOpenTopic={setEditingId}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="删除主题"
          highlight={pendingDelete.title}
          confirmLabel="删除"
          variant="danger"
          loading={deletingId === pendingDelete.id}
          onConfirm={confirmDelete}
          onCancel={() => { setPendingDelete(null); setDeleteError(''); }}
        />
      )}
    </div>
  );
}
