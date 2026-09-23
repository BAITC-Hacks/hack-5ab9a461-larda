import { BrowserRouter } from "react-router-dom";
import { WorkspaceProvider } from "./app/WorkspaceProvider";
import { AppRoutes } from "./app/routes";
import { createMockRepository } from "./data/mockRepository";

const repository = createMockRepository(window.sessionStorage);
export default function App() {
  return (
    <WorkspaceProvider repository={repository}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </WorkspaceProvider>
  );
}
