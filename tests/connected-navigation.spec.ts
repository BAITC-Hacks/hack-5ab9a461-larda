import { expect, test, type Page, type Route } from "@playwright/test";

const users = [
  { id: 7, name: "Владелец", role: "business", exp: 0 },
  { id: 19, name: "Капитан", role: "student", exp: 0 },
  { id: 23, name: "Участник", role: "student", exp: 0 },
];
const teams = [
  {
    id: 64,
    name: "Команда навигации",
    members: [
      { user_id: 19, role: "captain" },
      { user_id: 23, role: "member" },
    ],
  },
];
const card = {
  title: "Открытая задача",
  context: "Обработка обращений",
  need: "Собирать обращения",
  expected_result: "Рабочий прототип",
  success_criteria: "Проверка бизнесом",
  target_users: "Менеджеры",
  available_data: "Тестовые обращения",
  constraints: "Без персональных данных",
  contact: "Владелец",
  interaction_format: "Онлайн",
  feedback_process: "После демонстрации",
};
const publicTask = {
  ...card,
  id: 41,
  owner_id: 7,
  raw_description: card.context,
  revision: 1,
  evaluated_revision: 1,
  ai_status: "succeeded",
  ai_error: "",
  publication_status: "published",
  execution_status: "not_started",
  readiness_score: 80,
  draft_card: null,
  draft_evaluation: null,
  confirmed_at: "2026-09-23T12:00:00Z",
};

async function connect(page: Page) {
  await page.goto("/connected");
  await page.getByLabel("Адрес backend").fill("http://navigation.test");
  await page.getByRole("button", { name: "Подключиться", exact: true }).click();
  await expect(page.getByLabel("Профиль", { exact: true })).toBeVisible();
}

async function commonResponse(route: Route, path: string): Promise<boolean> {
  let result: unknown;
  if (path === "/runtime") result = { ai_mode: "fallback" };
  else if (path === "/users") result = users;
  else if (path === "/teams") result = teams;
  else if (path === "/achievements") result = [];
  else if (/^\/users\/\d+$/.test(path)) {
    result = {
      user: users.find((user) => user.id === Number(path.split("/").pop())),
      exp_history: [],
    };
  } else return false;
  await route.fulfill({ json: result });
  return true;
}

