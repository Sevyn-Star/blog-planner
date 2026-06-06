interface Props {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}

export default function NumberStepper({ value, onChange, min = 1, max = 10 }: Props) {
  const num = Number(value);
  const current = Number.isFinite(num) ? num : min;

  function step(delta: number) {
    onChange(String(Math.min(max, Math.max(min, current + delta))));
  }

  function handleChange(raw: string) {
    if (raw === '') {
      onChange('');
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange(String(Math.min(max, Math.max(min, Math.round(n)))));
  }

  return (
    <div className="number-stepper">
      <input
        type="text"
        inputMode="numeric"
        className="number-stepper-input"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
      />
      <div className="number-stepper-btns">
        <button
          type="button"
          className="number-stepper-btn"
          onClick={() => step(1)}
          disabled={current >= max}
          aria-label="增加"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          type="button"
          className="number-stepper-btn"
          onClick={() => step(-1)}
          disabled={current <= min}
          aria-label="减少"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
