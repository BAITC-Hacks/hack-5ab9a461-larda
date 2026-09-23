import { BrowserRouter } from "react-router-dom";
import { WorkspaceProvider } from "./app/WorkspaceProvider";
import { AppRoutes } from "./app/routes";
import { createMockRepository } from "./data/mockRepository";
import { ConnectedPage } from "./features/connected/ConnectedPage";

// Local fixtures are opt-in and never serve as a fallback for a failed API.
const localMode = import.meta.env.VITE_DATA_MODE === "local";
const repository = localMode
  ? createMockRepository(window.sessionStorage)
  : null;
export default function App() {
  return (
    <BrowserRouter>
      {repository ? (
        <WorkspaceProvider repository={repository}>
          <AppRoutes />
        </WorkspaceProvider>
      ) : (
        <ConnectedPage integrated />
      )}
    </BrowserRouter>
  );
}
