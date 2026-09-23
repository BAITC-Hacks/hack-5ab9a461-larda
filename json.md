# Larda frontend JSON reference

This file describes the JSON sent and returned by the current Go handlers and domain models. All example IDs and timestamps are illustrative; read real IDs and revisions from responses. Use [for_frontend.md](for_frontend.md) for workflows and [the Postman collection](postman/Larda.postman_collection.json) for executable requests.

## Transport and serialization

- Default origin: `http://localhost:8080`. Application endpoints use `/api/v1`; health endpoints do not.
- Send `Content-Type: application/json` for requests with a JSON body. Send `X-Demo-User-ID: 1` for the business, `2` for the initial team captain or `3` for the ordinary student on a fresh seeded database. Discover users through `GET /api/v1/users`. Captain is a team membership role; both students have `user.role = "student"`.
- Success responses are the object or array itself. There is no `data`, `items`, `total` or pagination envelope. Array endpoints return arrays of the models shown below.
- IDs, scores, revisions, rewards and durations are JSON numbers. Use positive integer resource IDs, not strings. Timestamps use RFC 3339, usually UTC with `Z`; fractional seconds and offsets may occur.
- Persisted resource responses include their declared fields even when values are `""` or `null`. Do not treat `""`, `null` and a missing property as interchangeable.
- Most list endpoints initialize empty collections as `[]`. Nested snapshots and immediate mutation responses can contain `null` collections, notably `AIJob.input.questions`, `AIJob.result.questions`, uninitialized evaluation arrays, initial `Task.tag_ids` and `Proposal.milestones`. Normalize a nullable collection with `value ?? []` where appropriate.
- Requests must contain exactly one JSON object. Top-level `null`, arrays, empty bodies for body-required endpoints, malformed JSON, unknown properties and trailing JSON values are rejected. The request limit is 1 MiB. Text values cannot contain the NUL character (`U+0000`, including JSON `\u0000`); invalid input returns `400`.
- For `PATCH /tasks/:taskID`, omitted or `null` pointer fields mean “leave unchanged”; an empty string clears a text field, and `tag_ids: []` clears tags. `raw_description` cannot be cleared. A revision-only patch is invalid. For full team `PUT`, omitted description/interests reset to `""`/`[]`, and name is required.
- `PUT /users/me/tags` replaces all tags. `tag_ids: []` clears them; omission or `null` also clears them in the current implementation. Send an explicit array.
- A nullable milestone `exp_reward` has different semantics: omitted or `null` means the default 100, while `0` means zero reward.
- No-body actions should send no request body. A successful `204` has no JSON: do not call `response.json()` on it.

## Endpoint index

