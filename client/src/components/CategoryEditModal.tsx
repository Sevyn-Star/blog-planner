import { useState, type FormEvent } from 'react';
import { renameCategoryPath } from '../api';
import Modal from './Modal';

interface Props {
  path: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function CategoryEditModal({ path, label, onClose, onSaved }: Props) {
  const [newPath, setNewPath] = useState(path);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await renameCategoryPath(path, newPath.trim());
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="编辑分类板块" onClose={onClose} size="sm">
      <form className="modal-body" onSubmit={handleSubmit}>
        <p className="modal-intro">
          修改「{label}」的层级路径。该分类下的所有子路径和关联主题会同步更新。
        </p>
        {error && <div className="alert alert-warning">{error}</div>}
        <div className="form-group">
          <label>层级路径</label>
          <input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="例如：技术/后端/Go"
            required
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !newPath.trim()}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
