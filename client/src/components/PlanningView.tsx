import { useCallback, useEffect, useState } from 'react';
import {
  fetchPlanning,
  fetchDuplicates,
  subscribeToUpdates,
  STATUS_LABELS,
  type PlanningItem,
  type DuplicateWarning,
} from '../api';
import TopicEditModal from './TopicEditModal';

export default function PlanningView() {
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [warnings, setWarnings] = useState<DuplicateWarning[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPlanning().then(setItems);
    fetchDuplicates().then(setWarnings);
  }, []);

  useEffect(() => {
    load();
    return subscribeToUpdates(load);
  }, [load]);

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

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>没有待写主题</h3>
          <p>所有主题都已发布，或者还没有添加计划</p>
        </div>
      ) : (
        <>
          <p className="view-hint">点击卡片可编辑标题、状态、计划日期等内容</p>
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
                  <span className={`badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  {item.priority < 99 && (
                    <span className="priority-tag">P{item.priority}</span>
                  )}
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
        />
      )}
    </div>
  );
}
