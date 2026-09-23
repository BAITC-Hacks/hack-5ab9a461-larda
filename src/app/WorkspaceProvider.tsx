import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { WorkspaceRepository } from "../data/WorkspaceRepository";

const WorkspaceContext = createContext<WorkspaceRepository | null>(null);
export function WorkspaceProvider({
  repository,
  children,
}: {
  repository: WorkspaceRepository;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={repository}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const repository = useContext(WorkspaceContext);
  if (!repository) throw new Error("WorkspaceProvider is required");
  const state = useSyncExternalStore(
    repository.subscribe,
    repository.getSnapshot,
  );
  return { state, repository };
}
