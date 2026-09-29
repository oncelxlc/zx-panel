CREATE INDEX task_logs_task_id_idx ON app.task_logs(task_id,id);
CREATE INDEX task_actor_created_idx ON app.tasks(actor_id,created_at DESC);
CREATE INDEX outbox_pending_idx ON app.event_outbox(id) WHERE published_at IS NULL;
CREATE INDEX managed_apps_runtime_idx ON app.managed_apps(runtime_id);
CREATE INDEX plan_actor_expires_idx ON app.operation_plans(actor_id,expires_at);
CREATE INDEX panel_logs_at_idx ON app.panel_logs(at);
CREATE INDEX idempotency_task_idx ON app.idempotency_records(task_id);
