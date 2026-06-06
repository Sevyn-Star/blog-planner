import { useState, type FormEvent } from 'react';
import { createWorkspace } from '../api';
import { useWorkspace } from '../WorkspaceContext';
import Modal from './Modal';

interface Props {
  onClose: () => void;
}

export default function CreateWorkspaceModal({ onClose }: Props) {
  const { switchWorkspace, reloadWorkspaces } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const ws = await createWorkspace(name.trim(), description.trim() || undefined);
      await reloadWorkspaces();
      switchWorkspace(ws.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="新建工作区" onClose={onClose} size="sm">
      <form className="modal-body" onSubmit={handleSubmit}>
        <p className="modal-intro">
          每个工作区有独立的思维导图和主题，互不影响。适合记录完全不同类型的内容。
        </p>
        {error && <div className="alert alert-warning">{error}</div>}
        <div className="form-group">
          <label>工作区名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：技术博客、读书笔记、旅行计划"
            required
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>描述（可选）</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要说明用途"
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
            {loading ? '创建中...' : '创建并切换'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
