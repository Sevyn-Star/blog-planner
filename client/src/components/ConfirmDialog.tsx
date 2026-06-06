import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title?: string;
  highlight?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title = '确认操作',
  highlight,
  description = '此操作不可恢复。',
  confirmLabel = '确定',
  cancelLabel = '取消',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onCancel, loading]);

  return createPortal(
    <div
      className="confirm-overlay"
      onMouseDown={(e) => { mouseDownTargetRef.current = e.target; }}
      onMouseUp={(e) => {
        if (!loading && e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) {
          onCancel();
        }
        mouseDownTargetRef.current = null;
      }}
    >
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className={`confirm-icon${variant === 'danger' ? ' confirm-icon-danger' : ''}`}>
          {variant === 'danger' ? '⚠' : '?'}
        </div>
        <h3 id="confirm-title" className="confirm-title">{title}</h3>
        <p className="confirm-message">
          {highlight ? (
            <>确定删除主题 <strong className="confirm-highlight">「{highlight}」</strong>？{description}</>
          ) : (
            description
          )}
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${variant === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
