import { initialState } from "./fixtures";
import {
  startProject,
  submitMilestone,
  reviewSubmission,
} from "../domain/projectRules";
// Separate read-only specimen; never merged into the user's saved workspace.
export function progressionExample() {
  let state = initialState();
  state.role = "business";
  state.proposals = state.proposals.map((p) =>
    p.id === "203"
      ? {
          ...p,
          status: "accepted",
          decidedBy: "1",
          decidedAt: "2026-09-01T10:00:00Z",
        }
      : p,
  );
  state = startProject(
    state,
    "203",
    [
      {
        criteria: "Показать исходные данные и метод анализа",
        dueDate: "2026-09-05",
      },
      { criteria: "Прогноз на синтетических данных", dueDate: "2026-09-10" },
      { criteria: "Передать прототип и инструкцию", dueDate: "2026-09-15" },
    ],
    "2026-09-01T10:00:00Z",
  );
  for (let i = 0; i < 3; i++) {
    state.role = "student";
    state = submitMilestone(
      state,
      "203",
      `203:stage:${i}`,
      {
        summary: [
          "Проанализировали причины списаний",
          "Собрали прототип прогноза",
          "Передали прототип с инструкцией",
        ][i],
        evidenceUrl: "https://example.com/larda-demo",
        contributors: [
          {
            userId: "2",
            description: [
              "Анализ исходных данных",
              "Интерфейс прогноза",
              "Проверка и документация",
            ][i],
            skills: [i === 1 ? "Интерфейсы" : "Работа с данными"],
          },
        ],
      },
      `example-submission-${i}`,
      `2026-09-${String(5 + i * 5).padStart(2, "0")}T10:00:00Z`,
    );
    state.role = "business";
    state = reviewSubmission(
      state,
      `example-submission-${i}`,
      {
        decision: "accepted",
        feedback: "Синтетический пример: критерии выполнены.",
        confirmedUserIds: ["2"],
      },
      `2026-09-${String(5 + i * 5).padStart(2, "0")}T12:00:00Z`,
    );
  }
  state.role = "student";
  return state;
}
