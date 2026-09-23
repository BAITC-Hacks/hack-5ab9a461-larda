import { test, expect } from "@playwright/test";

test("full task → questions → publish → proposal → manual selection with refresh", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Как вы хотите работать сегодня?" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("roles-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Я представляю бизнес/ }).click();
  await expect(page).toHaveURL("/business");
  await expect(page.locator("main .button--primary")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("workspace-desktop.png"),
    fullPage: true,
  });
  await page
    .locator("main")
    .getByRole("link", { name: "+ Создать задачу", exact: true })
    .click();
  await page
    .getByLabel("Короткое название задачи")
    .fill("Учёт заявок магазина");
  await page
    .getByLabel("Опишите проблему", { exact: true })
    .fill("Менеджеры вручную переносят заявки из WhatsApp в Excel.");
  await page.getByRole("button", { name: /Сохранить и продолжить/ }).click();
  await expect(
    page.getByRole("heading", { name: "Помощник изучает описание…" }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Готовность задачи", exact: true }),
  ).toHaveAttribute("aria-valuenow", "10");
  const draftUrl = page.url();
  const answers = [
    "Прототип списка входящих заявок с загрузкой сообщений.",
    "Каждая из 20 тестовых заявок появляется в списке без копирования.",
    "20 обезличенных сообщений и Excel-таблица.",
  ];
  for (const [index, answer] of answers.entries()) {
    await page.locator(".question-card textarea").fill(answer);
    await page.getByRole("button", { name: /Сохранить и продолжить/ }).click();
    await expect(
      page.getByRole("progressbar", { name: "Готовность задачи", exact: true }),
    ).toHaveAttribute("aria-valuenow", String([25, 40, 60][index]));
    if (index === 0) {
      await page.reload();
      await expect(page).toHaveURL(draftUrl);
      await expect(
        page.getByRole("progressbar", {
          name: "Готовность задачи",
          exact: true,
        }),
      ).toHaveAttribute("aria-valuenow", "25");
    }
  }
  await expect(
    page.locator(".task-preview .motion-progress__caption strong"),
  ).toHaveText("60 из 100");
  await page.screenshot({
    path: testInfo.outputPath("builder-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: /Проверить задачу/ }).click();
  const reviewUrl = page.url();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page
    .getByLabel("Формат работы", { exact: true })
    .fill("Один созвон в неделю.");
  await page.getByRole("button", { name: "Подтвердить изменения" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Готовность задачи", exact: true }),
  ).toHaveAttribute("aria-valuenow", "65");
  await page.getByRole("checkbox", { name: /Я проверил/ }).check();
  await page
    .getByRole("button", { name: "Опубликовать задачу", exact: true })
    .click();
  await expect(page.locator(".page-heading .status")).toHaveText(
    "● Опубликована",
  );
  await page.reload();
  await expect(page.locator(".page-heading .status")).toHaveText(
    "● Опубликована",
  );
  await page.getByRole("link", { name: "Посмотреть в каталоге" }).click();
  const detailUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Учёт заявок магазина",
  );
  await expect(page.locator(".brief")).toContainText(answers[0]);
  await page
    .getByRole("button", { name: "Перейти к отклику как студент" })
    .click();
  await page.getByRole("button", { name: "Подать предложение" }).click();
  await page
    .getByLabel("Идея решения", { exact: true })
    .fill("Сделаем импорт сообщений и таблицу заявок.");
  await page
    .getByLabel("Краткий план", { exact: true })
    .fill("Сначала изучим данные, затем соберём интерфейс.");
  await page.getByLabel("Срок в днях", { exact: true }).fill("6");
  await page
    .getByRole("button", { name: "Отправить отклик", exact: true })
    .click();
  await expect(page.locator(".response-receipt")).toContainText(
    "Отклик отправлен",
  );
  await page.reload();
  await expect(page.locator(".response-receipt")).toContainText(
    "Сделаем импорт сообщений",
  );
  await page.getByRole("link", { name: "Larda — выбор роли" }).click();
  await page.getByRole("button", { name: /Я представляю бизнес/ }).click();
  await page.getByRole("link", { name: "Отклики команд" }).click();
  await page
    .locator(".task-row")
    .filter({ hasText: "Учёт заявок магазина" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(`${reviewUrl}/responses`);
  await expect(page.locator(".proposal-card")).toHaveCount(1);
  await expect(page.locator(".proposal-card")).toContainText(
    "Сделаем импорт сообщений",
  );
  await page.getByRole("radio").check();
  await page
    .getByRole("button", { name: "Выбрать команду", exact: true })
    .click();
  await expect(page.locator(".selection-result")).toContainText(
    "Команда выбрана: Команда «Нова»",
  );
  await page.reload();
  await expect(page.locator(".proposal-card--accepted")).toHaveCount(1);
  await page.goto(detailUrl);
  await expect(page.locator(".response-receipt")).toContainText(
    "Ваша команда выбрана",
  );
  await page.goto("/catalog");
  await expect(
    page.locator(".catalog-card").filter({ hasText: "Учёт заявок магазина" }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("real routes, distinct task details, history and unavailable draft", async ({
  page,
}) => {
  await page.goto("/catalog");
  await page
    .locator(".catalog-card")
    .filter({ hasText: "Запись клиентов без звонков" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL("/catalog/102");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Запись клиентов без звонков",
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Запись клиентов без звонков",
  );
  await page.goBack();
  await expect(page).toHaveURL("/catalog");
  await page.goForward();
  await expect(page).toHaveURL("/catalog/102");
  await page.goto("/catalog/not-existing");
  await expect(
    page.getByRole("heading", { name: "Задача недоступна" }),
  ).toBeVisible();
  await page.goto("/business/tasks/102");
  await expect(
    page.getByRole("heading", { name: "Задача не найдена" }),
  ).toBeVisible();
});

test("one selected team, other responses remain pending until manual rejection", async ({
  page,
}, testInfo) => {
  await page.goto("/business/tasks/101/responses");
  await expect(
    page.getByRole("button", { name: "Выбрать команду", exact: true }),
  ).toBeDisabled();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Выбрать команду", exact: true })
    .click();
  await expect(page.locator(".proposal-card--accepted")).toHaveCount(1);
  await expect(page.locator(".proposal-card--pending")).toHaveCount(1);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page
    .locator(".proposal-card--pending")
    .getByRole("button", { name: "Отклонить" })
    .click();
  await expect(page.locator(".proposal-card--rejected")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("selection-desktop.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".proposal-card--accepted")).toHaveCount(1);
  await expect(page.locator(".proposal-card--rejected")).toHaveCount(1);
});

test("reduced motion, keyboard access and mobile layout", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Я представляю бизнес/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/business");
  await expect(
    page.getByRole("heading", { name: "Ваши решения двигают проекты" }),
  ).toBeVisible();
  await expect(page.locator(".motion-page-enter")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workspace-mobile.png"),
    fullPage: true,
  });
  await page.goto("/catalog/101");
  await expect(page.locator(".motion-progress__fill")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("low readiness needs confirmation, drafts private, published tasks open to proposals", async ({
  page,
}) => {
  await page.goto("/business/new");
  await page.getByLabel("Короткое название задачи").fill("Проверка черновика");
  await page
    .getByLabel("Опишите проблему", { exact: true })
    .fill("Нужна помощь с учётом поступлений.");
  await page.getByRole("button", { name: /Сохранить и продолжить/ }).click();
  const taskId = new URL(page.url()).searchParams.get("task");
  await page.goto(`/business/tasks/${taskId}`);
  await expect(
    page.getByRole("button", { name: "Опубликовать задачу", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".brief")).toContainText("Пока не указано");
  await page.goto(`/catalog/${taskId}`);
  await expect(
    page.getByRole("heading", { name: "Задача недоступна" }),
  ).toBeVisible();
  await page.goto(`/business/tasks/${taskId}`);
  await page.getByRole("checkbox", { name: /Я проверил/ }).check();
  await page
    .getByRole("button", { name: "Опубликовать задачу", exact: true })
    .click();
  await page.goto(`/catalog/${taskId}`);
  await expect(
    page.getByRole("progressbar", { name: "Готовность задачи" }),
  ).toHaveAttribute("aria-valuenow", "10");
  await page
    .getByRole("button", { name: "Перейти к отклику как студент" })
    .click();
  await expect(
    page.getByRole("button", { name: "Подать предложение" }),
  ).toBeEnabled();
});
