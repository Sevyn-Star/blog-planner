import { createContext, useContext } from 'react';

interface GraphEditContextValue {
  onEditNode: (nodeId: string, type: 'category' | 'topic', label: string) => void;
}

export const GraphEditContext = createContext<GraphEditContextValue | null>(null);

export function useGraphEdit() {
  return useContext(GraphEditContext);
}