test("a delayed business creation cannot navigate back after switching to student or keep the next creation busy", async ({
  page,
}) => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstStarted!: () => void;
  const firstReceived = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  let firstFinished!: () => void;
  const firstHandled = new Promise<void>((resolve) => {
    firstFinished = resolve;
  });
  let creates = 0;
  const drafts: (typeof publicTask)[] = [];
  const studentPrivateReads: string[] = [];

  await page.route("http://navigation.test/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const actor = request.headers()["x-demo-user-id"];
    if (await commonResponse(route, path)) return;
    if (path === "/tasks" && request.method() === "POST") {
      expect(actor).toBe("7");
      creates += 1;
      const count = creates;
      const draft = {
        ...publicTask,
        id: 90 + count,
        title: "",
        raw_description: request.postDataJSON().raw_description,
        context: "Приватное описание владельца",
        publication_status: "draft",
        confirmed_at: "",
        readiness_score: 0,
      };
      if (count === 1) {
        firstStarted();
        await firstGate;
      }
      drafts.push(draft);
      if (count === 1) {
        // The server may commit even after the browser aborts its request.
        await route
          .fulfill({ status: 202, json: draft })
          .catch(() => undefined);
        firstFinished();
      } else await route.fulfill({ status: 202, json: draft });
    } else if (path === "/tasks/mine") {
      expect(actor).toBe("7");
      await route.fulfill({ json: drafts });
    } else if (path === "/tasks") await route.fulfill({ json: [publicTask] });
    else if (path.endsWith("/questions"))
      await route.fulfill({
        json: [1, 2, 3].map((position) => ({
          id: 200 + position,
          position,
          question: `Новый вопрос ${position}`,
          answer: null,
        })),
      });
    else if (path.endsWith("/proposals")) await route.fulfill({ json: [] });
    else if (/^\/tasks\/\d+$/.test(path)) {
      if (actor !== "7" && path !== "/tasks/41") studentPrivateReads.push(path);
      const id = Number(path.split("/").pop());
      await route.fulfill({
        json: id === 41 ? publicTask : drafts.find((draft) => draft.id === id),
      });
    } else throw new Error(`Unexpected ${request.method()} ${path}`);
  });

  try {
    await connect(page);
    await page
      .getByRole("button", { name: "Создать задачу", exact: true })
      .click();
    await page
      .getByLabel("Описание бизнес-проблемы")
      .fill("Приватное первое описание");
    await page
      .getByRole("button", { name: "Создать и запустить анализ", exact: true })
      .click();
    await firstReceived;
    await expect(
      page.getByRole("button", {
        name: "Создать и запустить анализ",
        exact: true,
      }),
    ).toBeDisabled();

    await page.getByLabel("Профиль", { exact: true }).selectOption("19");
    await expect(
      page.getByRole("heading", { name: "Каталог задач", exact: true }),
    ).toBeVisible();
    releaseFirst();
    await firstHandled;
    // A navigation round-trip settles the late response without a timing sleep.
    await page.getByRole("link", { name: "Мои проекты", exact: true }).click();
    await page
      .getByRole("link", { name: "Каталог задач", exact: true })
      .click();
    await expect(page).toHaveURL(/user=19&view=catalog/);
    await expect(
      page.getByRole("heading", { name: "Каталог задач", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Описание бизнес-проблемы")).toHaveCount(0);
    await expect(
      page.getByText("Приватное первое описание", { exact: false }),
    ).toHaveCount(0);
    expect(studentPrivateReads).toEqual([]);

    await page.getByLabel("Профиль", { exact: true }).selectOption("7");
    await page
      .getByRole("button", { name: "Создать задачу", exact: true })
      .click();
    await page
      .getByLabel("Описание бизнес-проблемы")
      .fill("Следующая бизнес-задача");
    await expect(
      page.getByRole("button", {
        name: "Создать и запустить анализ",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Создать и запустить анализ", exact: true })
      .click();
    await expect(page).toHaveURL(/user=7&view=edit&task=92/);
    await expect(
      page.getByLabel("Новый вопрос 1", { exact: true }),
    ).toBeVisible();
    expect(creates).toBe(2);
  } finally {
    releaseFirst();
  }
});

test("proposal Back retains fields and committed submission remains successful when the follow-up read fails", async ({
  page,
}) => {
  let posted = 0;
  let failedReads = 0;
  let submitted: unknown;
  await page.route("http://navigation.test/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() === "GET" && posted > 0) {
      failedReads += 1;
      await route.fulfill({
        status: 503,
        json: {
          error: { code: "unavailable", message: "Временная ошибка чтения" },
        },
      });
      return;
    }
    if (await commonResponse(route, path)) return;
    if (path === "/tasks/41/proposals" && request.method() === "POST") {
      expect(request.headers()["x-demo-user-id"]).toBe("19");
      posted += 1;
      submitted = request.postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          id: 90,
          task_id: 41,
          team_id: 64,
          ...request.postDataJSON(),
          status: "pending",
          execution_status: "not_started",
          milestones: [],
        },
      });
    } else if (path.endsWith("/proposals") || path.endsWith("/questions"))
      await route.fulfill({ json: [] });
    else if (path === "/tasks" || path === "/tasks/mine")
      await route.fulfill({ json: [publicTask] });
    else if (path === "/tasks/41") await route.fulfill({ json: publicTask });
    else throw new Error(`Unexpected ${request.method()} ${path}`);
  });

  await connect(page);
  await page.getByLabel("Профиль", { exact: true }).selectOption("19");
  await page
    .getByRole("button", { name: "Открыть задачу №41", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подать заявку", exact: true })
    .click();
  await page.getByLabel("Идея решения").fill("  Сохраняем идею команды  ");
  await page
    .getByRole("button", { name: "К плану работы", exact: true })
    .click();
  await page
    .getByLabel("План работы")
    .fill("  Сначала исследование, затем прототип  ");
  await page.getByLabel("Срок в днях").fill("9");
  await page
    .getByLabel("Прототип (необязательно)")
    .fill("https://example.com/prototype");
  await page.getByRole("button", { name: "← Назад", exact: true }).click();
  await expect(page.getByLabel("Идея решения")).toHaveValue(
    "  Сохраняем идею команды  ",
  );
  await page
    .getByRole("button", { name: "Вернуться к задаче", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: publicTask.title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Подать заявку", exact: true })
    .click();
  await expect(page.getByLabel("Идея решения")).toHaveValue(
    "  Сохраняем идею команды  ",
  );
  await page
    .getByRole("button", { name: "К плану работы", exact: true })
    .click();
  await expect(page.getByLabel("План работы")).toHaveValue(
    "  Сначала исследование, затем прототип  ",
  );
  await expect(page.getByLabel("Срок в днях")).toHaveValue("9");
  await expect(page.getByLabel("Прототип (необязательно)")).toHaveValue(
    "https://example.com/prototype",
  );
  await page
    .getByRole("button", { name: "Проверить заявку", exact: true })
    .click();
  expect(posted).toBe(0);
  await page
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Заявка отправлена", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Действие сохранено");
  expect(failedReads).toBeGreaterThan(0);
  expect(submitted).toEqual({
    team_id: 64,
    solution_idea: "Сохраняем идею команды",
    plan: "Сначала исследование, затем прототип",
    duration_days: 9,
    prototype_url: "https://example.com/prototype",
  });
  await page.getByRole("button", { name: "К задаче", exact: true }).click();
  await page
    .getByRole("button", { name: "Подать заявку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Заявка отправлена", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Отправить заявку", exact: true }),
  ).toHaveCount(0);
  expect(posted).toBe(1);
});

test("leaving creation through the same business profile navigation prevents a late response from reopening the wizard", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const received = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finished!: () => void;
  const handled = new Promise<void>((resolve) => {
    finished = resolve;
  });
  let posted = 0;
  let draft: typeof publicTask | null = null;
  await page.route("http://navigation.test/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (await commonResponse(route, path)) return;
    if (path === "/tasks" && request.method() === "POST") {
      posted += 1;
      expect(request.headers()["x-demo-user-id"]).toBe("7");
      started();
      await gate;
      draft = {
        ...publicTask,
        id: 95,
        publication_status: "draft",
        confirmed_at: "",
        raw_description: request.postDataJSON().raw_description,
      };
      await route.fulfill({ status: 202, json: draft }).catch(() => undefined);
      finished();
    } else if (path === "/tasks/mine")
      await route.fulfill({ json: draft ? [draft] : [] });
    else if (path.endsWith("/proposals") || path.endsWith("/questions"))
      await route.fulfill({ json: [] });
    else if (path === "/tasks/95") await route.fulfill({ json: draft });
    else throw new Error(`Unexpected ${request.method()} ${path}`);
  });
  try {
    await connect(page);
    await page
      .getByRole("button", { name: "Создать задачу", exact: true })
      .click();
    await page
      .getByLabel("Описание бизнес-проблемы")
      .fill("Задача с задержанным ответом");
    await page
      .getByRole("button", { name: "Создать и запустить анализ", exact: true })
      .click();
    await received;
    await page.getByRole("link", { name: "Мои задачи", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Мои задачи", exact: true }),
    ).toBeVisible();
    release();
    await handled;
    // Settle response microtasks and React's next frames without navigating again,
    // which could otherwise mask an erroneous late redirect to the editor.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page).toHaveURL(/user=7&view=catalog&task=$/);
    await expect(
      page.getByRole("heading", { name: "Мои задачи", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Подготовка задачи", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Создать задачу", exact: true }),
    ).toBeEnabled();
    expect(posted).toBe(1);
  } finally {
    release();
  }
});

test("an unevaluated edited draft never displays the older published fallback score as its own evaluation", async ({
  page,
}) => {
  let retries = 0;
  const task = {
    ...publicTask,
    revision: 2,
    evaluated_revision: null,
    ai_status: "failed",
    ai_error: "OpenAI: временно недоступна модель",
    draft_card: { ...card, title: "Уточнённая задача" },
    draft_evaluation: null,
    readiness_score: 80,
    score_breakdown: { source: "fallback" },
  };
  await page.route("http://navigation.test/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/runtime") {
      await route.fulfill({ json: { ai_mode: "openai" } });
      return;
    }
    if (await commonResponse(route, path)) return;
    if (path === "/tasks/mine") await route.fulfill({ json: [task] });
    else if (path === "/tasks/41") await route.fulfill({ json: task });
    else if (path.endsWith("/questions") || path.endsWith("/proposals"))
      await route.fulfill({ json: [] });
    else if (path === "/tasks/41/ai/retry" && request.method() === "POST") {
      retries += 1;
      expect(request.headers()["x-demo-user-id"]).toBe("7");
      expect(request.postData()).toBeNull();
      task.ai_status = "pending";
      task.ai_error = "";
      await route.fulfill({ status: 202, json: task });
    } else throw new Error(`Unexpected ${request.method()} ${path}`);
  });
  await connect(page);
  await page.getByRole("link", { name: "Мои задачи", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть задачу №41", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Уточнить задачу", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Проверьте карточку", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Оценка этой версии ещё не готова", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Готовность карточки: 80%", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Локальная проверка заполненности.", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Внешняя модель для этой оценки не использовалась.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "OpenAI: временно недоступна модель",
  );
  await expect(page.getByLabel("Я проверил факты в карточке")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Подтвердить карточку", exact: true }),
  ).toBeDisabled();
  expect(retries).toBe(0);
  await page
    .getByRole("button", { name: "Повторить AI-анализ", exact: true })
    .click();
  await expect(
    page.getByText("Помощник готовит следующий шаг.", { exact: false }),
  ).toBeVisible();
  expect(retries).toBe(1);
});
