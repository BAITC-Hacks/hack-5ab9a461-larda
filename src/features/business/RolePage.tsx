import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../../app/WorkspaceProvider";
import { ErrorMessage, useAction } from "../../shared/ui/controls";
import type { Role } from "../../domain/models";

export function RolePage() {
  const { repository } = useWorkspace();
  const navigate = useNavigate();
  const action = useAction();
  const choose = (role: Role) =>
    action.run(async () => {
      await repository.setRole(role);
      navigate(role === "business" ? "/business" : "/catalog");
    });
  return (
    <section className="role-page">
      <p className="overline">Добро пожаловать в Larda</p>
      <h1>Как вы хотите работать сегодня?</h1>
      <p className="intro">
        Помогаем бизнесу понятно описать задачу,
        <br className="desktop-break" /> а студентам — предложить решение.
      </p>
      <div className="role-grid">
        <button
          className="role-card"
          onClick={() => choose("business")}
          disabled={action.busy}
        >
          <span className="role-icon" aria-hidden="true">
            ▤
          </span>
          <h2>Я представляю бизнес</h2>
          <p>
            Создайте задачу и выберите команду,
            <br /> которая поможет её решить.
          </p>
          <span className="role-card__action">
            Перейти в кабинет <span aria-hidden="true">→</span>
          </span>
        </button>
        <button
          className="role-card role-card--student"
          onClick={() => choose("student")}
          disabled={action.busy}
        >
          <span className="role-icon" aria-hidden="true">
            ⌘
          </span>
          <h2>Я студент</h2>
          <p>
            Найдите задачу от компании
            <br /> и предложите решение своей команды.
          </p>
          <span className="role-card__action">
            Посмотреть задачи <span aria-hidden="true">→</span>
          </span>
        </button>
      </div>
      <ErrorMessage message={action.error} />
      <p className="role-footnote">Роль можно сменить в любой момент.</p>
    </section>
  );
}
