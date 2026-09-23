# Larda frontend integration guide

Larda connects businesses with student teams. A business describes a problem, answers AI-generated questions, confirms an evaluated task card, publishes it, selects teams, and accepts their milestone results. Students earn EXP and achievements through completed work.

This guide describes the implemented backend. Use [json.md](json.md) for request/response examples and field details, [OpenAPI](docs/openapi.yaml) for the API contract, and the [Postman collection](postman/Larda.postman_collection.json) with its [environment](postman/Larda.postman_environment.json) to exercise the endpoints.

## Start the backend

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
# Edit .env: set AI_MODE=fallback for frontend development without paid AI calls.
docker compose up --build -d --wait
Invoke-RestMethod http://localhost:8080/healthz
```

If `.env` already exists, edit it instead of overwriting it. `AI_MODE=fallback` uses local demo responses and makes no calls to OpenAI. Its evaluations have `source: "fallback"` and measure field completeness, not the meaning of the text. `AI_MODE=openai` uses the server's `OPENAI_API_KEY`; an OpenAI failure becomes a failed job and does not automatically switch to fallback. Keep the key exclusively in the backend environment, never in frontend code, frontend environment variables, or browser requests.

The default API base URL is **`http://localhost:8080/api/v1`**. Health routes use the server root: `/livez` checks the process; `/healthz` and `/readyz` check database availability. Compose starts PostgreSQL, applies migrations, and seeds demo data on an empty database when `SEED_DEMO=true`. Data survives `docker compose down`.

Browser origins `http://localhost:5173` and `http://localhost:3000` are allowed by default. Set `CORS_ORIGINS` in the backend `.env` for other exact origins; `127.0.0.1` and `localhost` are different origins. Recreate the API with `docker compose up -d --build --wait` after changing configuration. Allowed browser request headers include `Content-Type` and `X-Demo-User-ID`; no cookie or bearer token is needed.

## Demo identity and permissions

There is no registration, login, password, or JWT. Provide a profile switcher and send the selected user's ID in `X-Demo-User-ID` for mutations and private reads. This header selects a demo identity; it is not production authentication.

| Fresh database ID | User role | Initial team role | Allowed actions |
| --- | --- | --- | --- |
| `1` | `business` | None | Manage own tasks; see their questions, jobs and proposals; decide proposals; propose, approve and review milestones; complete/cancel work. |
| `2` | `student` | `captain` in seeded teams | Manage those teams and members; submit proposals and milestone results; propose milestones; edit own skill tags. |
| `3` | `student` | `member` in seeded teams | Read own teams' proposals and milestones; edit own skill tags; create a new team and become its captain. |

Fetch `GET /users` and `GET /teams` at startup. IDs above describe a fresh seeded database, not every existing database. Both students have user role `student`; derive captain permissions from `team.members` where `user_id` matches the selected user and `role === "captain"`. Captaincy can differ by team and change during use.

Seed data includes five teams with the same two students, five published tasks (IDs `1`–`5`), five private drafts (`6`–`10`), and example proposals. Seeded public evaluations use `source: "demo_seed"`. Seeded drafts deliberately start with `ai_status: "failed"` so that seeding never spends API credits; the business can explicitly retry them.

Public reads need no identity header: users/profiles, tags, achievements, teams, published task catalog and published task details. Sending an invalid identity header still causes an error on these routes. `GET /tasks/{id}` returns owner-only draft information when called with the task owner's header; a non-owner receives `404` for unpublished or archived tasks.

When switching personas, cancel pending requests/polling and clear or partition cached private data by user ID. A cache keyed only by task ID can incorrectly display the business's draft in the student view.

## Screens and API actions

All paths in this table are relative to `/api/v1`. Braces indicate real resource IDs, not literal URL text.

