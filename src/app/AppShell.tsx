import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useWorkspace } from "./WorkspaceProvider";
import { ActionLink } from "../shared/ui/controls";

export function AppShell() {
  const { state } = useWorkspace();
  const { pathname } = useLocation();
  const business =
    pathname.startsWith("/business") ||
    (pathname.startsWith("/catalog") && state.role === "business");
  const student =
    pathname.startsWith("/student") ||
    (pathname.startsWith("/catalog") && !business);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const main = document.getElementById("main-content");
    main?.focus({ preventScroll: true });
    document.title = `${pathname.startsWith("/catalog") || pathname.startsWith("/student/catalog") ? "Каталог задач" : student ? "Прогресс студента" : pathname === "/" ? "Выберите роль" : "Кабинет бизнеса"} — Larda`;
  }, [pathname, student]);
  return (
    <div className="app-theme">
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="Larda — выбор роли">
            Larda
            <span className="brand-dot" />
          </Link>
          {pathname !== "/" && (
            <>
              <nav className="main-nav" aria-label="Основная навигация">
                {business && (
                  <>
                    <NavLink to="/business" end>
                      Рабочий стол
                    </NavLink>
                    <NavLink to="/business/tasks">Мои задачи</NavLink>
                  </>
                )}
                {student && (
                  <NavLink to="/student" end>
                    Рабочий стол
                  </NavLink>
                )}
                <NavLink to={student ? "/student/catalog" : "/catalog"}>
                  Каталог задач
                </NavLink>
              </nav>
              <div className="header-actions">
                {business && (
                  <ActionLink to="/business/new" className="header-create">
                    + Создать задачу
                  </ActionLink>
                )}
                <Link className="role-switch" to="/">
                  <span className="role-avatar" aria-hidden="true">
                    {business ? "Б" : "С"}
                  </span>
                  <span>
                    {business ? "Бизнес" : "Студент"}
                    <small>Сменить роль</small>
                  </span>
                </Link>
              </div>
            </>
          )}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="container">
        <div key={pathname} className="motion-page-enter">
          <Outlet />
        </div>
      </main>
      <footer className="site-footer">
        <span>Larda · Бизнес и студенческие команды</span>
        <span>
          Локальное демо · подтверждения без авторизации · данные в этой вкладке
        </span>
      </footer>
    </div>
  );
}
