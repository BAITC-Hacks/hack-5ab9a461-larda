import { test, expect } from "@playwright/test";
import { connectWorkspace, readWorkspace } from "../src/data/serverWorkspace";

const user = { id: 2, name: "Student", role: "student", exp: 0 };

test("optional runtime metadata cannot break connection or invent an AI mode", async () => {
  const original = globalThis.fetch;
  try {
    for (const [runtime, expected] of [
      [null, "unknown"],
      ["openai", "unknown"],
      [{ ai_mode: "unexpected" }, "unknown"],
      [{ ai_mode: "openai" }, "openai"],
      [{ ai_mode: "fallback" }, "fallback"],
      [undefined, "unknown"],
    ] as const) {
      globalThis.fetch = async (input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/runtime"))
          return runtime === undefined
            ? new Response(
                JSON.stringify({ error: { message: "old server" } }),
                { status: 404 },
              )
            : Response.json(runtime);
        return Response.json(path.endsWith("/users") ? [user] : []);
      };
      const result = await connectWorkspace("http://localhost:8080");
      expect(result.aiMode).toBe(expected);
      expect(result.users).toEqual([user]);
    }
    globalThis.fetch = async (input) =>
      new URL(String(input)).pathname.endsWith("/users")
        ? new Response(
            JSON.stringify({ error: { message: "database unavailable" } }),
            { status: 503 },
          )
        : Response.json([]);
    await expect(connectWorkspace("http://localhost:8080")).rejects.toThrow(
      "database unavailable",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("student reads proposals only for their teams and no owner-only AI questions", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname.replace("/api/v1", "");
      paths.push(path);
      expect((init?.headers as Record<string, string>)["X-Demo-User-ID"]).toBe(
        "2",
      );
      if (path === "/teams")
        return Response.json([
          { id: 1, name: "Own", members: [{ user_id: 2, role: "captain" }] },
          { id: 3, name: "Other", members: [{ user_id: 3, role: "captain" }] },
        ]);
      if (path === "/users/2") return Response.json({ user, exp_history: [] });
      if (path === "/tasks/10") return Response.json({ id: 10, owner_id: 1 });
      return Response.json([]);
    };
    await readWorkspace(
      "http://localhost:8080",
      user,
      10,
      new AbortController().signal,
    );
    expect(paths).toContain("/teams/1/proposals");
    expect(paths).not.toContain("/teams/3/proposals");
    expect(paths.some((path) => path.endsWith("/questions"))).toBe(false);
    expect(paths).not.toContain("/tasks/mine");
  } finally {
    globalThis.fetch = original;
  }
});
