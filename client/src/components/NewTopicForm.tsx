import { useEffect, useState, type FormEvent } from 'react';
import { createTopic, fetchTaxonomyPaths } from '../api';

export default function NewTopicForm({ onCreated }: { onCreated: () => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [status, setStatus] = useState('idea');
  const [tags, setTags] = useState('');
  const [priority, setPriority] = useState('3');
  const [plannedDate, setPlannedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTaxonomyPaths().then(setPaths);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const path = customPath.trim() || selectedPath;
    if (!path) {
      setError('请选择或输入层级路径');
      setLoading(false);
      return;
    }

    try {
      await createTopic({
        title,
        paths: [path],
        status,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        priority: Number(priority),
        planned_date: plannedDate || undefined,
      });
      setMessage(`主题「${title}」已创建，思维导图会自动更新`);
      setTitle('');
      setTags('');
      setPlannedDate('');
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="form-panel">
      <form className="form" onSubmit={handleSubmit}>
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-warning">{error}</div>}

        <div className="form-section">
          <h3 className="form-section-title">基本信息</h3>
          <div className="form-group">
            <label>主题标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：Go Channel 原理"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>状态</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="idea">💡 想法</option>
                <option value="outline">📝 大纲</option>
                <option value="draft">✏️ 草稿</option>
                <option value="published">✅ 已发布</option>
              </select>
            </div>
            <div className="form-group">
              <label>优先级（1 最高）</label>
              <input
                type="number"
                min="1"
                max="10"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">分类与路径</h3>
          <div className="form-group">
            <label>层级路径</label>
            <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
              <option value="">选择已有路径...</option>
              {paths.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>或自定义路径（用 / 分隔）</label>
            <input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="例如：技术/后端/Go/并发"
            />
          </div>
          <div className="form-group">
            <label>标签（逗号分隔）</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="go, concurrency"
            />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">计划</h3>
          <div className="form-group">
            <label>计划写作日期</label>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading || !title}>
          {loading ? '创建中...' : '创建主题'}
        </button>
      </form>

      <aside className="form-hint">
        <h4>提示</h4>
        <ul>
          <li>创建后会自动生成 Markdown 文件到 <code>topics/</code></li>
          <li>思维导图会实时同步，无需手动刷新</li>
          <li>正文里可以用 <code>[[主题ID]]</code> 建立链接</li>
        </ul>
      </aside>
    </div>
  );
}