All 39 routes are listed below. Paths beginning with `/api/v1` are shown in full. “None” means no JSON request body. Success status codes refer to successful requests; see [errors](#errors) for failures.

| Method | Path | Request JSON | Success | Response JSON |
| --- | --- | --- | --- | --- |
| GET | `/livez` | None | 200 | [Health](#health) |
| GET | `/healthz` | None | 200 | [Health](#health) |
| GET | `/readyz` | None | 200 | [Health](#health) |
| GET | `/api/v1/users` | None | 200 | [User](#users)[] |
| GET | `/api/v1/users/:userID` | None | 200 | [Profile](#profile) |
| GET | `/api/v1/tags` | None | 200 | [Tag](#tags)[] |
| GET | `/api/v1/achievements` | None | 200 | [Achievement](#achievements)[] |
| PUT | `/api/v1/users/me/tags` | [Set tags](#set-user-tags) | 204 | No body |
| GET | `/api/v1/tasks` | None; [query parameters](#catalog-query-parameters) | 200 | [Public Task](#public-task)[] |
| GET | `/api/v1/tasks/mine` | None | 200 | [Owner Task](#task-response-states)[] |
| POST | `/api/v1/tasks` | [CreateTask](#create-task) | 202 | [Pending Task](#new-task-pending-ai) |
| GET | `/api/v1/tasks/:taskID` | None | 200 | [Owner or public Task](#task-response-states) |
| PATCH | `/api/v1/tasks/:taskID` | [DraftPatch](#patch-task) | 202 | [Owner Task](#task-response-states) |
| GET | `/api/v1/tasks/:taskID/questions` | None | 200 | [TaskQuestion](#task-questions)[] |
| POST | `/api/v1/tasks/:taskID/answers` | [Answers](#answer-questions) | 202 | [Owner Task](#task-response-states) |
| GET | `/api/v1/tasks/:taskID/ai-jobs` | None | 200 | [AIJob](#ai-jobs)[] |
| POST | `/api/v1/tasks/:taskID/ai/retry` | None | 202 | [Owner Task](#task-response-states) |
| POST | `/api/v1/tasks/:taskID/confirm` | [Confirm](#confirm-task) | 200 | [Owner Task](#task-response-states) |
| POST | `/api/v1/tasks/:taskID/publish` | None | 200 | [Owner Task](#task-response-states) |
| POST | `/api/v1/tasks/:taskID/archive` | None | 200 | [Owner Task](#task-response-states) |
| POST | `/api/v1/tasks/:taskID/complete` | None | 200 | [Owner Task](#task-response-states) |
| POST | `/api/v1/tasks/:taskID/cancel` | None | 200 | [Owner Task](#task-response-states) |
| GET | `/api/v1/teams` | None | 200 | [Team](#teams)[] |
| GET | `/api/v1/teams/:teamID` | None | 200 | [Team](#teams) |
| POST | `/api/v1/teams` | [TeamInput](#create-or-replace-team) | 201 | [Team](#teams) |
| PUT | `/api/v1/teams/:teamID` | [TeamInput](#create-or-replace-team) | 200 | [Team](#teams) |
| POST | `/api/v1/teams/:teamID/members` | [Member](#add-member-or-transfer-captaincy) | 200 | [Team](#teams) |
| DELETE | `/api/v1/teams/:teamID/members/:userID` | None | 200 | [Team](#teams) |
| POST | `/api/v1/teams/:teamID/captain` | [Member](#add-member-or-transfer-captaincy) | 200 | [Team](#teams) |
| GET | `/api/v1/teams/:teamID/proposals` | None | 200 | [Proposal](#proposals)[] |
| GET | `/api/v1/tasks/:taskID/proposals` | None | 200 | [Proposal](#proposals)[] |
| POST | `/api/v1/tasks/:taskID/proposals` | [ProposalInput](#submit-proposal) | 201 | [Proposal](#proposals) |
| POST | `/api/v1/proposals/:proposalID/decision` | [Decision](#decide-proposal) | 200 | [Proposal](#proposals) |
| POST | `/api/v1/proposals/:proposalID/complete` | None | 200 | [Proposal](#proposals) |
| POST | `/api/v1/proposals/:proposalID/cancel` | None | 200 | [Proposal](#proposals) |
| POST | `/api/v1/proposals/:proposalID/milestones` | [MilestoneInput](#create-milestone) | 201 | [Milestone](#milestones) |
| POST | `/api/v1/milestones/:milestoneID/approve` | None | 200 | [Milestone](#milestones) |
| POST | `/api/v1/milestones/:milestoneID/submit` | [Submission](#submit-milestone-result) | 200 | [Milestone](#milestones) |
| POST | `/api/v1/milestones/:milestoneID/review` | [Review](#review-milestone-result) | 200 | [Milestone](#milestones) |

CORS preflight `OPTIONS` is handled by middleware and returns `204` for an allowed origin; it is not an additional resource endpoint.

### Catalog query parameters

Example URL: `/api/v1/tasks?industry=retail&topic=inventory&readiness=ready&tag_ids=4,6&limit=20&offset=0`.

| Parameter | Meaning |
| --- | --- |
| `industry`, `topic` | Exact text matches on confirmed card fields. |
| `readiness` | `draft` (0–39), `working` (40–69), `ready` (70–89), `priority` (90–100). |
| `tag_ids` | Comma-separated positive IDs; the task must contain **all** requested tags. |
| `limit` | 1–100, default 20. |
| `offset` | Nonnegative integer, default 0. |

The catalog contains only published cards, including low-scoring cards and cards whose execution is closed. It sorts by readiness score descending, publication time descending, then ID descending. There is no `readiness_level` JSON field: compute the label from the score. Readiness `draft` is a score band and does not mean `publication_status: "draft"`.

## Request JSON

### Create task

Business only. Required: nonblank `raw_description` with at most 20,000 characters. Optional: `industry`, `topic` (at most 80 characters each), `tag_ids` (at most 30 unique existing tag IDs). Creation saves the raw description and queues questions plus evaluation before returning `202`. These are all accepted properties:

```json
{
  "raw_description": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "industry": "retail",
  "topic": "inventory",
  "tag_ids": [
    4,
    6
  ]
}
```

### Patch task

Business owner only. Send the latest positive `revision` and at least one editable property. Every accepted patch increments the revision and queues AI work, even if a supplied value matches its old value. This is the complete editable shape; send only the fields the user changes:

```json
{
  "revision": 2,
  "raw_description": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "industry": "retail",
  "topic": "inventory",
  "title": "Cafe inventory dashboard",
  "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "need": "Track remaining stock and flag ingredients nearing expiry.",
  "target_users": "The cafe manager and two kitchen staff.",
  "available_data": "An anonymized CSV export with stock, delivery and expiry dates.",
  "constraints": "A web prototype in 14 days using anonymized data only.",
  "expected_result": "A working dashboard, source code and setup instructions.",
  "success_criteria": "At least 9 of 10 stock update and expiry alert scenarios pass.",
  "contact": "manager@example.test",
  "interaction_format": "A 30-minute online meeting each Wednesday.",
  "feedback_process": "The manager reviews each submitted milestone within two working days.",
  "tag_ids": [
    4,
    6
  ]
}
```

Card text fields allow at most 20,000 characters, except `industry` and `topic` (80). Raw description remains required if supplied. Changing raw description alone also replaces context only when context still equals the previous raw description. The public confirmed card remains intact until confirmation.

A minimal patch that clears tags and contact:

```json
{
  "revision": 2,
  "contact": "",
  "tag_ids": []
}
```

### Answer questions

Business owner only. Use the latest task `revision` and the **database IDs returned by the questions endpoint**. Answer every generated question exactly once, with nonblank answers of at most 20,000 characters. The backend generates 3–7 questions; the three-item example is only valid when the endpoint returned these three questions. Never hardcode these IDs or assume there are exactly three.

```json
{
  "revision": 1,
  "answers": [
    {
      "question_id": 21,
      "answer": "The anonymized CSV will be shared on the first project day."
    },
    {
      "question_id": 22,
      "answer": "A working dashboard, source code and setup instructions."
    },
    {
      "question_id": 23,
      "answer": "At least 9 of 10 stock update and expiry alert scenarios pass."
    }
  ]
}
```

Answers increment revision and queue `generate`, producing an editable card and its evaluation. Re-fetch the task after processing to obtain its current revision.

### Confirm task

Business owner only. Requires the current revision to have successful AI evaluation, a nonblank title, and `evaluated_revision === revision`.

```json
{
  "revision": 2
}
```

Confirmation copies `draft_card` and `draft_evaluation` into the top-level card and confirmed score, clears both draft fields, and sets `confirmed_at`. If already published, this makes the new confirmed version public immediately. First publication is a separate no-body `publish` action.

### Create or replace team

A student creates a team and becomes its captain. Only that team's current captain can replace it with `PUT`. Both endpoints use the same full shape:

```json
{
  "name": "Larda Builders",
  "description": "A team building web products for local businesses.",
  "interests": [
    "retail",
    "analytics"
  ]
}
```

Name is required, trimmed, and limited to 120 characters. `PUT` replaces all three fields. Members and tags are not writable here. Team tags are the union of its members' personal tags.

### Add member or transfer captaincy

Both endpoints accept the same body:

```json
{
  "user_id": 3
}
```

Only the current captain may call them. A new member must be a student; the next captain must already belong to the team. Membership removal uses the URL's `:userID` and no JSON body. Transfer captaincy before removing the current captain.

### Set user tags

Student only. Replaces the selected student's complete tag set; use real catalog IDs:

```json
{
  "tag_ids": [
    2,
    6
  ]
}
```

Success is `204` with no response body. Refresh the student's profile and relevant team data to show the new aggregate tags.

### Submit proposal

Only the selected team's captain can submit to a published, open task. All properties are shown here:

```json
{
  "team_id": 6,
  "solution_idea": "Build a Go API and a React stock dashboard.",
  "plan": "Analyze the CSV, build the prototype, test it and present the result.",
  "duration_days": 14,
  "prototype_url": "https://example.test/prototype"
}
```

`solution_idea` and `plan` must be nonblank, `duration_days` must be an integer from 1 to 2,147,483,647, and `team_id` valid. `prototype_url` may be omitted or `""`; a nonempty URL must use HTTP/HTTPS, have a host and contain no embedded credentials. Submit milestones separately after the proposal is accepted.

### Decide proposal

Business owner only. Accept:

```json
{
  "status": "accepted"
}
```

Or reject:

```json
{
  "status": "rejected"
}
```

A pending proposal can receive one decision; repeating the same decision is allowed. Accepting starts its execution and the task's execution. Several teams may be accepted.

### Create milestone

The business owner or the accepted proposal's team captain may propose a milestone. Omitting `exp_reward` uses 100. Omitted or zero `position` appends after the current highest position:

```json
{
  "position": 0,
  "title": "Inventory prototype",
  "description": "Implement stock updates and demonstrate them with sample data."
}
```

To create a milestone with no EXP reward, send zero explicitly:

```json
{
  "position": 2,
  "title": "Review the prototype",
  "description": "Walk through the prototype with the business.",
  "exp_reward": 0
}
```

Explicit rewards must be 0–2,147,483,647. Title must be nonblank and at most 200 characters. `position` must be an integer from 0 to 2,147,483,647; explicit positive positions must be unique within the proposal. Auto-append fails with `409` if the highest position is already 2,147,483,647; choose an unused position explicitly. A business-created milestone is approved immediately; a captain-created one requires the no-body business `approve` action.

### Submit milestone result

Captain only, after business approval:

```json
{
  "result_url": "https://example.test/results/inventory-demo"
}
```

The result must be an HTTP/HTTPS URL with a host and no embedded credentials. This endpoint stores a link; it does not upload files.

### Review milestone result

Business owner only. Reject the submitted result so the captain can revise and resubmit:

```json
{
  "accepted": false
}
```

Or accept and award EXP:

```json
{
  "accepted": true
}
```

The boolean is required: omission or `null` is invalid. No feedback/comment property is accepted.

### Actions without request JSON

Send no body for task `ai/retry`, `publish`, `archive`, `complete`, `cancel`; proposal `complete`, `cancel`; milestone `approve`; membership `DELETE`; and all `GET` endpoints. Do not send response objects back as request bodies: their server-owned fields are rejected.

## Response models

### Card

A `Card` is embedded directly in the top-level Task, and is a nested object at `draft_card`, `AIJob.input.card` and `AIJob.result.card`. There is no separate card endpoint or top-level `card` property on Task.

```json
{
  "industry": "retail",
  "topic": "inventory",
  "title": "Cafe inventory dashboard",
  "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "need": "Track remaining stock and flag ingredients nearing expiry.",
  "target_users": "The cafe manager and two kitchen staff.",
  "available_data": "An anonymized CSV export with stock, delivery and expiry dates.",
  "constraints": "A web prototype in 14 days using anonymized data only.",
  "expected_result": "A working dashboard, source code and setup instructions.",
  "success_criteria": "At least 9 of 10 stock update and expiry alert scenarios pass.",
  "contact": "manager@example.test",
  "interaction_format": "A 30-minute online meeting each Wednesday.",
  "feedback_process": "The manager reviews each submitted milestone within two working days.",
  "tag_ids": [
    4,
    6
  ]
}
```

Card fields are strings, with `tag_ids` an array of numeric IDs (or `null` in uninitialized/snapshot cases). Blank strings represent unfilled information.

### Evaluation

An evaluated score is the sum of exactly seven criteria, with these maxima:

| Criterion key | Maximum |
| --- | --- |
| `context_need` | 20 |
| `data` | 20 |
| `result` | 15 |
| `success_criteria` | 15 |
| `constraints` | 10 |
| `users` | 10 |
| `communication` | 10 |

Every criterion's integer score is already weighted. Sum the criterion scores directly; do not multiply them by weights or average them. Valid total scores are 0–100. Criterion array order is not part of the contract: match by `key`.

```json
{
  "score": 85,
  "criteria": [
    {
      "key": "context_need",
      "score": 18,
      "reason": "The problem and business need are described.",
      "missing": []
    },
    {
      "key": "data",
      "score": 16,
      "reason": "The CSV format is known but access timing is unclear.",
      "missing": [
        "Specify when the CSV will be shared."
      ]
    },
    {
      "key": "result",
      "score": 13,
      "reason": "The deliverables are clear.",
      "missing": []
    },
    {
      "key": "success_criteria",
      "score": 12,
      "reason": "A pass threshold is given but scenarios need detail.",
      "missing": [
        "List the ten acceptance scenarios."
      ]
    },
    {
      "key": "constraints",
      "score": 8,
      "reason": "The deadline and privacy constraints are stated.",
      "missing": []
    },
    {
      "key": "users",
      "score": 9,
      "reason": "The user roles are identified.",
      "missing": []
    },
    {
      "key": "communication",
      "score": 9,
      "reason": "A contact, meeting schedule and feedback deadline are stated.",
      "missing": []
    }
  ],
  "missing": [
    "Specify when the CSV will be shared.",
    "List the ten acceptance scenarios."
  ],
  "source": "openai"
}
```

`source` is `openai` for API-backed scores, `fallback` for explicitly configured local demo mode, and `demo_seed` for preloaded public examples. The fallback is not silently substituted after an OpenAI failure.

Before the first confirmation, `score_breakdown` is an uninitialized object (not a validated seven-criterion result):

```json
{
  "score": 0,
  "criteria": null,
  "missing": null,
  "source": ""
}
```

Use `draft_evaluation` for an owner's pending candidate score and `readiness_score`/`score_breakdown` for the last confirmed score.

### Task response states

The same Task model is returned by detail, mutation and task list routes. It contains the flattened [Card](#card), server metadata, private draft state and the confirmed evaluation. The full examples below cover the main frontend states.

| Property | Values / meaning |
| --- | --- |
| `publication_status` | `draft`, `published`, `archived`. |
| `execution_status` | `not_started`, `in_progress`, `completed`, `cancelled`. |
| `ai_status` | Owner view: `pending`, `running`, `succeeded`, `failed`. Public view: `""`. |
| `revision` | Owner's current editable revision. Public view is always 0. |
| `evaluated_revision` | Current successfully evaluated revision, or `null` before completion/publicly. |
| `draft_card` | Editable Card or `null` after confirmation/publicly. |
| `draft_evaluation` | Successful draft Evaluation or `null` when pending, failed, confirmed or public. |
| `readiness_score`, `score_breakdown` | Last confirmed evaluation; remain unchanged while drafts are being edited. |
| `confirmed_at`, `published_at`, `completed_at` | Nullable timestamps; `published_at` records first publication. |
| `team_exp_reward`, `business_exp_reward` | Server-managed rewards, not editable request fields. |

#### New task pending AI

Example immediate `POST /tasks` response, `202`. Top-level card fields have not been confirmed, so they are blank; read `draft_card` in the editor.

```json
{
  "id": 11,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "owner_id": 1,
  "industry": "",
  "topic": "",
  "title": "",
  "context": "",
  "need": "",
  "target_users": "",
  "available_data": "",
  "constraints": "",
  "expected_result": "",
  "success_criteria": "",
  "contact": "",
  "interaction_format": "",
  "feedback_process": "",
  "tag_ids": null,
  "raw_description": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "draft_card": {
    "industry": "retail",
    "topic": "inventory",
    "title": "",
    "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
    "need": "",
    "target_users": "",
    "available_data": "",
    "constraints": "",
    "expected_result": "",
    "success_criteria": "",
    "contact": "",
    "interaction_format": "",
    "feedback_process": "",
    "tag_ids": [
      4,
      6
    ]
  },
  "draft_evaluation": null,
  "revision": 1,
  "evaluated_revision": null,
  "ai_status": "pending",
  "ai_error": "",
  "publication_status": "draft",
  "readiness_score": 0,
  "score_breakdown": {
    "score": 0,
    "criteria": null,
    "missing": null,
    "source": ""
  },
  "confirmed_at": null,
  "published_at": null,
  "execution_status": "not_started",
  "team_exp_reward": 100,
  "business_exp_reward": 50,
  "completed_at": null
}
```

The immediate creation response can have top-level `tag_ids: null`; a subsequent DB-backed read normally loads `tag_ids: []` until confirmation. Draft tags are already present inside `draft_card`.

#### Owner task ready for confirmation

Example `GET /tasks/11` with the owner's header after answers have been processed. Here “ready for confirmation” describes AI completion, not an additional status enum:

```json
{
  "id": 11,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:05:00Z",
  "owner_id": 1,
  "industry": "",
  "topic": "",
  "title": "",
  "context": "",
  "need": "",
  "target_users": "",
  "available_data": "",
  "constraints": "",
  "expected_result": "",
  "success_criteria": "",
  "contact": "",
  "interaction_format": "",
  "feedback_process": "",
  "tag_ids": [],
  "raw_description": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "draft_card": {
    "industry": "retail",
    "topic": "inventory",
    "title": "Cafe inventory dashboard",
    "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
    "need": "Track remaining stock and flag ingredients nearing expiry.",
    "target_users": "The cafe manager and two kitchen staff.",
    "available_data": "An anonymized CSV export with stock, delivery and expiry dates.",
    "constraints": "A web prototype in 14 days using anonymized data only.",
    "expected_result": "A working dashboard, source code and setup instructions.",
    "success_criteria": "At least 9 of 10 stock update and expiry alert scenarios pass.",
    "contact": "manager@example.test",
    "interaction_format": "A 30-minute online meeting each Wednesday.",
    "feedback_process": "The manager reviews each submitted milestone within two working days.",
    "tag_ids": [
      4,
      6
    ]
  },
  "draft_evaluation": {
    "score": 85,
    "criteria": [
      {
        "key": "context_need",
        "score": 18,
        "reason": "The problem and business need are described.",
        "missing": []
      },
      {
        "key": "data",
        "score": 16,
        "reason": "The CSV format is known but access timing is unclear.",
        "missing": [
          "Specify when the CSV will be shared."
        ]
      },
      {
        "key": "result",
        "score": 13,
        "reason": "The deliverables are clear.",
        "missing": []
      },
      {
        "key": "success_criteria",
        "score": 12,
        "reason": "A pass threshold is given but scenarios need detail.",
        "missing": [
          "List the ten acceptance scenarios."
        ]
      },
      {
        "key": "constraints",
        "score": 8,
        "reason": "The deadline and privacy constraints are stated.",
        "missing": []
      },
      {
        "key": "users",
        "score": 9,
        "reason": "The user roles are identified.",
        "missing": []
      },
      {
        "key": "communication",
        "score": 9,
        "reason": "A contact, meeting schedule and feedback deadline are stated.",
        "missing": []
      }
    ],
    "missing": [
      "Specify when the CSV will be shared.",
      "List the ten acceptance scenarios."
    ],
    "source": "openai"
  },
  "revision": 2,
  "evaluated_revision": 2,
  "ai_status": "succeeded",
  "ai_error": "",
  "publication_status": "draft",
  "readiness_score": 0,
  "score_breakdown": {
    "score": 0,
    "criteria": null,
    "missing": null,
    "source": ""
  },
  "confirmed_at": null,
  "published_at": null,
  "execution_status": "not_started",
  "team_exp_reward": 100,
  "business_exp_reward": 50,
  "completed_at": null
}
```

Confirming revision 2 copies this draft to the top level, sets `readiness_score: 85`, stores the evaluation at `score_breakdown`, sets `confirmed_at`, and clears both draft fields. It leaves `publication_status: "draft"` until `publish` is called.

#### Published owner task with a new draft

Example owner read while a later edit is awaiting evaluation. The top-level card and score still show the confirmed version:

```json
{
  "id": 11,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:05:00Z",
  "owner_id": 1,
  "industry": "retail",
  "topic": "inventory",
  "title": "Cafe inventory dashboard",
  "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "need": "Track remaining stock and flag ingredients nearing expiry.",
  "target_users": "The cafe manager and two kitchen staff.",
  "available_data": "An anonymized CSV export with stock, delivery and expiry dates.",
  "constraints": "A web prototype in 14 days using anonymized data only.",
  "expected_result": "A working dashboard, source code and setup instructions.",
  "success_criteria": "At least 9 of 10 stock update and expiry alert scenarios pass.",
  "contact": "manager@example.test",
  "interaction_format": "A 30-minute online meeting each Wednesday.",
  "feedback_process": "The manager reviews each submitted milestone within two working days.",
  "tag_ids": [
    4,
    6
  ],
  "raw_description": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "draft_card": {
    "industry": "retail",
    "topic": "inventory",
    "title": "Cafe inventory dashboard",
    "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
    "need": "Track remaining stock and flag ingredients nearing expiry.",
    "target_users": "The cafe manager and two kitchen staff.",
    "available_data": "An anonymized CSV export with stock, delivery and expiry dates.",
    "constraints": "A web prototype in 14 days using anonymized data only.",
    "expected_result": "A working dashboard with a CSV import screen, source code and setup instructions.",
    "success_criteria": "At least 9 of 10 stock update and expiry alert scenarios pass.",
    "contact": "manager@example.test",
    "interaction_format": "A 30-minute online meeting each Wednesday.",
    "feedback_process": "The manager reviews each submitted milestone within two working days.",
    "tag_ids": [
      4,
      6
    ]
  },
  "draft_evaluation": null,
  "revision": 3,
  "evaluated_revision": null,
  "ai_status": "pending",
  "ai_error": "",
  "publication_status": "published",
  "readiness_score": 85,
  "score_breakdown": {
    "score": 85,
    "criteria": [
      {
        "key": "context_need",
        "score": 18,
        "reason": "The problem and business need are described.",
        "missing": []
      },
      {
        "key": "data",
        "score": 16,
        "reason": "The CSV format is known but access timing is unclear.",
        "missing": [
          "Specify when the CSV will be shared."
        ]
      },
      {
        "key": "result",
        "score": 13,
        "reason": "The deliverables are clear.",
        "missing": []
      },
      {
        "key": "success_criteria",
        "score": 12,
        "reason": "A pass threshold is given but scenarios need detail.",
        "missing": [
          "List the ten acceptance scenarios."
        ]
      },
      {
        "key": "constraints",
        "score": 8,
        "reason": "The deadline and privacy constraints are stated.",
        "missing": []
      },
      {
        "key": "users",
        "score": 9,
        "reason": "The user roles are identified.",
        "missing": []
      },
      {
        "key": "communication",
        "score": 9,
        "reason": "A contact, meeting schedule and feedback deadline are stated.",
        "missing": []
      }
    ],
    "missing": [
      "Specify when the CSV will be shared.",
      "List the ten acceptance scenarios."
    ],
    "source": "openai"
  },
  "confirmed_at": "2026-09-23T12:03:00Z",
  "published_at": "2026-09-23T12:04:00Z",
  "execution_status": "not_started",
  "team_exp_reward": 100,
  "business_exp_reward": 50,
  "completed_at": null
}
```

After evaluation succeeds, `draft_evaluation` is filled and `evaluated_revision` matches 3. Confirming revision 3 immediately replaces the published card. Neither completion nor cancellation deletes a task; those actions change `execution_status`, with `completed_at` populated only for completion. Archive changes `publication_status` and removes it from the public catalog.

#### Public task

The catalog always returns this sanitized shape, even when called with the owner's header. A detail request returns it for anyone other than the owner and only if the task is published. Private fields are retained with empty/null values rather than omitted:

```json
{
  "id": 11,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:05:00Z",
  "owner_id": 1,
  "industry": "retail",
  "topic": "inventory",
  "title": "Cafe inventory dashboard",
  "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
  "need": "Track remaining stock and flag ingredients nearing expiry.",
  "target_users": "The cafe manager and two kitchen staff.",
  "available_data": "An anonymized CSV export with stock, delivery and expiry dates.",
  "constraints": "A web prototype in 14 days using anonymized data only.",
  "expected_result": "A working dashboard, source code and setup instructions.",
  "success_criteria": "At least 9 of 10 stock update and expiry alert scenarios pass.",
  "contact": "manager@example.test",
  "interaction_format": "A 30-minute online meeting each Wednesday.",
  "feedback_process": "The manager reviews each submitted milestone within two working days.",
  "tag_ids": [
    4,
    6
  ],
  "raw_description": "",
  "draft_card": null,
  "draft_evaluation": null,
  "revision": 0,
  "evaluated_revision": null,
  "ai_status": "",
  "ai_error": "",
  "publication_status": "published",
  "readiness_score": 85,
  "score_breakdown": {
    "score": 85,
    "criteria": [
      {
        "key": "context_need",
        "score": 18,
        "reason": "The problem and business need are described.",
        "missing": []
      },
      {
        "key": "data",
        "score": 16,
        "reason": "The CSV format is known but access timing is unclear.",
        "missing": [
          "Specify when the CSV will be shared."
        ]
      },
      {
        "key": "result",
        "score": 13,
        "reason": "The deliverables are clear.",
        "missing": []
      },
      {
        "key": "success_criteria",
        "score": 12,
        "reason": "A pass threshold is given but scenarios need detail.",
        "missing": [
          "List the ten acceptance scenarios."
        ]
      },
      {
        "key": "constraints",
        "score": 8,
        "reason": "The deadline and privacy constraints are stated.",
        "missing": []
      },
      {
        "key": "users",
        "score": 9,
        "reason": "The user roles are identified.",
        "missing": []
      },
      {
        "key": "communication",
        "score": 9,
        "reason": "A contact, meeting schedule and feedback deadline are stated.",
        "missing": []
      }
    ],
    "missing": [
      "Specify when the CSV will be shared.",
      "List the ten acceptance scenarios."
    ],
    "source": "openai"
  },
  "confirmed_at": "2026-09-23T12:03:00Z",
  "published_at": "2026-09-23T12:04:00Z",
  "execution_status": "not_started",
  "team_exp_reward": 100,
  "business_exp_reward": 50,
  "completed_at": null
}
```

For owner editing, use `GET /tasks/mine` or `GET /tasks/:taskID` with the owner's header, never a catalog entry's zero revision.

### Task questions

`GET /tasks/:taskID/questions` returns saved question records ordered by round and position. All questions currently use round 1. The following is one complete three-question response:

```json
[
  {
    "id": 21,
    "created_at": "2026-09-23T12:00:00Z",
    "updated_at": "2026-09-23T12:00:00Z",
    "task_id": 11,
    "round_number": 1,
    "position": 1,
    "field_key": "available_data",
    "question": "When can the team access the CSV?",
    "answer": null
  },
  {
    "id": 22,
    "created_at": "2026-09-23T12:00:00Z",
    "updated_at": "2026-09-23T12:00:00Z",
    "task_id": 11,
    "round_number": 1,
    "position": 2,
    "field_key": "expected_result",
    "question": "What must the final delivery contain?",
    "answer": null
  },
  {
    "id": 23,
    "created_at": "2026-09-23T12:00:00Z",
    "updated_at": "2026-09-23T12:00:00Z",
    "task_id": 11,
    "round_number": 1,
    "position": 3,
    "field_key": "success_criteria",
    "question": "How will the result be accepted?",
    "answer": null
  }
]
```

After answer submission each `answer` becomes its submitted string. Question IDs are distinct from their `position`; use IDs in the answers request.

### AI jobs

The owner-only jobs endpoint returns up to the latest 100 jobs ordered newest ID first. Job `kind` is `questions`, `generate` or `evaluate`. Job `status` is `pending`, `running`, `succeeded`, `failed` or `superseded`; superseded jobs belong to outdated revisions or closed tasks.

A new job, before processing:

```json
{
  "id": 16,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "task_id": 11,
  "revision": 1,
  "kind": "questions",
  "status": "pending",
  "attempts": 0,
  "error": "",
  "input": {
    "raw_description": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
    "card": {
      "industry": "retail",
      "topic": "inventory",
      "title": "",
      "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
      "need": "",
      "target_users": "",
      "available_data": "",
      "constraints": "",
      "expected_result": "",
      "success_criteria": "",
      "contact": "",
      "interaction_format": "",
      "feedback_process": "",
      "tag_ids": [
        4,
        6
      ]
    },
    "questions": null
  },
  "result": null
}
```

A successful card-generation job, including the complete nested input snapshot and result:

```json
{
  "id": 17,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:05:00Z",
  "task_id": 11,
  "revision": 2,
  "kind": "generate",
  "status": "succeeded",
  "attempts": 1,
  "error": "",
  "input": {
    "raw_description": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
    "card": {
      "industry": "retail",
      "topic": "inventory",
      "title": "",
      "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
      "need": "",
      "target_users": "",
      "available_data": "",
      "constraints": "",
      "expected_result": "",
      "success_criteria": "",
      "contact": "",
      "interaction_format": "",
      "feedback_process": "",
      "tag_ids": [
        4,
        6
      ]
    },
    "questions": [
      {
        "id": 21,
        "created_at": "2026-09-23T12:00:00Z",
        "updated_at": "2026-09-23T12:05:00Z",
        "task_id": 11,
        "round_number": 1,
        "position": 1,
        "field_key": "available_data",
        "question": "When can the team access the CSV?",
        "answer": "The anonymized CSV will be shared on the first project day."
      },
      {
        "id": 22,
        "created_at": "2026-09-23T12:00:00Z",
        "updated_at": "2026-09-23T12:05:00Z",
        "task_id": 11,
        "round_number": 1,
        "position": 2,
        "field_key": "expected_result",
        "question": "What must the final delivery contain?",
        "answer": "A working dashboard, source code and setup instructions."
      },
      {
        "id": 23,
        "created_at": "2026-09-23T12:00:00Z",
        "updated_at": "2026-09-23T12:05:00Z",
        "task_id": 11,
        "round_number": 1,
        "position": 3,
        "field_key": "success_criteria",
        "question": "How will the result be accepted?",
        "answer": "At least 9 of 10 stock update and expiry alert scenarios pass."
      }
    ]
  },
  "result": {
    "questions": null,
    "card": {
      "industry": "retail",
      "topic": "inventory",
      "title": "Cafe inventory dashboard",
      "context": "Our cafe tracks stock in spreadsheets and often wastes ingredients.",
      "need": "Track remaining stock and flag ingredients nearing expiry.",
      "target_users": "The cafe manager and two kitchen staff.",
      "available_data": "An anonymized CSV export with stock, delivery and expiry dates.",
      "constraints": "A web prototype in 14 days using anonymized data only.",
      "expected_result": "A working dashboard, source code and setup instructions.",
      "success_criteria": "At least 9 of 10 stock update and expiry alert scenarios pass.",
      "contact": "manager@example.test",
      "interaction_format": "A 30-minute online meeting each Wednesday.",
      "feedback_process": "The manager reviews each submitted milestone within two working days.",
      "tag_ids": [
        4,
        6
      ]
    },
    "evaluation": {
      "score": 85,
      "criteria": [
        {
          "key": "context_need",
          "score": 18,
          "reason": "The problem and business need are described.",
          "missing": []
        },
        {
          "key": "data",
          "score": 16,
          "reason": "The CSV format is known but access timing is unclear.",
          "missing": [
            "Specify when the CSV will be shared."
          ]
        },
        {
          "key": "result",
          "score": 13,
          "reason": "The deliverables are clear.",
          "missing": []
        },
        {
          "key": "success_criteria",
          "score": 12,
          "reason": "A pass threshold is given but scenarios need detail.",
          "missing": [
            "List the ten acceptance scenarios."
          ]
        },
        {
          "key": "constraints",
          "score": 8,
          "reason": "The deadline and privacy constraints are stated.",
          "missing": []
        },
        {
          "key": "users",
          "score": 9,
          "reason": "The user roles are identified.",
          "missing": []
        },
        {
          "key": "communication",
          "score": 9,
          "reason": "A contact, meeting schedule and feedback deadline are stated.",
          "missing": []
        }
      ],
      "missing": [
        "Specify when the CSV will be shared.",
        "List the ten acceptance scenarios."
      ],
      "source": "openai"
    }
  }
}
```

`input` always has `raw_description`, a full `card` and nullable `questions`. `result` is `null` until success and contains exactly `questions`, nullable `card` and `evaluation` when successful. A `questions` job fills result questions; a `generate` job fills result card; an `evaluate` job can have both `questions` and `card` null. The evaluation shape is the same for all successful kinds.

Result questions use the [TaskQuestion](#task-questions) field shape but are raw AI snapshots. Their IDs/task IDs/round numbers can be 0 and timestamps `"0001-01-01T00:00:00Z"`; they are **not** the subsequently saved question rows. Use the dedicated questions endpoint for answer IDs. Input questions on generation/evaluation jobs are snapshots of saved records.

`attempts` increments when a worker claims a job. On failure, `error` and Task `ai_error` contain a displayable message; retry reuses the failed current job, clears the error and returns the Task with `ai_status: "pending"`. A lease token is internal and never serialized. New edits can supersede old jobs; inspect the task's latest revision and status instead of trusting any single older job.

AI diagnostics are owner-only and sanitized: they distinguish an invalid OpenAI key (`401`), unavailable model/endpoint (`400`/`404`), insufficient credits or spending limits (`429` quota), rate limits (`429`), timeouts, and invalid model output. Upstream response bodies and secrets are never returned. These provider status numbers appear in the message; fetching the failed task still returns `200`. Display the message as text, correct the configuration/quota or wait as appropriate, then explicitly call `POST /tasks/:taskID/ai/retry` without a body and resume polling. Retry requires an editable task whose current check failed; otherwise it returns `409`. Do not automatically retry failed checks or branch application logic on the exact diagnostic wording.

### Users

Example `GET /users` response with all User fields. The fresh seed has three identities; names and EXP can be read dynamically:

```json
[
  {
    "id": 1,
    "created_at": "2026-09-23T12:00:00Z",
    "updated_at": "2026-09-23T12:00:00Z",
    "name": "Бизнес",
    "role": "business",
    "company_name": "Demo Business",
    "exp": 30
  },
  {
    "id": 2,
    "created_at": "2026-09-23T12:00:00Z",
    "updated_at": "2026-09-23T12:00:00Z",
    "name": "Капитан",
    "role": "student",
    "company_name": null,
    "exp": 0
  },
  {
    "id": 3,
    "created_at": "2026-09-23T12:00:00Z",
    "updated_at": "2026-09-23T12:00:00Z",
    "name": "Студент",
    "role": "student",
    "company_name": null,
    "exp": 0
  }
]
```

`company_name` is nullable. There is no password, email, token, or global `captain` role in User JSON.

### Tags

A Tag includes its own record metadata:

```json
{
  "id": 4,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "slug": "go",
  "name": "Go",
  "kind": "technology"
}
```

`kind` is `specialization`, `technology` or `skill`. `GET /tags` returns a flat Tag array. Task cards store IDs, while user profiles and teams contain full Tag objects.

### Teams

A full Team response contains membership records and the union of member tags:

```json
{
  "id": 6,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "name": "Larda Builders",
  "description": "A team building web products for local businesses.",
  "interests": [
    "retail",
    "analytics"
  ],
  "members": [
    {
      "team_id": 6,
      "user_id": 2,
      "role": "captain",
      "joined_at": "2026-09-23T12:00:00Z"
    },
    {
      "team_id": 6,
      "user_id": 3,
      "role": "member",
      "joined_at": "2026-09-23T12:00:00Z"
    }
  ],
  "tags": [
    {
      "id": 4,
      "created_at": "2026-09-23T12:00:00Z",
      "updated_at": "2026-09-23T12:00:00Z",
      "slug": "go",
      "name": "Go",
      "kind": "technology"
    },
    {
      "id": 6,
      "created_at": "2026-09-23T12:00:00Z",
      "updated_at": "2026-09-23T12:00:00Z",
      "slug": "react",
      "name": "React",
      "kind": "technology"
    }
  ]
}
```

Each TeamMember contains only `team_id`, `user_id`, `role` and `joined_at`; it has no separate ID or User object. Join `user_id` against the users endpoint for a name. A team's tag union changes with membership and personal tags.

### Proposals

Example pending creation response, including every Proposal field:

```json
{
  "id": 6,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "task_id": 11,
  "team_id": 6,
  "submitted_by": 2,
  "solution_idea": "Build a Go API and a React stock dashboard.",
  "plan": "Analyze the CSV, build the prototype, test it and present the result.",
  "duration_days": 14,
  "prototype_url": "https://example.test/prototype",
  "status": "pending",
  "decided_by": null,
  "decided_at": null,
  "execution_status": "not_started",
  "completed_at": null,
  "milestones": null
}
```

An immediate submission can return `milestones: null`; consume it as an empty list. Proposal-list reads and later filled responses return the milestones collection:

```json
{
  "id": 6,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "task_id": 11,
  "team_id": 6,
  "submitted_by": 2,
  "solution_idea": "Build a Go API and a React stock dashboard.",
  "plan": "Analyze the CSV, build the prototype, test it and present the result.",
  "duration_days": 14,
  "prototype_url": "https://example.test/prototype",
  "status": "accepted",
  "decided_by": 1,
  "decided_at": "2026-09-23T12:05:00Z",
  "execution_status": "in_progress",
  "completed_at": null,
  "milestones": [
    {
      "id": 8,
      "created_at": "2026-09-23T12:00:00Z",
      "updated_at": "2026-09-23T12:00:00Z",
      "proposal_id": 6,
      "position": 1,
      "title": "Inventory prototype",
      "description": "Implement stock updates and demonstrate them with sample data.",
      "exp_reward": 100,
      "status": "pending",
      "result_url": null,
      "submitted_at": null,
      "completed_by": null,
      "completed_at": null,
      "proposed_by": 2,
      "approved_by": null,
      "approved_at": null
    }
  ]
}
```

`status` is the selection decision (`pending`, `accepted`, `rejected`), while `execution_status` tracks work (`not_started`, `in_progress`, `completed`, `cancelled`). They are separate: cancellation of an accepted proposal leaves `status: "accepted"` and changes its execution status.

`decided_by`, `decided_at`, `completed_at` are nullable. There is no individual proposal GET route: refresh the business task-proposals list or a member's team-proposals list. The two list routes include nested milestones.

### Milestones

A milestone proposed by a captain, awaiting business approval:

```json
{
  "id": 8,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "proposal_id": 6,
  "position": 1,
  "title": "Inventory prototype",
  "description": "Implement stock updates and demonstrate them with sample data.",
  "exp_reward": 100,
  "status": "pending",
  "result_url": null,
  "submitted_at": null,
  "completed_by": null,
  "completed_at": null,
  "proposed_by": 2,
  "approved_by": null,
  "approved_at": null
}
```

A business-approved milestone whose submitted result has been accepted:

```json
{
  "id": 8,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T13:00:00Z",
  "proposal_id": 6,
  "position": 1,
  "title": "Inventory prototype",
  "description": "Implement stock updates and demonstrate them with sample data.",
  "exp_reward": 100,
  "status": "completed",
  "result_url": "https://example.test/results/inventory-demo",
  "submitted_at": "2026-09-23T12:50:00Z",
  "completed_by": 1,
  "completed_at": "2026-09-23T13:00:00Z",
  "proposed_by": 2,
  "approved_by": 1,
  "approved_at": "2026-09-23T12:10:00Z"
}
```

`status` is `pending`, `submitted`, `completed` or `rejected`. Approval is separate: check `approved_at !== null`, not a nonexistent `"approved"` status. Business-created milestones start approved with status `pending`; captain-created ones start unapproved. `completed_by` is the business reviewer, while `proposed_by` is the creator.

Rejecting a submitted result sets status `rejected` and keeps its result URL and submission timestamp. The captain may submit an improved URL, making it `submitted` again. A successful review sets completion fields and grants the team reward once. Milestones are refreshed through proposal lists; there is no standalone milestone GET route.

### Achievements

`GET /achievements` returns active definitions:

```json
{
  "id": 3,
  "created_at": "2026-09-23T12:00:00Z",
  "updated_at": "2026-09-23T12:00:00Z",
  "code": "first_task_published",
  "title": "First task published",
  "description": "Publish your first confirmed task.",
  "role_scope": "business",
  "event_type": "task_published",
  "target_count": 1,
  "exp_reward": 30,
  "is_active": true
}
```

`role_scope` is `student`, `business` or `all`. `event_type` is `milestone_completed`, `task_completed` or `task_published`.

A UserAchievement, as returned inside Profile, is a relation rather than an embedded definition:

```json
{
  "user_id": 1,
  "achievement_id": 3,
  "unlocked_at": "2026-09-23T12:00:00Z"
}
```

Resolve `achievement_id` against the achievement catalog to display its title, description and reward.

### EXP transactions

Every transaction includes all source fields, with unused foreign keys set to null:

```json
{
  "id": 1,
  "user_id": 1,
  "amount": 30,
  "reason": "achievement_unlocked",
  "milestone_id": null,
  "task_id": null,
  "team_id": null,
  "achievement_id": 3,
  "created_at": "2026-09-23T12:00:00Z"
}
```

| `reason` | Populated source IDs |
| --- | --- |
| `milestone_completed` | `milestone_id` |
| `team_task_completed` | `task_id`, `team_id` |
| `business_task_completed` | `task_id` |
| `achievement_unlocked` | `achievement_id` |

`amount` is a nonnegative integer and can be 0. The balance is returned as `user.exp`; the frontend does not write it. History is ordered newest creation time and ID first.

### Profile

`GET /users/:userID` returns this wrapper, rather than a bare User:

```json
{
  "user": {
    "id": 1,
    "created_at": "2026-09-23T12:00:00Z",
    "updated_at": "2026-09-23T12:00:00Z",
    "name": "Бизнес",
    "role": "business",
    "company_name": "Demo Business",
    "exp": 30
  },
  "tags": [],
  "achievements": [
    {
      "user_id": 1,
      "achievement_id": 3,
      "unlocked_at": "2026-09-23T12:00:00Z"
    }
  ],
  "exp_history": [
    {
      "id": 1,
      "user_id": 1,
      "amount": 30,
      "reason": "achievement_unlocked",
      "milestone_id": null,
      "task_id": null,
      "team_id": null,
      "achievement_id": 3,
      "created_at": "2026-09-23T12:00:00Z"
    }
  ]
}
```

The arrays contain full Tags, UserAchievement relations and ExpTransactions. Refresh profiles after EXP-producing actions or tag updates; there is no separate EXP or user-achievement endpoint.

### Health

All three health routes use the same successful JSON:

```json
{
  "status": "ok"
}
```

`/livez` checks the running HTTP process. `/healthz` and `/readyz` also check PostgreSQL and return `503` if unavailable.

### Errors

Application errors use one envelope:

```json
{
  "error": {
    "code": "conflict",
    "message": "conflict: revision changed; reload the task"
  }
}
```

| HTTP | `error.code` | Common cause |
| --- | --- | --- |
| 400 | `invalid_input` | Missing demo header on protected routes; malformed JSON; unknown field; invalid IDs, values or required fields. |
| 403 | `forbidden` | Wrong role, non-owner/non-captain mutation, or disallowed browser origin. |
| 404 | `not_found` | Unknown resource/header user; non-owner reading an unpublished task; unknown route. |
| 405 | `method_not_allowed` | Unsupported method for an existing route. |
| 409 | `conflict` | Stale revision, duplicate/conflicting action, invalid state transition, or AI evaluation not ready. |
| 413 | `payload_too_large` | JSON request larger than 1 MiB. |
| 415 | `unsupported_media_type` | Missing/non-JSON Content-Type for a body-required endpoint. |
| 500 | `internal` | Unexpected server error. |
| 503 | `unavailable` | Database unavailable on health/readiness checks. |

The demo API does not return a JWT or use `401` for a missing identity header. A task AI failure is usually represented by a successful Task read with `ai_status: "failed"`, rather than a failing GET response. Error messages may vary; branch UI behavior on HTTP status and `error.code`. For a stale revision, reload and reconcile edits before resubmitting.
