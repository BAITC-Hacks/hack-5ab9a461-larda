import { test, expect } from "@playwright/test";
import {
  emptyCard,
  calculateReadiness,
  readinessBand,
  improvements,
} from "../src/domain/taskRules";
import { initialState } from "../src/data/fixtures";
import { progressionExample } from "../src/data/progressionExample";
import { migrateState } from "../src/data/migration";
import { createMockRepository } from "../src/data/mockRepository";
import {
  startProject,
  submitMilestone,
  reviewSubmission,
} from "../src/domain/projectRules";
import {
  levelAt,
  rankAt,
  studentProgress,
  projectProgress,
  grantAchievements,
} from "../src/domain/progression";
import { validateAssistant } from "../src/domain/assistant";
import { businessQueue } from "../src/domain/businessQueue";
const now = "2026-09-23T12:00:00Z";
const inputs = [1, 2, 3].map((n) => ({
  criteria: `Результат ${n}`,
  dueDate: `2026-10-0${n}`,
}));
function started() {
  let s = initialState();
  s.role = "business";
  s.proposals[2].status = "accepted";
  return startProject(s, "205", inputs, now);
}
function ownedStarted() {
  let s = initialState();
  s.role = "business";
  s.proposals.find((p) => p.id === "203")!.status = "accepted";
  return startProject(s, "203", inputs, now);
}
const delivery = {
  summary: "Проверяемый результат",
  evidenceUrl: "https://example.com/work",
  contributors: [
    { userId: "2", description: "Анализ данных", skills: ["Работа с данными"] },
    { userId: "3", description: "Интерфейс", skills: ["Интерфейсы"] },
  ],
};
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  fail = false;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  key(n: number) {
    return [...this.data.keys()][n] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error("quota");
    this.data.set(k, v);
  }
}
test("readiness weights, split categories, missing suggestions and bands", () => {
  const card = emptyCard();
  expect(calculateReadiness(card).readinessScore).toBe(0);
  card.context = "контекст";
  card.contact = "contact";
  expect(calculateReadiness(card).readinessScore).toBe(15);
  const filled = Object.fromEntries(
    Object.keys(card).map((k) => [k, "данные"]),
  ) as typeof card;
  const result = calculateReadiness(filled);
  expect(result.readinessScore).toBe(100);
  expect(result.scoreBreakdown).toHaveLength(7);
  expect(result.scoreBreakdown.map((i) => i.max)).toEqual([
    20, 20, 15, 15, 10, 10, 10,
  ]);
  expect(improvements(card)[0].field).toBe("availableData");
  expect([0, 39, 40, 69, 70, 89, 90, 100].map(readinessBand)).toEqual([
    "Требует уточнения",
    "Требует уточнения",
    "Рабочая",
    "Рабочая",
    "Готовая",
    "Готовая",
    "Приоритетная",
    "Приоритетная",
  ]);
});
test("rank requires both XP and completed evidence; level boundaries", () => {
  expect(rankAt(20000, 0).name).toBe("E");
  expect(rankAt(1000, 1).name).toBe("D");
  expect(rankAt(999, 10).name).toBe("E");
  expect(rankAt(2500, 2).name).toBe("C");
  expect(rankAt(5000, 3).name).toBe("B");
  expect(rankAt(10000, 5).name).toBe("A");
  expect(rankAt(20000, 10).name).toBe("S");
  expect([0, 99, 100, 599, 600, 6600, 7450, 7800].map(levelAt)).toEqual([
    1, 1, 2, 3, 4, 12, 12, 13,
  ]);
});
test("project start validates ownership, criteria, date order and frozen brief", () => {
  expect(() => started()).toThrow();
  let s = initialState();
  s.role = "business";
  s.proposals.find((p) => p.id === "203")!.status = "accepted";
  expect(() =>
    startProject(s, "203", [{ criteria: "", dueDate: "" }], now),
  ).toThrow();
  expect(() =>
    startProject(s, "203", [inputs[2], inputs[1], inputs[0]], now),
  ).toThrow();
  const next = startProject(s, "203", inputs, now);
  s.tasks.find((t) => t.id === "103")!.context = "changed";
  expect(next.projects[0].brief.context).not.toBe("changed");
  expect(next.xpTransactions).toHaveLength(0);
  expect(() => startProject(next, "203", inputs, now)).toThrow();
});
test("sequential submissions, captain, evidence URL and contribution guards", () => {
  let s = ownedStarted();
  s.role = "student";
  expect(() =>
    submitMilestone(s, "203", "203:stage:1", delivery, "s", now),
  ).toThrow();
  expect(() =>
    submitMilestone(
      s,
      "203",
      "203:stage:0",
      { ...delivery, evidenceUrl: "javascript:alert(1)" },
      "s",
      now,
    ),
  ).toThrow();
  expect(() =>
    submitMilestone(
      s,
      "203",
      "203:stage:0",
      {
        ...delivery,
        contributors: [{ userId: "4", description: "x", skills: [] }],
      },
      "s",
      now,
    ),
  ).toThrow();
  expect(() =>
    submitMilestone(
      s,
      "203",
      "203:stage:0",
      {
        ...delivery,
        contributors: [
          { userId: "2", description: "x", skills: ["Unclaimed"] },
        ],
      },
      "s",
      now,
    ),
  ).toThrow();
  const next = submitMilestone(s, "203", "203:stage:0", delivery, "s", now);
  expect(next.xpTransactions).toHaveLength(0);
  expect(() =>
    submitMilestone(next, "203", "203:stage:0", delivery, "s2", now),
  ).toThrow();
  const outsider = {
    ...s,
    projects: s.projects.map((p) => ({
      ...p,
      members: p.members.filter((m) => m.userId !== "2"),
    })),
  };
  expect(() =>
    submitMilestone(outsider, "203", "203:stage:0", delivery, "s", now),
  ).toThrow();
});
test("revision history and selective, idempotent acceptance", () => {
  let s = ownedStarted();
  s.role = "student";
  s = submitMilestone(s, "203", "203:stage:0", delivery, "s1", now);
  s.role = "business";
  expect(() =>
    reviewSubmission(
      s,
      "s1",
      { decision: "changes_requested", feedback: "", confirmedUserIds: [] },
      now,
    ),
  ).toThrow();
  s = reviewSubmission(
    s,
    "s1",
    {
      decision: "changes_requested",
      feedback: "Добавьте проверку",
      confirmedUserIds: [],
    },
    now,
  );
  expect(s.xpTransactions).toHaveLength(0);
  s.role = "student";
  s = submitMilestone(s, "203", "203:stage:0", delivery, "s2", now);
  s.role = "business";
  expect(s.submissions.map((v) => v.version)).toEqual([1, 2]);
  expect(() =>
    reviewSubmission(
      s,
      "s2",
      { decision: "accepted", feedback: "", confirmedUserIds: [] },
      now,
    ),
  ).toThrow();
  s = reviewSubmission(
    s,
    "s2",
    { decision: "accepted", feedback: "Принято", confirmedUserIds: ["2"] },
    now,
  );
  expect(studentProgress(s, "2").xp).toBe(200);
  expect(studentProgress(s, "3").xp).toBe(0);
  expect(studentProgress(s, "3").evidence).toHaveLength(0);
  expect(studentProgress(s, "2").completed).toHaveLength(0);
  expect(projectProgress(s.projects[0])).toBe(33);
  expect(
    reviewSubmission(
      s,
      "s2",
      { decision: "accepted", feedback: "", confirmedUserIds: ["2", "3"] },
      now,
    ),
  ).toBe(s);
});
test("completion adds evidence and achievement exactly once", () => {
  const s = progressionExample();
  const p = studentProgress(s, "2");
  expect(p.xp).toBe(900);
  expect(p.completed).toHaveLength(1);
  expect(s.achievements).toHaveLength(1);
  expect(projectProgress(s.projects[0])).toBe(100);
  expect(grantAchievements(s, "203", now).xpTransactions).toEqual(
    s.xpTransactions,
  );
  expect(studentProgress(s, "3").completed).toHaveLength(0);
});
test("five verified projects across three owners unlock higher achievements once", () => {
  const s = progressionExample();
  const original = s.projects[0];
  for (let i = 1; i < 5; i++) {
    const id = `p${i}`;
    s.projects.push({ ...original, id, ownerId: String((i % 3) + 10) });
    const evidence = s.submissions[0];
    s.submissions.push({ ...evidence, id: `s${i}`, projectId: id });
    s.reviews.push({ ...s.reviews[0], id: `r${i}`, submissionId: `s${i}` });
  }
  const next = grantAchievements(s, "p4", now);
  expect(next.achievements.map((a) => a.achievementId).sort()).toEqual([
    "business_tested",
    "first_mission",
    "problem_solver",
  ]);
  expect(studentProgress(next, "2").xp).toBe(1400);
  expect(grantAchievements(next, "p4", now).xpTransactions).toEqual(
    next.xpTransactions,
  );
});
test("v1 migration preserves facts, proposals and original recovery snapshot", () => {
  const old = { ...initialState(), version: 1 };
  old.role = "student";
  old.tasks[0].context = "Мой исходный текст";
  old.proposals[0].status = "accepted";
  delete (old.tasks[0] as any).need;
  delete (old.tasks[0] as any).contact;
  delete (old.tasks[0] as any).targetUsers;
  const storage = new MemoryStorage();
  const raw = JSON.stringify(old);
  storage.setItem("ларда-unused", "keep");
  storage.setItem("larda.workspace.v1", raw);
  const repo = createMockRepository(storage);
  const s = repo.getSnapshot();
  expect(s.version).toBe(2);
  expect(s.tasks[0].context).toBe("Мой исходный текст");
  expect(s.tasks[0].need).toBe("");
  expect(s.proposals[0].status).toBe("accepted");
  expect(s.projects).toEqual([]);
  expect(s.xpTransactions).toEqual([]);
  expect(s.role).toBe("student");
  expect(storage.getItem("larda.workspace.v1")).toBe(raw);
  expect(() => migrateState({})).toThrow();
});
test("atomic storage failures, persisted refresh and duplicate reward retry", async () => {
  const storage = new MemoryStorage();
  let s = ownedStarted();
  s.role = "student";
  s = submitMilestone(s, "203", "203:stage:0", delivery, "s", now);
  s.role = "business";
  storage.setItem("larda.workspace.v2", JSON.stringify(s));
  const repo = createMockRepository(storage);
  storage.fail = true;
  await expect(
    repo.reviewSubmission("s", {
      decision: "accepted",
      feedback: "",
      confirmedUserIds: ["2"],
    }),
  ).rejects.toThrow("сохранить");
  expect(repo.getSnapshot().xpTransactions).toHaveLength(0);
  expect(repo.getSnapshot().reviews).toHaveLength(0);
  storage.fail = false;
  await repo.reviewSubmission("s", {
    decision: "accepted",
    feedback: "",
    confirmedUserIds: ["2"],
  });
  const refreshed = createMockRepository(storage);
  await refreshed.reviewSubmission("s", {
    decision: "accepted",
    feedback: "",
    confirmedUserIds: ["2"],
  });
  expect(studentProgress(refreshed.getSnapshot(), "2").xp).toBe(200);
});
test("low-readiness publication requires explicit confirmation and accepts proposals", async () => {
  const repo = createMockRepository(new MemoryStorage());
  await repo.setRole("business");
  const id = await repo.ensureDraft();
  await repo.saveDescription(id, "Низкая готовность", "Только контекст");
  await expect(repo.publish(id, false)).rejects.toThrow();
  await repo.publish(id, true);
  expect(
    repo.getSnapshot().tasks.find((t) => t.id === id)?.readinessScore,
  ).toBe(10);
  await repo.setRole("student");
  await repo.submitProposal(id, {
    solutionIdea: "Идея",
    plan: "План",
    durationDays: 2,
    prototypeUrl: "",
  });
  expect(repo.getSnapshot().xpTransactions).toEqual([]);
});
test("assistant malformed answers fall back without fabricating facts", () => {
  const input = { taskId: "t", card: emptyCard() };
  expect(
    validateAssistant(input, {
      questions: [{ fieldKey: "invented", question: "x" }],
    }),
  ).toHaveLength(3);
  expect(validateAssistant(input, null)).toHaveLength(3);
  expect(input.card.context).toBe("");
});
test("business queue prioritizes review before deadlines and proposals", () => {
  let s = ownedStarted();
  s.role = "student";
  s = submitMilestone(s, "203", "203:stage:0", delivery, "s", now);
  expect(businessQueue(s, "2027-01-01")[0].priority).toBe(0);
  expect(businessQueue(s, "2027-01-01")[0].progress).toBe(0);
});

