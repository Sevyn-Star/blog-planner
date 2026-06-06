import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`custom-select${open ? ' open' : ''}${disabled ? ' disabled' : ''}`} ref={ref}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="custom-select-value">
          {selected ? (
            <>
              {selected.color && <span className="custom-select-dot" style={{ background: selected.color }} />}
              {selected.icon && <span className="custom-select-icon">{selected.icon}</span>}
              <span className="custom-select-label">{selected.label}</span>
            </>
          ) : (
            <span className="custom-select-placeholder">{placeholder}</span>
          )}
        </span>
        <svg className="custom-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="custom-select-menu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`custom-select-option${opt.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.color && <span className="custom-select-dot" style={{ background: opt.color }} />}
              {opt.icon && <span className="custom-select-icon">{opt.icon}</span>}
              <span className="custom-select-option-label">{opt.label}</span>
              {opt.value === value && (
                <svg className="custom-select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