| Screen / action | Endpoints | Access and behavior |
| --- | --- | --- |
| Demo profile picker | `GET /users` | Public; supplies available personas. |
| Profile, EXP and badges | `GET /users/{userID}`, `GET /achievements` | Public. Profile includes user, skill tags, unlocked achievement IDs and EXP history. Join achievement IDs to the achievement catalog for titles. |
| Skill editor | `GET /tags`, `PUT /users/me/tags` | Tags public; replacement of own tags is student-only and returns `204` with no body. |
| Task catalog | `GET /tasks` | Public, published snapshots only; filter and paginate as described below. |
| Task detail | `GET /tasks/{taskID}` | Public for published cards; owner receives private draft/AI fields too. |
| Business dashboard | `GET /tasks/mine` | Business's own tasks, including drafts/archives; at most 100, no pagination parameters. |
| Create problem | `POST /tasks` | Business; persists input and queues AI; returns `202` with a task. |
| Clarifying questions | `GET /tasks/{taskID}/questions`, `POST /tasks/{taskID}/answers` | Owner only. Answer all current question IDs with the current revision; submission returns `202`. |
| Card editor | `PATCH /tasks/{taskID}` | Owner only; save with current revision, then poll for evaluation. Returns `202`. |
| AI progress / retry | `GET /tasks/{taskID}`, `GET /tasks/{taskID}/ai-jobs`, `POST /tasks/{taskID}/ai/retry` | Owner only for private status/history/retry. Retry requires a failed current check and returns `202`. |
| Confirm / publish / archive | `POST /tasks/{taskID}/confirm`, `/publish`, `/archive` | Owner only. Confirm sends a revision; publish/archive send no body. |
| Team directory / detail | `GET /teams`, `GET /teams/{teamID}` | Public. Includes members and aggregate skill tags. |
| Create / edit team | `POST /teams`, `PUT /teams/{teamID}` | Any student can create; only the team's current captain can edit. PUT replaces name, description and interests. |
| Team members / captain | `POST /teams/{teamID}/members`, `DELETE /teams/{teamID}/members/{userID}`, `POST /teams/{teamID}/captain` | Current captain only; add/transfer bodies contain `user_id`. |
| Apply to task | `POST /tasks/{taskID}/proposals` | Captain of the supplied team; task must be published and execution still open. |
| Business proposal inbox | `GET /tasks/{taskID}/proposals`, `POST /proposals/{proposalID}/decision` | Task owner only; decisions are `accepted` or `rejected`. |
| Team workspace | `GET /teams/{teamID}/proposals` | Current members of that team; proposals include milestones. |
| Propose / approve milestone | `POST /proposals/{proposalID}/milestones`, `POST /milestones/{milestoneID}/approve` | Owner or relevant captain can propose after acceptance; only owner can approve. |
| Submit / review result | `POST /milestones/{milestoneID}/submit`, `POST /milestones/{milestoneID}/review` | Captain submits `result_url`; owner reviews with boolean `accepted`. |
| Finish / cancel team's work | `POST /proposals/{proposalID}/complete`, `/cancel` | Task owner only; does not automatically finish the whole task. |
| Finish / cancel task | `POST /tasks/{taskID}/complete`, `/cancel` | Owner only; separate from publication/archive. |

There are no separate proposal-detail or milestone-list GET routes: refresh the task's or team's proposal list and read nested `milestones`. There is no team-delete endpoint, file-upload endpoint, chat, or server recommendation endpoint. Result/prototype attachments are HTTP(S) links.

## Task creation, editing and AI

The frontend calls Larda only. The server saves task changes and an AI job together in PostgreSQL, then a background worker sends the prepared prompt to the model. Reloading a page does not lose the saved task or job.

1. **Create:** send `raw_description`, optionally `industry`, `topic`, and `tag_ids`, to `POST /tasks`. Store the returned task ID and revision. A `202 Accepted` response means the task was saved and AI work was queued, not that questions or a finished card are ready.
2. **Questions:** poll owner task detail until `ai_status` is `succeeded` or `failed`. On success, load `GET /tasks/{id}/questions`. Render the returned 3–7 questions in position order. There is one clarification round; do not hard-code three questions or manufacture IDs.
3. **Answers:** submit the latest `revision` and exactly one nonblank answer per returned `question_id`. Duplicates, missing IDs, extra IDs, and partial submissions fail. This queues a `generate` job, increments revision, and returns `202`.
4. **Generated card:** poll again. On success, bind the editor to `draft_card` and display `draft_evaluation` as the preview score. The generated draft is editable.
5. **Save:** send a flat PATCH body with `revision` and the fields changed by the user. Do not send the entire Task response or nest the fields under `draft_card`. Every accepted save increments revision, clears the prior draft evaluation, and queues an evaluation; even resending the same field value triggers work. When no questions exist yet, a save queues the initial questions/evaluation job instead.
6. **Confirm:** enable confirmation only after the current revision succeeded, `evaluated_revision === revision`, `draft_evaluation` exists, and the draft title is nonblank. Send `POST /tasks/{id}/confirm` with `revision`. Confirmation copies the draft into the task's top-level card fields and score, then clears `draft_card` and `draft_evaluation`.
7. **Publish:** send `POST /tasks/{id}/publish` after confirmation. First publication requires no unconfirmed draft. The card now appears in the public catalog; a low readiness score does not prevent publication or proposals.

