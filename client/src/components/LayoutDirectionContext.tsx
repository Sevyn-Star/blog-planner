import { createContext, useContext } from 'react';
import type { LayoutDirection } from '../api';

export const LayoutDirectionContext = createContext<LayoutDirection>('TB');

export function useLayoutDirection() {
  return useContext(LayoutDirectionContext);
}

export function getHandlePositions(direction: LayoutDirection) {
  switch (direction) {
    case 'BT':
      return { target: 'bottom' as const, source: 'top' as const };
    case 'LR':
      return { target: 'left' as const, source: 'right' as const };
    case 'RL':
      return { target: 'right' as const, source: 'left' as const };
    default:
      return { target: 'top' as const, source: 'bottom' as const };
  }
}
