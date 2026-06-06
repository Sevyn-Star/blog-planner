import type { FC } from 'react';
import type { View } from '../api';

type IconProps = { size?: number };

export function IconGraph({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v4M10.5 11L6 17M13.5 11l4.5 6" />
    </svg>
  );
}

export function IconPlanning({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconTimeline({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconCoverage({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}

export function IconPlus({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconMindMapImport({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="10" width="5" height="4" rx="1" />
      <rect x="9" y="4" width="5" height="4" rx="1" />
      <rect x="9" y="16" width="5" height="4" rx="1" />
      <rect x="17" y="7" width="5" height="4" rx="1" />
      <rect x="17" y="13" width="5" height="4" rx="1" />
      <path d="M7 12h2M14 6h1.5M14 18h1.5M11.5 8v8" />
    </svg>
  );
}

export const VIEW_ICONS: Record<View, FC<IconProps>> = {
  graph: IconGraph,
  planning: IconPlanning,
  timeline: IconTimeline,
  coverage: IconCoverage,
  new: IconPlus,
  mindmap: IconMindMapImport,
};

export function IconSpark({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
        fill="url(#spark-grad)"
        stroke="url(#spark-grad)"
        strokeWidth="1"
      />
      <defs>
        <linearGradient id="spark-grad" x1="2" y1="2" x2="22" y2="22">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