Saving answers again is supported and queues generation again for the same question round. Use it only for an intentional user action; it can replace the generated draft. Do not automatically submit answers, save edits, or retry failed AI calls during rendering or polling. Prefer an explicit Save button to per-keystroke persistence, because each save can incur an AI call.

For an already published task, edits remain private until confirmation. The published top-level card fields, `readiness_score`, `score_breakdown`, and public tags stay unchanged while the new draft is pending, running or failed. Confirming the evaluated revision updates that public snapshot immediately; a second publish call is unnecessary. Publishing an already published task does not confirm its new draft.

Owner editing state can use `task.draft_card ??` the task's top-level card fields. Public views must use the top-level fields exclusively. Before the first confirmation those top-level fields are mostly empty and the public score is zero, even if a private draft evaluation exists.

### Polling and failures

Task AI states are `pending`, `running`, `succeeded`, and `failed`. Job kinds are `questions`, `generate`, and `evaluate`; historical jobs may also be `superseded` after a newer revision replaces their input. Use owner task detail as the current status; the newest-first job history is optional troubleshooting data, capped at 100 jobs. Questions inside a job's raw `result` are generation snapshots and may have `id: 0`; always obtain answerable question IDs from `GET /tasks/{id}/questions`.

A suitable frontend polling policy is:

- Poll only after an AI-triggering request, or when reopening an owned task whose state is pending/running. Send the owner's identity header and retain the expected revision.
- Start around one second, increase the interval up to five seconds, and give the polling session a finite deadline such as three minutes. Pass an `AbortController` signal to fetch; abort both a pending fetch and any scheduled timer on unmount, persona switch, cancellation, or deadline.
- Stop on `succeeded` or `failed`. If the revision changes, stop polling the old operation and reload/reconcile the editor. Never apply an old response over a newer local revision.
- On timeout, keep the saved draft and show that processing may continue on the server, with a manual Refresh action. A client timeout or abort does not cancel the persisted AI job.
- Stop and surface HTTP/network errors instead of swallowing them in an infinite loop. Cancellation is not an AI failure. If the server reports `failed`, display `ai_error` and an explicit Retry button calling `POST /tasks/{id}/ai/retry`; no body is required.

The retry endpoint only accepts a failed check for the current revision; otherwise it returns `409`. Ordinary AI failures are not automatically retried. A worker interrupted by a server crash can reclaim an expired job, so an interrupted external call may run again. Polling GET requests do not trigger model calls.

### Optimistic updates and form serialization

PATCH, answer submission, and confirmation require the current numeric `revision`. Use the latest owner response; public task responses have `revision: 0`, which is not a writable version. On `409`, reload the owner's task, preserve the user's unsaved form values separately, and let them reconcile changes before submitting again. A `409` can also mean an invalid workflow transition; inspect the message instead of assuming every conflict is a version mismatch.

For PATCH, omit untouched fields. Use `""` to clear a card text field and `[]` to clear `tag_ids`. `null` on these pointer-backed PATCH fields is treated like omission, not clearing. `raw_description` is an exception: it must stay nonblank. Do not strip empty strings or empty arrays from a deliberate edit. A PATCH containing only `revision` is invalid.

## Statuses and readiness

These are independent dimensions, so display separate badges rather than one combined status:

| Dimension | API values / rule |
| --- | --- |
| Visibility | `publication_status`: `draft`, `published`, `archived`. |
| Work progress | Task/proposal `execution_status`: `not_started`, `in_progress`, `completed`, `cancelled`. |
| Card quality | `readiness_score`: integer 0–100; derive the category in the UI. There is no `readiness` field in task responses. |
| Private processing | Owner-only `ai_status`: `pending`, `running`, `succeeded`, `failed`. |

Readiness categories are `draft` for 0–39, `working` for 40–69, `ready` for 70–89, and `priority` for 90–100. A published task can have readiness category `draft`; it is still visible and can receive proposals while execution is open. A completed/cancelled task can remain published and visible; hide application actions using execution status too.

The evaluation has seven criterion scores: `context_need` /20, `data` /20, `result` /15, `success_criteria` /15, `constraints` /10, `users` /10, and `communication` /10. Their sum is the total. Render each criterion's reason and missing information, and show the evaluation source so demo/fallback scores are identifiable. Scores from unconfirmed drafts belong in the owner's preview; public scores come from the confirmed snapshot.

