import { useEffect, useState, type FormEvent } from 'react';
import {
  fetchTopic,
  fetchTaxonomyPaths,
  updateTopic,
  STATUS_LABELS,
} from '../api';
import Modal from './Modal';

interface Props {
  topicId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function TopicEditModal({ topicId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [paths, setPaths] = useState<string[]>([]);

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('idea');
  const [path, setPath] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [tags, setTags] = useState('');
  const [priority, setPriority] = useState('3');
  const [plannedDate, setPlannedDate] = useState('');
  const [publishedDate, setPublishedDate] = useState('');
  const [blockedBy, setBlockedBy] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    fetchTaxonomyPaths().then(setPaths);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchTopic(topicId)
      .then((topic) => {
        setTitle(topic.meta.title);
        setStatus(topic.meta.status);
        setPath(topic.meta.paths[0] || '');
        setTags(topic.meta.tags.join(', '));
        setPriority(String(topic.meta.priority ?? 3));
        setPlannedDate(topic.meta.planned_date || '');
        setPublishedDate(topic.meta.published || '');
        setBlockedBy(topic.meta.blocked_by?.join(', ') || '');
        setContent(topic.content);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [topicId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const finalPath = customPath.trim() || path;
    if (!finalPath) {
      setError('请填写层级路径');
      setSaving(false);
      return;
    }

    try {
      await updateTopic(topicId, {
        title,
        status,
        paths: [finalPath],
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        priority: Number(priority),
        planned_date: plannedDate || undefined,
        published: publishedDate || undefined,
        blocked_by: blockedBy.split(',').map((t) => t.trim()).filter(Boolean),
        content,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="编辑主题" onClose={onClose}>
      {loading ? (
        <div className="modal-body empty-state">
          <div className="spinner" />
          <p>加载中...</p>
        </div>
      ) : (
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="alert alert-warning">{error}</div>}

          <div className="form-group">
            <label>标题</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>状态</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>优先级</label>
              <input
                type="number"
                min="1"
                max="10"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>层级路径</label>
            <select value={path} onChange={(e) => setPath(e.target.value)}>
              <option value="">选择路径...</option>
              {paths.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>或自定义路径</label>
            <input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="技术/后端/Go/并发"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>计划日期</label>
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>发布日期</label>
              <input type="date" value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>标签（逗号分隔）</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="go, concurrency" />
          </div>

          <div className="form-group">
            <label>前置依赖（主题 ID，逗号分隔）</label>
            <input value={blockedBy} onChange={(e) => setBlockedBy(e.target.value)} placeholder="go-channel-basics" />
          </div>

          <div className="form-group">
            <label>正文（Markdown）</label>
            <textarea
              className="content-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !title}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
