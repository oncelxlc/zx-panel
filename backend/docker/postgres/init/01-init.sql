-- 建立独立业务 Schema
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION CURRENT_USER;

-- 让 Compose 配置的数据库用户默认优先访问 app Schema
ALTER ROLE CURRENT_USER SET search_path TO app, public;

-- 示例表，可以删除
CREATE TABLE IF NOT EXISTS app.system_info (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        varchar(100) NOT NULL,
    value       text,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app.system_info (name, value)
VALUES ('initialized_by', 'docker-entrypoint-initdb.d');
