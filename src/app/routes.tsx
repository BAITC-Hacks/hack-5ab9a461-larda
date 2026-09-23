import { Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RolePage } from "../features/business/RolePage";
import { BusinessPage } from "../features/business/BusinessPage";
import { TaskBuilder } from "../features/tasks/TaskBuilder";
import { TaskReview } from "../features/tasks/TaskReview";
import { CatalogPage } from "../features/catalog/CatalogPage";
import { TaskDetail } from "../features/catalog/TaskDetail";
import { ResponsesPage } from "../features/proposals/ResponsesPage";
import { ActionLink, EmptyState } from "../shared/ui/controls";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<RolePage />} />
        <Route path="business" element={<BusinessPage />} />
        <Route path="business/tasks" element={<BusinessPage listOnly />} />
        <Route path="business/new" element={<TaskBuilder />} />
        <Route path="business/tasks/:id" element={<TaskReview />} />
        <Route
          path="business/tasks/:id/responses"
          element={<ResponsesPage />}
        />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="catalog/:id" element={<TaskDetail />} />
        <Route
          path="*"
          element={
            <EmptyState title="Такой страницы нет">
              <ActionLink to="/">К выбору роли</ActionLink>
            </EmptyState>
          }
        />
      </Route>
    </Routes>
  );
}
