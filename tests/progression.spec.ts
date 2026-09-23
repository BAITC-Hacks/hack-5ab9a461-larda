import { test, expect, type Page } from "@playwright/test";
async function role(page: Page, business: boolean) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: business ? /Я представляю бизнес/ : /Я студент/,
    })
    .click();
}
async function snapshot(page: Page) {
  return page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("larda.workspace.v2")!),
  );
}

test("verified delivery: revision, selective contribution, completion, shared counters and refresh", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await role(page, true);
  await page.goto("/business/tasks/103/responses");
  await page.getByRole("radio").check();
  await page
    .getByRole("button", { name: "Выбрать команду", exact: true })
    .click();
  await page.getByRole("link", { name: "Открыть проект", exact: true }).click();
  for (let n = 1; n <= 3; n++) {
    await page
      .getByLabel(`Критерии этапа ${n}`, { exact: true })
      .fill(`Проверяемый результат ${n}`);
    await page
      .getByLabel(`Срок этапа ${n}`, { exact: true })
      .fill(`2099-10-0${n}`);
  }
  await page
    .getByRole("button", { name: "Зафиксировать условия и начать" })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Принятые этапы" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await page.screenshot({
    path: info.outputPath("project-business-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/business/tasks/103");
  await expect(
    page.getByRole("button", { name: "Изменить", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".inline-notice")).toContainText("зафиксированы");
  for (let n = 0; n < 3; n++) {
    await role(page, false);
    await page.goto("/student/projects/203");
    const stage = page.locator(".milestone").nth(n);
    await stage
      .getByRole("textbox", { name: "Что сделано", exact: true })
      .fill(`Результат ${n + 1} готов`);
    await stage
      .getByLabel("Ссылка на результат", { exact: true })
      .fill(`https://example.com/evidence-${n}`);
    await stage
      .getByRole("textbox", { name: "Вклад: Денис", exact: true })
      .fill("Анализ и проверка данных");
    await stage
      .getByRole("checkbox", { name: "Работа с данными", exact: true })
      .check();
    if (n === 0) {
      await stage
        .getByRole("checkbox", { name: "Аружан", exact: true })
        .check();
      await stage
        .getByRole("textbox", { name: "Вклад: Аружан", exact: true })
        .fill("Подготовка интерфейса");
    }
    await stage
      .getByRole("button", { name: "Отправить результат", exact: true })
      .click();
    await expect(stage).toContainText("На проверке");
    if (n === 0) {
      expect((await snapshot(page)).xpTransactions).toHaveLength(0);
      await role(page, true);
      await expect(page.locator(".next-action")).toContainText(
        "Результат ожидает вашей проверки",
      );
      await page.goto("/business/projects/203");
      await stage
        .getByRole("textbox", { name: "Обратная связь", exact: true })
        .fill("Добавьте проверку на контрольном наборе");
      await stage.getByRole("button", { name: "Запросить изменения" }).click();
      await expect(stage).toContainText("Требует доработки");
      await role(page, false);
      await page.goto("/student/projects/203");
      await stage
        .getByRole("textbox", { name: "Что сделано", exact: true })
        .fill("Исправлено: добавлен контрольный набор");
      await stage
        .getByRole("button", { name: "Отправить результат", exact: true })
        .click();
      await expect(stage).toContainText("Версия 2");
      expect((await snapshot(page)).xpTransactions).toHaveLength(0);
    }
    await role(page, true);
    await page.goto("/business/projects/203");
    await stage.getByRole("checkbox", { name: /Денис/ }).check();
    await stage
      .getByRole("button", { name: "Принять результат", exact: true })
      .click();
    await expect(
      page.getByRole("progressbar", { name: "Принятые этапы" }),
    ).toHaveAttribute("aria-valuenow", String([33, 67, 100][n]));
    const saved = await snapshot(page);
    expect(
      saved.xpTransactions.filter((t: any) => t.userId === "3"),
    ).toHaveLength(0);
    await page.reload();
    await expect(
      page.getByRole("progressbar", { name: "Принятые этапы" }),
    ).toHaveAttribute("aria-valuenow", String([33, 67, 100][n]));
  }
  await expect(
    page.getByRole("heading", { name: "Проект завершён" }),
  ).toBeVisible();
  await page.goto("/business");
  await expect(page.locator(".metric-strip")).toContainText("1Завершено");
  await page.screenshot({
    path: info.outputPath("business-completed-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await role(page, false);
  await expect(page.locator(".completion-summary")).toContainText("+900 XP");
  await expect(page.locator(".achievement--unlocked")).toHaveCount(1);
  await expect(page.locator(".verified-result")).toContainText(
    "Снижение списаний кофейни",
  );
  await expect(page.locator(".skill-evidence-grid")).toContainText(
    "Работа с данными",
  );
  await page.screenshot({
    path: info.outputPath("student-completed-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.reload();
  await expect(page.locator(".completion-summary")).toHaveCount(0);
  expect((await snapshot(page)).xpTransactions).toHaveLength(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".motion-page-enter")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("student-completed-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/student/projects/203");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("project-student-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("read-only example, fresh dashboard, filters and mobile focus", async ({
  page,
}, info) => {
  await role(page, false);
  await expect(page.locator(".metric-strip").first()).toContainText(
    "0Подтверждённый XP",
  );
  const before = await snapshot(page);
  await page.getByRole("link", { name: "Посмотреть пример профиля →" }).click();
  await expect(page.locator(".inline-notice")).toContainText("только просмотр");
  await expect(page.locator(".metric-strip")).toContainText(
    "900Подтверждённый XP",
  );
  expect(await snapshot(page)).toEqual(before);
  await page.screenshot({
    path: info.outputPath("student-example-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/catalog");
  await page
    .getByRole("combobox", { name: "Тема", exact: true })
    .selectOption("Общепит");
  await expect(page.locator(".catalog-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Готовность", exact: true })
    .selectOption("Приоритетная");
  await expect(page.locator(".catalog-card")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Готовность", exact: true })
    .selectOption("");
  await page
    .getByRole("combobox", { name: "Тема", exact: true })
    .selectOption("");
  await expect(page.locator(".catalog-card")).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/student");
  await page.getByRole("link", { name: "Перейти к содержимому" }).focus();
  await expect(
    page.getByRole("link", { name: "Перейти к содержимому" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("student-fresh-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("confirmed readiness edits can decrease score before start", async ({
  page,
}) => {
  await role(page, true);
  await page.goto("/business/tasks/103");
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Данные от компании", exact: true })
    .fill("");
  await page.getByRole("button", { name: "Подтвердить изменения" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Готовность задачи" }),
  ).toHaveAttribute("aria-valuenow", "60");
  await expect(page.getByRole("status")).toContainText("-20");
  await page.reload();
  await expect(
    page.getByRole("progressbar", { name: "Готовность задачи" }),
  ).toHaveAttribute("aria-valuenow", "60");
});
