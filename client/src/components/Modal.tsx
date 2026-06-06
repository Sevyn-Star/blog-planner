import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export default function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal ${size === 'sm' ? 'modal-sm' : ''}`}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
