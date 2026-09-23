-- Destructive rollback: drops the Larda schema and all its data.
-- Apply inside a transaction. No CASCADE: unexpected external dependencies fail.
DROP TABLE exp_transactions;
DROP TABLE user_achievements;
DROP TABLE achievements;
DROP TABLE milestones;
DROP TABLE proposals;
DROP TABLE task_questions;
DROP TABLE task_tags;
DROP TABLE tasks;
DROP TABLE team_members;
DROP TABLE teams;
DROP TABLE user_tags;
DROP TABLE tags;
DROP TABLE users;
