-- 扩展只读系统运行时类别，面板管理与默认指针仍限于 Node.js/Go。
ALTER TABLE app.runtime_installations DROP CONSTRAINT runtime_installations_kind_check;
ALTER TABLE app.runtime_installations ADD CONSTRAINT runtime_installations_kind_check
    CHECK (kind IN ('node','go','rust','python','java','php','ruby','dotnet','bun','deno')
        AND (kind IN ('node','go') OR payload->>'ownership' = 'external'));
