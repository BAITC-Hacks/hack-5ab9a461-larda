# Larda

A hackathon platform connecting business tasks with student teams.

**Stack:** Go, Gin, GORM, PostgreSQL, Docker Compose; React frontend planned. **Current state:** REST API implemented with hexagonal architecture, SQL migrations, OpenAI integration, demo data and tests.

## Product flow

1. Business describes a task. Persist raw input before any AI call. OpenAI asks three to seven relevant questions in one round; answers produce an editable card without invented facts. Support an explicitly selected, labeled local fallback.
2. Business confirms and publishes the card. Backend explains readiness and missing information. Catalog filters: topic, readiness, tags.
3. Captains submit proposals; business manually accepts none, one or several. The captain or task owner can propose milestones after acceptance. Only the task owner approves milestone definitions and results; only captains submit results.
4. Business completes a task after at least one accepted proposal is completed and the remaining accepted proposals are completed/cancelled. Completion and achievements award EXP.

## Schema and rules

- Users are `business` or `student`. Teams contain students and exactly one `captain`; the database enforces at most one, the service ensures one exists.
- Tags describe student skills and task requirements; aggregate member tags for team skills.
- Keep working edits in `tasks.draft_card`. Confirmation atomically replaces card fields/tags/score and clears the draft. Publication, readiness and execution are separate states.
- Each saved edit queues an LLM evaluation against a numbered revision. Keep draft evaluation separate from confirmed score; reject stale edits and discard stale LLM results. Failed checks retain the draft and can be explicitly retried. No additional question rounds in this MVP.
- Structure: task -> proposals -> milestones. No milestone stages or membership snapshots. Multiple proposals per team/task are allowed.

Readiness weights: context/need **20**, data **20**, result **15**, success criteria **15**, constraints **10**, users **10**, contact/interaction/feedback **10**. LLM determines criterion scores and the total from 0 to 100; the backend validates criterion bounds and their sum. Only human-confirmed scores affect the catalog. Levels: **0–39 draft**, **40–69 working**, **70–89 ready**, **90–100 priority**. All published tasks accept proposals regardless of score. Sort by readiness, not EXP.

## EXP rules

- Milestone `exp_reward` is a pool split among current members: quotient each, remainder by ascending user ID (100 / 3 -> 34, 33, 33). Reject empty teams; record zero shares.
- Task completion pays `team_exp_reward` once per distinct completed team, split the same way; `business_exp_reward` goes to the owner. Multiple-team members may receive multiple shares.
- Achievements are personal, unlocked once. Count distinct task/milestone IDs from student payout history, including zero shares; count business events from owned tasks. EXP itself triggers no achievements.
- One transaction locks task, teams, then users (IDs ascending), validates actor/state, records completion/payouts/unlocks and increments EXP only for new ledger rows. Membership edits lock the same team. Retries return existing results without redistributing to new members.
- Completed records and payouts are immutable. Maintain `users.exp = SUM(exp_transactions.amount)`. Payout logic belongs to the service, not this migration.

## Database setup

The API automatically applies the embedded SQL migrations using a migration ledger and advisory lock. It also adopts an existing schema created by the initial migration. Docker Compose provides PostgreSQL 16. For a manual initial setup on PostgreSQL 15+, apply once from the project root:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f migrations/000001_init.up.sql
```

PowerShell: use `"$env:DATABASE_URL"`. The initial migration creates 13 tables, six tags and four achievements. Starting the API then adopts this schema and applies the second migration, adding durable AI jobs, card revisions and milestone approval metadata. Starter rewards: 100 per milestone/team task, 50 per business task. Prefer the automatic migration path in README; do not apply later migrations manually outside the migration ledger.

Destructive rollback of an initial-only database (removes application data; on the current schema, roll back migration 000002 first):

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f migrations/000001_init.down.sql
```

## Implementation notes for agents

- SQL migrations are authoritative; avoid GORM `AutoMigrate`. Use explicit models (`int64` IDs, timestamp pointers, JSONB), no `deleted_at`; application writes maintain `updated_at`.
- Services enforce ownership, membership, transitions, rating and rewards. Allowlist client-editable fields; preserve empty/zero updates. Freeze rewards when work starts.
- Validate AI responses; keep keys server-side and AI calls outside transactions.
- Test score boundaries, low-score proposals, multiple teams, uneven splits, membership changes, retries/concurrency and one-time achievements. Demo: five drafts, cards, teams and proposals each.
- Prioritize the complete workflow; registration, chat and uploads are out of scope. Demo identities: one business, one captain and one ordinary student; `X-Demo-User-ID` selects them without authentication. API keys come only from server environment. Use domain/application/ports with Gin, GORM/PostgreSQL and OpenAI adapters.
