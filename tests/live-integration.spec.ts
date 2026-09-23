import { test, expect } from "@playwright/test";

test("live PostgreSQL + API + frontend: AI, publication, proposal, rework, verification, refresh", async ({
  page,
  request,
}, info) => {
  const health = await request.get("/healthz");
  expect(health.ok()).toBe(true);
  const users = await (await request.get("/api/v1/users")).json();
  const teams = await (await request.get("/api/v1/teams")).json();
  const business = users.find((u: any) => u.role === "business");
  const team = teams.find((t: any) =>
    t.members?.some((m: any) => m.role === "captain"),
  );
  const captain = team.members.find((m: any) => m.role === "captain").user_id;
  const member = team.members.find((m: any) => m.role === "member").user_id;
  const before = await (await request.get(`/api/v1/users/${captain}`)).json();
  const title = `Проверка интеграции ${Date.now()}`;
  await page.goto(`/?user=${business.id}`);
  await page
    .getByLabel("Описание бизнес-проблемы")
    .fill(`${title}\nКофейне нужен учёт списаний молока.`);
  await page
    .getByRole("button", { name: "Создать и запустить анализ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Уточнения AI", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const taskId = new URL(page.url()).searchParams.get("task");
  expect(taskId).toBeTruthy();
  const questionForm = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Отправить все ответы",
      exact: true,
    }),
  });
  const textareas = questionForm.locator("textarea");
  for (let i = 0; i < (await textareas.count()); i++)
    await textareas.nth(i).fill(`Проверенный факт бизнеса ${i + 1}`);
  await page
    .getByRole("button", { name: "Отправить все ответы", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Подтвердить карточку", exact: true }),
  ).toBeVisible({ timeout: 20000 });
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
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto(`/?user=${member}&task=${taskId}`);
  await expect(
    page.getByText("Подать заявку может капитан команды.", { exact: false }),
  ).toBeVisible();
  await page.goto(`/?user=${captain}&task=${taskId}`);
  await page.getByLabel("Идея решения").fill("Прототип учёта списаний");
  await page
    .getByLabel("План работы")
    .fill("Анализ данных, прототип, проверка");
  await page
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Заявка №/ })).toBeVisible();
  const afterProposal = await (
    await request.get(`/api/v1/users/${captain}`)
  ).json();
  expect(afterProposal.user.exp).toBe(before.user.exp);
  await page.goto(`/?user=${business.id}&task=${taskId}`);
  await page
    .getByRole("button", { name: "Выбрать команду", exact: true })
    .click();
  await page.getByLabel("Название этапа").fill("Рабочий прототип");
  await page
    .getByLabel("Критерии результата")
    .fill("Запись списания и отчёт за неделю");
  await page
    .getByRole("button", { name: "Добавить этап", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Рабочий прототип", exact: true }),
  ).toBeVisible();
  for (const accepted of [false, true]) {
    await page.goto(`/?user=${captain}&task=${taskId}`);
    await page
      .getByLabel("Ссылка на результат")
      .fill("https://example.com/larda-integration-evidence");
    await page
      .getByRole("button", { name: "Отправить результат", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Открыть результат ↗" }),
    ).toBeVisible();
    await page.goto(`/?user=${business.id}&task=${taskId}`);
    await page
      .getByRole("button", {
        name: accepted ? "Принять результат" : "Вернуть на доработку",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Принять результат", exact: true }),
    ).toHaveCount(0);
    if (!accepted) {
      const p = await (await request.get(`/api/v1/users/${captain}`)).json();
      expect(p.user.exp).toBe(before.user.exp);
    }
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
  await expect(
    page.getByRole("button", {
      name: "Подтвердить завершение всей задачи",
      exact: true,
    }),
  ).toHaveCount(0);
  const after = await (await request.get(`/api/v1/users/${captain}`)).json();
  expect(after.user.exp).toBeGreaterThan(before.user.exp);
  await page.goto(`/?user=${captain}&task=${taskId}`);
  await expect(
    page.getByText(`Опыт по данным сервера: ${after.user.exp} XP`),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const proposals = await (
    await request.get(`/api/v1/tasks/${taskId}/proposals`, {
      headers: { "X-Demo-User-ID": String(business.id) },
    })
  ).json();
  const stage = proposals[0].milestones[0];
  const repeated = await request.post(`/api/v1/milestones/${stage.id}/review`, {
    headers: { "X-Demo-User-ID": String(business.id) },
    data: { accepted: true },
  });
  expect([200, 409]).toContain(repeated.status());
  const again = await (await request.get(`/api/v1/users/${captain}`)).json();
  expect(again.user.exp).toBe(after.user.exp);
  await page.screenshot({
    path: info.outputPath("integrated-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("integrated-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "← К списку задач", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Каталог задач", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Достижения", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("dashboard-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: info.outputPath("dashboard-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Каталог задач", exact: true })
    .click();
  await expect(page).toHaveURL(/#catalog$/);

  await page
    .getByRole("button", { name: `Открыть задачу №${taskId}`, exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Каталог задач", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto(`/student/catalog/${taskId}?user=${captain}`);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "← К списку задач", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Каталог задач", exact: true }),
  ).toBeVisible();
  await page.goto(`/?user=${business.id}`);
  await expect(
    page.getByRole("heading", { name: "Требует вашего решения", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("business-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("business-mobile.png"),
    fullPage: true,
  });
});

test("default server mode shows an API failure instead of local fixtures", async ({
  page,
}) => {
  await page.route("**/api/v1/users", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "unavailable", message: "API временно недоступен" },
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Сервер временно недоступен",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "API временно недоступен",
  );
  await expect(page.getByRole("button", { name: /Я студент/ })).toHaveCount(0);
  await expect(page.getByLabel("Профиль", { exact: true })).toHaveCount(0);
});

test("switching from a direct private draft link clears the task for the student", async ({
  page,
  request,
}) => {
  const users = await (await request.get("/api/v1/users")).json();
  const owner = users.find((u: any) => u.role === "business");
  const student = users.find((u: any) => u.role === "student");
  const tasks = await (
    await request.get("/api/v1/tasks/mine", {
      headers: { "X-Demo-User-ID": String(owner.id) },
    })
  ).json();
  const draft = tasks.find((t: any) => t.publication_status === "draft");
  expect(draft).toBeTruthy();
  await page.goto(`/business/tasks/${draft.id}?user=${owner.id}`);
  await expect(
    page.getByRole("button", { name: "← К списку задач", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Профиль", { exact: true })
    .selectOption(String(student.id));
  await expect(
    page.getByRole("heading", { name: "Каталог задач", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("task")).toBe("");
});
