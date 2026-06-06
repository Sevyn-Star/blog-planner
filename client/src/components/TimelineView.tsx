import { useCallback, useEffect, useState } from 'react';
import { fetchTopics, subscribeToUpdates, STATUS_LABELS, type TopicSummary } from '../api';
import TopicEditModal from './TopicEditModal';

export default function TimelineView() {
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchTopics().then((data) => {
      const sorted = [...data].sort((a, b) => {
        const dateA = a.published || a.created || '';
        const dateB = b.published || b.created || '';
        return dateB.localeCompare(dateA);
      });
      setTopics(sorted);
    });
  }, []);

  useEffect(() => {
    load();
    return subscribeToUpdates(load);
  }, [load]);

  const published = topics.filter((t) => t.status === 'published');
  const others = topics.filter((t) => t.status !== 'published');

  return (
    <div className="view-stack">
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">已发布</h2>
          <span className="section-count">{published.length}</span>
        </div>
        {published.length === 0 ? (
          <div className="empty-inline">还没有发布的文章</div>
        ) : (
          <div className="timeline">
            {published.map((t) => (
              <article
                key={t.id}
                className="timeline-item timeline-editable"
                onClick={() => setEditingId(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setEditingId(t.id)}
              >
                <div className="timeline-marker" />
                <div className="timeline-card">
                  <time className="timeline-date">{t.published || t.created}</time>
                  <h3 className="timeline-title">{t.title}</h3>
                  <div className="card-meta">
                    {t.paths.map((p) => (
                      <span key={p} className="meta-chip path-chip">{p}</span>
                    ))}
                    {t.tags.map((tag) => (
                      <span key={tag} className="meta-chip tag-chip">#{tag}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">进行中</h2>
          <span className="section-count">{others.length}</span>
        </div>
        {others.length === 0 ? (
          <div className="empty-inline">没有进行中的主题</div>
        ) : (
          <div className="card-grid">
            {others.map((t) => (
              <article
                key={t.id}
                className="card card-hover card-editable"
                onClick={() => setEditingId(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setEditingId(t.id)}
              >
                <div className="card-top">
                  <span className={`badge ${t.status}`}>{STATUS_LABELS[t.status]}</span>
                </div>
                <h3 className="card-title">{t.title}</h3>
                <div className="card-meta">
                  {t.created && <span className="meta-chip">创建 {t.created}</span>}
                  {t.planned_date && (
                    <span className="meta-chip">
                      <span className="meta-icon">📅</span>
                      {t.planned_date}
                    </span>
                  )}
                </div>
                <span className="card-edit-hint">点击编辑</span>
              </article>
            ))}
          </div>
        )}
      </section>

      {editingId && (
        <TopicEditModal
          topicId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={load}
          onOpenTopic={setEditingId}
        />
      )}
    </div>
  );
}
