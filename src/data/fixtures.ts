import {
  BUSINESS_USER_ID,
  type Task,
  type WorkspaceState,
} from "../domain/models";
import { calculateReadiness, emptyCard } from "../domain/taskRules";

function fixture(
  id: string,
  ownerId: string,
  title: string,
  context: string,
  result: string,
  data: string,
  industry: string,
): Task {
  const card = {
    ...emptyCard(),
    title,
    context,
    expectedResult: result,
    successCriteria:
      "На тестовых данных весь описанный сценарий проходит без ошибок.",
    availableData: data,
  };
  return {
    ...card,
    ...calculateReadiness(card),
    id,
    ownerId,
    rawDescription: context,
    industry,
    skills: ["Интерфейсы", "Работа с данными"],
    draftCard: null,
    publicationStatus: "published",
    executionStatus: "not_started",
    confirmedAt: "2026-09-23T08:00:00Z",
    publishedAt: "2026-09-23T08:00:00Z",
  };
}
export function initialState(): WorkspaceState {
  return {
    version: 1,
    role: null,
    activeDraftId: null,
    seenProposalIds: [],
    users: [
      {
        id: BUSINESS_USER_ID,
        name: "Алия",
        role: "business",
        companyName: "Мой бизнес",
      },
      { id: "2", name: "Денис", role: "student", companyName: null },
      { id: "3", name: "Аружан", role: "student", companyName: null },
      { id: "4", name: "Илья", role: "student", companyName: null },
      {
        id: "5",
        name: "Мария",
        role: "business",
        companyName: "Студия красоты",
      },
    ],
    teams: [
      {
        id: "1",
        name: "Команда «Нова»",
        description: "Веб-сервисы и интерфейсы",
      },
      {
        id: "2",
        name: "Команда «Орбита»",
        description: "Автоматизация бизнес-процессов",
      },
      { id: "3", name: "Команда «Пиксель»", description: "Удобные интерфейсы" },
    ],
    teamMembers: [
      { teamId: "1", userId: "2", role: "captain" },
      { teamId: "2", userId: "3", role: "captain" },
      { teamId: "3", userId: "4", role: "captain" },
    ],
    tasks: [
      fixture(
        "101",
        "1",
        "Панель контроля остатков",
        "Закупщик каждое утро вручную сверяет остатки в трёх Excel-файлах.",
        "Сделать страницу загрузки таблиц и единый список остатков с выделением заканчивающихся товаров.",
        "Три обезличенные Excel-выгрузки с названиями и количеством товаров.",
        "Торговля",
      ),
      fixture(
        "102",
        "5",
        "Запись клиентов без звонков",
        "Администратор салона не всегда успевает отвечать на звонки, и клиенты уходят.",
        "Сделать кликабельный прототип выбора услуги, мастера и времени записи.",
        "Список услуг, мастеров и рабочее расписание.",
        "Услуги",
      ),
    ],
    questions: [],
    proposals: [
      {
        id: "201",
        taskId: "101",
        teamId: "2",
        submittedBy: "3",
        solutionIdea:
          "Объединим таблицы в один экран и выделим товары с низким остатком.",
        plan: "1. Изучим ваши таблицы.\n2. Сделаем загрузку файлов.\n3. Проверим результат вместе с закупщиком.",
        durationDays: 5,
        prototypeUrl: "",
        status: "pending",
        decidedBy: null,
        decidedAt: null,
        executionStatus: "not_started",
      },
      {
        id: "202",
        taskId: "101",
        teamId: "3",
        submittedBy: "4",
        solutionIdea:
          "Сначала соберём понятный прототип экрана закупщика, затем добавим загрузку данных.",
        plan: "1. Обсудим рабочий день закупщика.\n2. Согласуем макет.\n3. Подключим тестовые таблицы.",
        durationDays: 7,
        prototypeUrl: "",
        status: "pending",
        decidedBy: null,
        decidedAt: null,
        executionStatus: "not_started",
      },
    ],
  };
}