Archiving hides a task from public reads without cancelling execution. Even an accepted team's members cannot read an archived task through the task-detail endpoint, although their team-proposal list remains available. An archived task can be republished while execution remains open and its current card is confirmed. Completion/cancellation closes task editing and its workflow changes; it does not implicitly archive the card.

## Catalog, teams, proposals and milestones

### Catalog

`GET /tasks` supports exact `topic` and `industry` filters, readiness category, comma-separated `tag_ids`, `limit` (default 20, range 1–100) and `offset` (default 0). Multiple tag IDs mean **all requested tags must match**, not any. The result is a JSON array without `total`, `items`, or a pagination envelope. A short page indicates the end; a full page may require another request. Sort order is readiness score descending, publication time descending, then ID descending.

Use `URLSearchParams` for filters. The catalog always sanitizes private fields, even when requested with the owner header; fetch owner detail or `/tasks/mine` for an editor. Teams expose aggregate tags derived from current members' skills. A frontend can use those tags to offer catalog filters; there is no implemented personalized recommendation API or keyword search.

### Team membership

Any student can create a team and automatically becomes its captain. Captains can edit team information, add existing students, remove other members, and transfer captaincy to an existing member. The current captain cannot remove themselves. Transferring to another member demotes the caller immediately; refresh the returned team before enabling further actions. Membership changes are allowed during active work and affect later EXP distribution. There is no invitation/acceptance flow or single-team membership restriction.

### Proposals

Only the current captain submits a proposal, containing `team_id`, `solution_idea`, `plan`, positive `duration_days`, and an optional HTTP(S) `prototype_url`. A task may select several teams, and the same team may submit several proposals for the same task. Do not model this as one proposal per team/task pair.

Proposal decision status is `pending`, `accepted`, or `rejected`. Only the task owner decides. Repeating the same decision is harmless, but changing an existing decision is rejected; acceptance/rejection is final. Acceptance sets proposal and task execution to `in_progress`. An accepted proposal's work can later be cancelled without changing its decision status. Ordinary members read their team's proposals but cannot submit proposals or results.

### Milestones and completion

Milestones belong to a specific accepted, active proposal. The task owner or its team's current captain may create them. `position: 0` (or omitted) appends after the highest position; an explicit positive position must be unused within that proposal. Milestone EXP defaults to 100 when omitted; an explicit zero is allowed.

A business-created milestone is approved immediately. A captain-created milestone requires `POST /milestones/{id}/approve` by the owner before submission. Approval is represented by non-null `approved_at` and `approved_by`; there is no `approved` milestone status. The initial status remains `pending` in either case.

The captain submits a result URL, changing status to `submitted`. The owner reviews with `accepted: true` to mark it `completed`, or `accepted: false` to mark it `rejected`. A rejected milestone can be resubmitted. A completed milestone is immutable. Approval alone does not accept the result; these are separate actions.

The owner completes a proposal after at least one approved milestone exists and **every approved milestone is completed**. Unapproved milestone suggestions do not block this action. The owner completes the overall task only when all accepted proposals are completed or cancelled and at least one is completed. These completion actions are explicit; the last milestone review does not automatically complete a proposal or the task.

Cancelling a proposal stops that accepted team's work. Cancelling a task rejects pending proposals and cancels active accepted proposals, preserving already completed work. Cancellation does not pay completion rewards or undo EXP already awarded.

### EXP and achievements

Milestone completion divides its EXP between current team members. Task completion pays the task's team reward once per distinct completed team, divided among that team's current members, and its business reward to the owner. Remainders are allocated by ascending user ID. Membership is evaluated at payout time, not when the proposal was submitted.

Backend transactions and unique ledger entries prevent duplicate rewards, including zero-value shares. Repeating a successful completion does not pay again or reward members added afterward. Achievements can add EXP too. Refresh profiles after publication, accepted milestone review and task completion; do not calculate authoritative totals or unlock achievements in the browser.

## JSON handling, errors and a fetch helper

Success responses are the resource object or array directly, with no `{data: ...}` wrapper. Most reads/updates return `200`, new teams/proposals/milestones return `201`, and task creation/save/answer/retry return `202`. Skill replacement returns `204` with an empty body. Send `Content-Type: application/json` on requests that have a JSON body; bodyless actions do not need a fabricated body.

