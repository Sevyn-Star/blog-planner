import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  fetchWorkspaces,
  getWorkspaceId,
  setWorkspaceId as saveWorkspaceId,
  type WorkspaceMeta,
} from './api';

interface WorkspaceContextValue {
  workspaceId: string;
  workspace: WorkspaceMeta | null;
  workspaces: WorkspaceMeta[];
  switchWorkspace: (id: string) => void;
  reloadWorkspaces: () => Promise<void>;
  version: number;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceIdState] = useState(getWorkspaceId);
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [version, setVersion] = useState(0);

  const reloadWorkspaces = useCallback(async () => {
    try {
      const list = await fetchWorkspaces();
      setWorkspaces(list);
      if (list.length > 0 && !list.some((w) => w.id === workspaceId)) {
        const fallback = list[0].id;
        saveWorkspaceId(fallback);
        setWorkspaceIdState(fallback);
        setVersion((v) => v + 1);
      }
    } catch {
      setWorkspaces([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    reloadWorkspaces();
  }, [reloadWorkspaces]);

  const switchWorkspace = useCallback((id: string) => {
    saveWorkspaceId(id);
    setWorkspaceIdState(id);
    setVersion((v) => v + 1);
  }, []);

  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{ workspaceId, workspace, workspaces, switchWorkspace, reloadWorkspaces, version }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
