import { test, expect } from "@playwright/test";

test("server workspace sends proposals and review actions with real persona IDs, never local XP", async ({
  page,
}) => {
  const task = {
    id: 41,
    owner_id: 7,
    title: "Серверная задача",
    context: "Сократить списания",
    publication_status: "published",
    execution_status: "not_started",
    readiness_score: 35,
    revision: 1,
    ai_status: "succeeded",
    draft_card: null,
  };
  const users = [
    { id: 7, name: "Владелец", role: "business", exp: 0 },
    { id: 19, name: "Капитан", role: "student", exp: 0 },
    { id: 23, name: "Участник", role: "student", exp: 0 },
  ];
  const teams = [
    {
      id: 64,
      name: "Реальная команда",
      members: [
        { user_id: 19, role: "captain" },
        { user_id: 23, role: "member" },
      ],
    },
  ];
  const proposals: any[] = [];
  let xp = 0;
  await page.route("http://backend.test/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/v1", "");
    const actor = req.headers()["x-demo-user-id"];
    const body = req.postDataJSON();
    let result: unknown;
    if (path === "/users") result = users;
    else if (path === "/teams") result = teams;
    else if (/^\/users\/\d+$/.test(path))
      result = {
        user: {
          ...users.find((u) => u.id === Number(path.split("/").pop())),
          exp: actor === "19" ? xp : 0,
        },
        exp_history: xp ? [{ id: 1, amount: xp, reason: "milestone" }] : [],
      };
    else if (path === "/tasks/41/proposals" && req.method() === "POST") {
      expect(actor).toBe("19");
      expect(body).toEqual({
        team_id: 64,
        solution_idea: "Моя идея",
        plan: "Мой план",
        duration_days: 7,
      });
      const p = {
        id: 90,
        task_id: 41,
        team_id: 64,
        ...body,
        status: "pending",
        execution_status: "not_started",
        milestones: [],
      };
      proposals.push(p);
      result = p;
    } else if (path === "/proposals/90/decision") {
      expect(actor).toBe("7");
      expect(body).toEqual({ status: "accepted" });
      proposals[0].status = "accepted";
      proposals[0].execution_status = "in_progress";
      task.execution_status = "in_progress";
      result = proposals[0];
    } else if (path === "/proposals/90/milestones") {
      expect(actor).toBe("7");
      const m = {
        id: 101,
        ...body,
        status: "pending",
        approved_at: "2026-09-23T12:00:00Z",
      };
      proposals[0].milestones.push(m);
      result = m;
    } else if (path === "/milestones/101/submit") {
      expect(actor).toBe("19");
      expect(body).toEqual({ result_url: "https://example.com/work" });
      Object.assign(proposals[0].milestones[0], body, { status: "submitted" });
      result = proposals[0].milestones[0];
    } else if (path === "/milestones/101/review") {
      expect(actor).toBe("7");
      proposals[0].milestones[0].status = body.accepted
        ? "completed"
        : "rejected";
      xp = body.accepted ? 100 : 0;
      result = proposals[0].milestones[0];
    } else if (path === "/proposals/90/complete") {
      expect(req.postData()).toBe(null);
      proposals[0].execution_status = "completed";
      result = proposals[0];
    } else if (path === "/tasks/41/complete") {
      task.execution_status = "completed";
      result = task;
    } else if (path.endsWith("/questions")) result = [];
    else if (path.endsWith("/proposals")) result = proposals;
    else if (path === "/tasks/41") result = task;
    else if (path === "/tasks" || path === "/tasks/mine") result = [task];
    else throw new Error(`Unexpected ${req.method()} ${path}`);
    await route.fulfill({ json: result });
  });
  await page.goto("/connected");
  await page.getByLabel("Адрес backend").fill("http://backend.test");
  await page.getByRole("button", { name: "Подключиться", exact: true }).click();
  const persona = page.getByLabel("Профиль", { exact: true });
  await persona.selectOption("23");
  await page
    .getByRole("button", { name: "Открыть задачу №41", exact: true })
    .click();
  await expect(
    page.getByText("Подать заявку может капитан команды.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Отправить заявку", exact: true }),
  ).toHaveCount(0);
  await persona.selectOption("19");
  await page
    .getByRole("button", { name: "Открыть задачу №41", exact: true })
    .click();
  await page.getByLabel("Идея решения").fill("Моя идея");
  await page.getByLabel("План работы").fill("Мой план");
  await page
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Реальная команда · Заявка №90" }),
  ).toBeVisible();
  await persona.selectOption("7");
  await page
    .getByRole("button", { name: "Открыть задачу №41", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Выбрать команду", exact: true })
    .click();
  await page.getByLabel("Название этапа").fill("Прототип");
  await page.getByLabel("Критерии результата").fill("Демонстрация работы");
  await page
    .getByRole("button", { name: "Добавить этап", exact: true })
    .click();
  for (const accepted of [false, true]) {
    await persona.selectOption("19");
    await page
      .getByRole("button", { name: "Открыть задачу №41", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Ссылка на результат")
      .fill("https://example.com/work");
    await page
      .getByRole("button", { name: "Отправить результат", exact: true })
      .click();
    await expect(page.getByText("submitted · 200 XP на команду")).toBeVisible();
    await persona.selectOption("7");
    await page
      .getByRole("button", { name: "Открыть задачу №41", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: accepted ? "Принять результат" : "Вернуть на доработку",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        `${accepted ? "completed" : "rejected"} · 200 XP на команду`,
      ),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Завершить работу команды", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Подтвердить завершение всей задачи",
      exact: true,
    })
    .click();
  await persona.selectOption("19");
  await expect(page.getByText("Опыт по данным сервера: 100 XP")).toBeVisible();
});

test("unreachable backend displays error and does not switch to fake success", async ({
  page,
}) => {
  await page.route("http://offline.test/**", (route) =>
    route.abort("connectionrefused"),
  );
  await page.goto("/connected");
  await page.getByLabel("Адрес backend").fill("http://offline.test");
  await page.getByRole("button", { name: "Подключиться", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Сервер не ответил");
  await expect(page.getByLabel("Профиль", { exact: true })).toHaveCount(0);
});

test("existing demo applications are visible and available filter excludes them", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Я студент/ }).click();
  await expect(
    page.getByRole("heading", { name: "Мои заявки", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Открыть каталог задач →" }).click();
  await expect(
    page.getByText("Ваша заявка на рассмотрении", { exact: true }),
  ).toHaveCount(3);
  await page.getByLabel("Только доступные для моей заявки").check();
  await expect(page.locator(".catalog-card")).toHaveCount(2);
  await expect(
    page.getByText("Можно подать заявку", { exact: true }),
  ).toHaveCount(2);
});

test("AI queues, polls, sends all answers, confirms revision and publishes without fabricated data", async ({
  page,
}, info) => {
  const user = { id: 8, name: "Бизнес AI", role: "business", exp: 0 };
  let task: any = null;
  let polls = 0;
  const questions = [1, 2, 3].map((id) => ({
    id: id + 50,
    position: id,
    question: `Уточнение ${id}`,
  }));
  await page.route("http://ai.test/api/v1/**", async (route) => {
    const r = route.request();
    const path = new URL(r.url()).pathname.replace("/api/v1", "");
    const body = r.postDataJSON();
    let result: unknown;
    if (path === "/users") result = [user];
    else if (path === "/teams") result = [];
    else if (path === "/users/8") result = { user, exp_history: [] };
    else if (path === "/tasks/mine") result = task ? [task] : [];
    else if (path === "/tasks" && r.method() === "POST") {
      expect(body).toEqual({
        raw_description: "Наша кофейня списывает молоко",
      });
      task = {
        id: 99,
        owner_id: 8,
        title: "",
        context: "",
        raw_description: body.raw_description,
        revision: 1,
        evaluated_revision: null,
        ai_status: "pending",
        publication_status: "draft",
        execution_status: "not_started",
        readiness_score: 0,
        draft_card: null,
        draft_evaluation: null,
      };
      result = task;
    } else if (path === "/tasks/99") {
      if (task.ai_status === "pending" && ++polls >= 2)
        task.ai_status = "succeeded";
      result = task;
    } else if (path === "/tasks/99/questions")
      result = task.ai_status === "succeeded" ? questions : [];
    else if (path === "/tasks/99/proposals") result = [];
    else if (path === "/tasks/99/answers") {
      expect(body).toEqual({
        revision: 1,
        answers: questions.map((q) => ({
          question_id: q.id,
          answer: `Ответ ${q.position}`,
        })),
      });
      Object.assign(task, {
        revision: 2,
        evaluated_revision: 2,
        ai_status: "pending",
        draft_card: {
          title: "Учёт молока",
          context: "Наша кофейня списывает молоко",
        },
        draft_evaluation: { score: 20, source: "fallback" },
      });
      polls = 0;
      result = task;
    } else if (path === "/tasks/99/confirm") {
      expect(body).toEqual({ revision: 2 });
      Object.assign(task, task.draft_card, {
        draft_card: null,
        draft_evaluation: null,
        confirmed_at: "2026-09-23T12:00:00Z",
        readiness_score: 20,
      });
      result = task;
    } else if (path === "/tasks/99/publish") {
      expect(r.postData()).toBe(null);
      task.publication_status = "published";
      result = task;
    } else throw new Error(`Unexpected ${r.method()} ${path}`);
    await route.fulfill({ json: result });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/connected");
  await page.getByLabel("Адрес backend").fill("http://ai.test");
  await page.getByRole("button", { name: "Подключиться", exact: true }).click();
  await page
    .getByLabel("Описание бизнес-проблемы")
    .fill("Наша кофейня списывает молоко");
  await page
    .getByRole("button", { name: "Создать и запустить анализ", exact: true })
    .click();
  for (let i = 1; i <= 3; i++)
    await page.getByLabel(`Уточнение ${i}`, { exact: true }).fill(`Ответ ${i}`);
  await page
    .getByRole("button", { name: "Отправить все ответы", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Подтвердить карточку", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Я проверил факты в карточке").check();
  await page
    .getByRole("button", { name: "Подтвердить карточку", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Опубликовать задачу", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Опубликовать задачу", exact: true }),
  ).toHaveCount(0);
  expect(task.publication_status).toBe("published");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("server-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: info.outputPath("server-desktop.png"),
    fullPage: true,
  });
});
