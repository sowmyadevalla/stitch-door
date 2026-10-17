/*
# Delivery workflow fix: allow non-task history events

1. Modified tables
- `delivery_task_history.task_id` changed from NOT NULL to nullable, so account-level
  events (e.g. linking a login to an agent) can be recorded without a task.

2. Security
- No policy changes.
*/

ALTER TABLE public.delivery_task_history ALTER COLUMN task_id DROP NOT NULL;
