import { test, expect } from "@playwright/test";
for (const width of [1280, 390]) {
  test(`student catalog is discoverable, shares business styling, supports proposal and history at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: /Я представляю бизнес/ }).click();
    const businessStyle = await page
      .locator(".app-theme")
      .evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
      }));
    await page.goto("/");
    await page.getByRole("button", { name: /Я студент/ }).click();
    await expect(page).toHaveURL("/student");
    expect(
      await page
        .locator(".app-theme")
        .evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
        })),
    ).toEqual(businessStyle);
    await page.screenshot({
      path: info.outputPath(`student-profile-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Открыть каталог задач →" }).click();
    await expect(page).toHaveURL("/student/catalog");
    await expect(
      page.getByRole("heading", { name: "Каталог задач", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Основная навигация" })
        .getByRole("link", { name: "Каталог задач" }),
    ).toHaveAttribute("aria-current", "page");
    await page
      .getByRole("combobox", { name: "Тема", exact: true })
      .selectOption("Услуги");
    await expect(page.locator(".catalog-card")).toHaveCount(1);
    await page.screenshot({
      path: info.outputPath(`student-catalog-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.locator(".catalog-card").getByRole("link").click();
    await expect(page).toHaveURL("/student/catalog/102");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Подать предложение" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Подать предложение" }).click();
    await page
      .getByRole("textbox", { name: "Идея решения", exact: true })
      .fill("Прототип записи на услугу");
    await page
      .getByRole("textbox", { name: "Краткий план", exact: true })
      .fill("Изучить сценарий и проверить макет");
    await page
      .getByRole("button", { name: "Отправить отклик", exact: true })
      .click();
    await expect(page.locator(".response-receipt")).toContainText(
      "Отклик отправлен",
    );
    await page.getByRole("link", { name: "← К каталогу задач" }).click();
    await expect(page).toHaveURL("/student/catalog");
    await page.goBack();
    await expect(page).toHaveURL("/student/catalog/102");
    await page.goForward();
    await expect(page).toHaveURL("/student/catalog");
    await page
      .getByRole("navigation", { name: "Основная навигация" })
      .getByRole("link", { name: "Рабочий стол" })
      .click();
    await expect(page).toHaveURL("/student");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