test("published-card edits preserve metadata, allow decreases and freeze at start", async () => {
  const storage = new MemoryStorage();
  const repo = createMockRepository(storage);
  await repo.setRole("business");
  const original = repo.getSnapshot().tasks.find((t) => t.id === "103")!;
  await repo.updateCard("103", { ...original, availableData: "" });
  const edited = repo.getSnapshot().tasks.find((t) => t.id === "103")!;
  expect(edited.readinessScore).toBe(original.readinessScore - 20);
  expect(edited.publicationStatus).toBe("published");
  expect(edited.ownerId).toBe(original.ownerId);
  await expect(
    repo.updateCard("103", { ...edited, context: "" }),
  ).rejects.toThrow();
  await repo.decideProposal("203", "accepted");
  await repo.startProject(
    "203",
    inputs.map((i) => ({ ...i, dueDate: "2099-10-01" })),
  );
  await expect(
    repo.updateCard("103", { ...edited, context: "changed" }),
  ).rejects.toThrow("зафиксирована");
});

test("role and business ownership protect reviews and acknowledgements", async () => {
  let state = ownedStarted();
  state.role = "student";
  state = submitMilestone(state, "203", "203:stage:0", delivery, "s", now);
  expect(() =>
    reviewSubmission(
      state,
      "s",
      { decision: "accepted", feedback: "", confirmedUserIds: ["2"] },
      now,
    ),
  ).toThrow();
  state.role = "business";
  state.projects[0].ownerId = "5";
  expect(() =>
    reviewSubmission(
      state,
      "s",
      { decision: "accepted", feedback: "", confirmedUserIds: ["2"] },
      now,
    ),
  ).toThrow();
  const repo = createMockRepository(new MemoryStorage());
  await repo.setRole("business");
  await expect(repo.acknowledgeProgression(["fake"])).rejects.toThrow();
});