Requests must contain one JSON object. Unknown properties, trailing JSON, malformed JSON, and oversized bodies are rejected. The body limit is 1 MiB. Follow the request shapes in [json.md](json.md), not the much larger response model. Timestamps are ISO/RFC3339 strings; nullable timestamps, IDs and objects should remain nullable in frontend types. Some nested slices in AI inputs/results and initial evaluation objects serialize as `null`; normalize display lists with `value ?? []`.

Public sanitization preserves JSON keys: `raw_description`, `ai_status`, and `ai_error` become `""`, `revision` becomes `0`, and draft/evaluated fields become `null`. These placeholders are deliberate, not a running AI operation or failed request. Before the first successful private evaluation, `draft_evaluation` is also `null`.

Errors use `{"error":{"code":"...","message":"..."}}`:

| HTTP | Code | Frontend behavior |
| --- | --- | --- |
| `400` | `invalid_input` | Show validation feedback. Missing required demo header is also 400, not 401. |
| `403` | `forbidden` | Refresh role/ownership assumptions; a disallowed browser origin also produces this status. |
| `404` | `not_found` | Resource is absent or a non-owner cannot view its unpublished task. |
| `405` | `method_not_allowed` | Check the endpoint's HTTP method. |
| `409` | `conflict` | Reload state; reconcile revision or explain the blocked transition. |
| `413` | `payload_too_large` | Reduce request size below 1 MiB. |
| `415` | `unsupported_media_type` | Send the required JSON content type. |
| `500` | `internal` | Show a recoverable server error; no internal database details are exposed. |
| `503` | `unavailable` | Health/readiness checks cannot reach the database. |

An AI failure is generally a successfully fetched task with `ai_status: "failed"`, not a `500` response from the original save. There is no push/WebSocket stream; retrieve updated state with GET.

This TypeScript helper propagates HTTP, network and cancellation errors and handles empty responses. Use `api<void>` for the skill-update endpoint. It deliberately performs no retries:

```ts
const API_BASE = "http://localhost:8080/api/v1";

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = Omit<RequestInit, "body"> & {
  userId?: number;
  json?: unknown;
};

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { userId, json, headers: initialHeaders, ...init } = options;
  const headers = new Headers(initialHeaders);
  if (userId !== undefined) headers.set("X-Demo-User-ID", String(userId));
  if (json !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(API_BASE + path, {
    ...init,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  if (!response.ok) {
    let body: { error?: { code?: string; message?: string } } | null = null;
    try {
      body = await response.json();
    } catch (error) {
      if (init.signal?.aborted) throw error;
      // A proxy may return a non-JSON error page; keep its HTTP status.
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `HTTP ${response.status}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
```

Disable duplicate submit buttons while a mutation is in flight. After a network timeout on a mutation, reload state before offering a repeat: the server may already have committed it. Resource creation and proposal submission are not universally idempotent, and repeating saves can spend AI credits.

## Backend structure for frontend debugging

The HTTP entry point uses Gin, application services enforce ownership and workflow rules, and ports connect those services to PostgreSQL through GORM and to the AI adapter. This is the project's hexagonal architecture. The frontend integrates through REST, not database tables or OpenAI directly.

Route handlers and HTTP validation are in `internal/adapters/httpapi/`; use cases are in `internal/application/`; JSON entities are in `internal/domain/models.go`. AI prompts, schemas and fallback live in `internal/adapters/ai/`. `cmd/api` starts both the HTTP server and the persisted-job worker. Backend logs are available with `docker compose logs -f api`.

For a first frontend smoke test, use fallback mode, switch to business, create a task, answer its questions, edit/confirm/publish it, switch to captain, submit a proposal, switch to business to accept it, propose/approve a milestone, submit as captain, then review and complete as business. Refresh both student profiles to see EXP and achievements. The Postman files provide requests for these operations and the remaining endpoints.

Import both Postman files and select the environment. Its `base_url` is the server root (`http://localhost:8080`), unlike the frontend `API_BASE` above; collection requests already include `/api/v1`. Run the `01 Full workflow` folder with a 1000 ms Runner delay (Newman: `--delay-request 1000`) to follow its bounded AI polling. Postman's individual Send button does not execute Runner loops. Dynamic resource IDs/revision are stored as collection variables; the environment holds only connection/persona defaults to avoid shadowing them. The workflow creates persisted demo resources, changes demo skill selections, and can award EXP. Use backend fallback mode for a free test. The separate optional failed-AI retry folder remains skipped until its collection variable `retry_task_id` is explicitly set to an owned, editable task with a failed current check.
