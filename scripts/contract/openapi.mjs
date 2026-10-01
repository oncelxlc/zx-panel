import { randomUUID } from "node:crypto";
import { readFile, writeFile, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { z } from "zod";

/** loadSchemas 复用真实 Zod 定义，临时模块在读取后立即清除。 */
async function loadSchemas(source) {
  const temporary = resolve(import.meta.dirname, `.schema-${randomUUID()}.mjs`);
  try {
    await writeFile(temporary, ts.transpileModule(await readFile(source, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { flag: "wx" });
    return await import(pathToFileURL(temporary).href);
  } finally { await rm(temporary, { force: true }); }
}
/** schema 不重复维护 DTO 定义，OpenAPI 3.1 使用相同 JSON Schema 约束。 */
function schema(value) { const result = z.toJSONSchema(value, { target: "draft-2020-12", io: "input" }); delete result.$schema; return result; }
const s = await loadSchemas(resolve("src/lib/api/schemas.ts"));
const o = await loadSchemas(resolve("src/lib/api/operations.ts"));
const models = {
  SystemInfo: s.systemSchema, Capabilities: s.capabilitiesSchema, MetricSnapshot: s.snapshotSchema, History: s.historySchema,
  Installation: s.installationSchema, Release: s.releaseSchema, Application: s.appSchema, Task: s.taskSchema, OperationPlan: s.planSchema,
  Operation: o.operationSchema, LogRecord: s.logSchema, Bootstrap: s.bootstrapSchema, RuntimeSummary: s.summarySchema, RuntimeSummaries: z.array(s.summarySchema), Settings: s.settingsSchema,
  LogSource: s.logSourceSchema, LogPage: s.logPageSchema, InstallationPage: s.pageSchema(s.installationSchema), ReleasePage: s.releasePageSchema,
  ApplicationPage: s.pageSchema(s.appSchema), ProcessPage: s.pageSchema(s.processSchema), TaskPage: s.pageSchema(s.taskSchema),
  User: z.object({ id: z.number().int(), username: z.string(), displayName: z.string(), role: z.string(), enabled: z.boolean(), createdAt: s.dateSchema, updatedAt: s.dateSchema }),
  LoginRequest: z.strictObject({ username: z.string().regex(/^[A-Za-z0-9_.-]{3,32}$/), password: z.string().min(1).max(72).describe("Preserved verbatim; maximum 72 UTF-8 bytes") }),
  SetupRequest: z.strictObject({ token: z.string().length(43), username: z.string().regex(/^[A-Za-z0-9_.-]{3,32}$/), password: z.string().min(12).max(72).describe("At least 12 characters, maximum 72 UTF-8 bytes; never trimmed") }),
  PasswordRequest: z.strictObject({ currentPassword: z.string().max(72), newPassword: z.string().min(12).max(72) }),
  EmptyRequest: z.strictObject({}),
  Acceptance: z.strictObject({ planId: z.string().min(1), confirmationText: z.string().nullable() }),
  CatalogRequest: z.strictObject({ kinds: z.array(z.enum(["node", "go"])).min(1).max(2) }),
  LogFilter: z.strictObject({ sourceId: z.string().max(200), level: z.enum(["all", "debug", "info", "warn", "error", "unknown"]), search: z.string().max(200), from: s.dateSchema, to: z.union([s.dateSchema, z.literal("")]) }),
  SettingsChange: z.strictObject({ expectedRevision: z.string(), displayTimezone: z.string(), metricsRetentionHours: z.number().int().min(1).max(24), taskRetentionDays: z.number().int().min(1).max(90), auditRetentionDays: z.number().int().min(7).max(365) }),
};
models.Session = z.object({ authenticated: z.boolean(), user: models.User.nullable(), expiresAt: s.dateSchema.nullable(), csrfToken: z.string() });
models.LoginResult = z.object({ user: models.User, expiresAt: s.dateSchema, csrfToken: z.string() });
models.References = z.object({ apps: z.array(s.appSchema), processes: z.array(s.processSchema), complete: z.boolean(), reason: z.string().nullable() });
if(process.argv.includes("--check-go")) {
  const fixtures=JSON.parse(await readFile(resolve("test-results/go-api.json"),"utf8"));
  for(const [name,body] of Object.entries(fixtures)) {
    if(!models[name])throw new Error(`Unknown Go fixture ${name}`);
    z.object({success:z.literal(true),data:models[name],error:z.null(),meta:z.object({requestId:z.string(),serverTime:s.dateSchema})}).parse(body);
  }
  console.log(`Validated ${Object.keys(fixtures).length} real Go responses with frontend schemas.`);
}
const components = Object.fromEntries(Object.entries(models).map(([name, value]) => [name, schema(value)]));
components.Meta = { type: "object", required: ["requestId", "serverTime"], properties: { requestId: { type: "string" }, serverTime: { type: "string", format: "date-time" } } };
components.Error = { type: "object", required: ["success", "data", "error", "meta"], properties: { success: { const: false }, data: { type: "null" }, error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } }, meta: { $ref: "#/components/schemas/Meta" } } };
/** success 为所有 JSON 成功响应复用同一外壳，202 仅表示受理。 */
function success(data) { return { type: "object", required: ["success", "data", "error", "meta"], properties: { success: { const: true }, data, error: { type: "null" }, meta: { $ref: "#/components/schemas/Meta" } } }; }
/** ref 只引用已实际生成的模型名称。 */
function ref(name) { if (!components[name]) throw new Error(`Unknown model ${name}`); return { $ref: `#/components/schemas/${name}` }; }
/** parameter 声明 URL 条件和服务器资源消耗边界。 */
function parameter(name, definition = { type: "string" }, required = false) { return { name, in: "query", required, schema: definition }; }
const paging = [parameter("cursor"), parameter("limit", { type: "integer", minimum: 1, maximum: 200, default: 50 })];
const logFilters = [parameter("sourceId", { type: "string" }, true), parameter("from", { type: "string", format: "date-time" }), parameter("to", { type: "string" }), parameter("level", { type: "string", enum: ["all", "debug", "info", "warn", "error", "unknown"], default: "all" }), parameter("search", { type: "string", maxLength: 200 })];
const paths = {};
/** route 同时声明安全策略、响应外壳和输入 Schema。 */
function route(method, path, result, options = {}) {
  const write = method !== "get";
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({ name: match[1], in: "path", required: true, schema: { type: "string" } }));
  parameters.push(...(options.parameters ?? []));
  if (write) parameters.push({ name: "Origin", in: "header", required: true, schema: { type: "string" } }, { name: "X-CSRF-Token", in: "header", required: true, schema: { type: "string" } });
  if (options.idempotency) parameters.push({ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" } });
  const code = options.code ?? 200;
  const entry = { operationId: `${method}_${path.replace(/[/{}/.-]+/g, "_")}`, summary: options.summary ?? path, security: options.public ? [] : [{ sessionCookie: [] }], parameters, responses: { [code]: { description: code === 202 ? "Durably accepted; inspect Task.status for execution result" : "Success", content: options.stream ? { "text/event-stream": { schema: { type: "string" } } } : options.download ? { "text/plain": { schema: { type: "string" } } } : { "application/json": { schema: success(result) } } }, default: { description: "Stable business or security error with request ID", content: { "application/json": { schema: ref("Error") } } } } };
  if (options.input) entry.requestBody = { required: true, content: { "application/json": { schema: ref(options.input) } } };
  (paths[path] ??= {})[method] = entry;
}
route("get", "/auth/session", ref("Session"), { public: true });
route("get", "/setup/status", { type: "object", required: ["setupRequired"], properties: { setupRequired: { type: "boolean" } } }, { public: true });
route("post", "/auth/setup", { type: "object", required: ["initialized"], properties: { initialized: { const: true } } }, { public: true, input: "SetupRequest", code: 201 });
route("post", "/auth/login", ref("LoginResult"), { public: true, input: "LoginRequest" });
route("get", "/auth/me", { type: "object", required: ["user"], properties: { user: ref("User") } });
route("post", "/auth/logout", { type: "object", properties: { loggedOut: { const: true } } }, { input: "EmptyRequest" });
route("post", "/auth/password", { type: "object", properties: { changed: { const: true } } }, { input: "PasswordRequest" });
for (const [path, name] of [["/bootstrap", "Bootstrap"], ["/system/info", "SystemInfo"], ["/system/capabilities", "Capabilities"], ["/metrics/latest", "MetricSnapshot"], ["/settings", "Settings"]]) route("get", path, ref(name));
route("get", "/metrics/history", ref("History"), { parameters: [parameter("metric", { type: "string" }, true), parameter("deviceId"), parameter("from", { type: "string", format: "date-time" }, true), parameter("to", { type: "string", format: "date-time" }, true), parameter("stepSeconds", { type: "integer", minimum: 2, maximum: 3600 }, true)] });
route("get", "/runtimes", ref("RuntimeSummaries"));
route("get", "/runtimes/{kind}/installations", ref("InstallationPage"), { parameters: paging });
route("get", "/runtimes/{kind}/releases", ref("ReleasePage"), { parameters: paging });
route("get", "/runtime-installations/{id}/references", ref("References"));
route("post", "/runtimes/catalog/refresh", ref("Task"), { input: "CatalogRequest", idempotency: true, code: 202 });
route("post", "/operations/preview", ref("OperationPlan"), { input: "Operation" });
route("post", "/operations", ref("Task"), { input: "Acceptance", idempotency: true, code: 202 });
route("get", "/apps", ref("ApplicationPage"), { parameters: [...paging, parameter("filter")] });
route("get", "/apps/{id}", ref("Application"));
route("get", "/processes", ref("ProcessPage"), { parameters: [...paging, parameter("search"), parameter("sort", { type: "string", enum: ["cpu", "memory", "pid"] })] });
route("get", "/tasks", ref("TaskPage"), { parameters: [...paging, parameter("status")] });
route("get", "/tasks/{id}", ref("Task"));
route("get", "/tasks/{id}/logs", ref("LogPage"), { parameters: [parameter("cursor"), parameter("limit", { type: "integer", minimum: 1, maximum: 500 })] });
route("post", "/tasks/{id}/cancel", ref("Task"), { input: "EmptyRequest" });
route("get", "/events", null, { stream: true, parameters: [parameter("after"), { name: "Last-Event-ID", in: "header", schema: { type: "string" } }] });
route("get", "/logs/sources", { type: "array", items: ref("LogSource") });
route("get", "/logs", ref("LogPage"), { parameters: [...logFilters, parameter("cursor"), parameter("limit", { type: "integer", minimum: 1, maximum: 500 })] });
route("get", "/logs/stream", null, { stream: true, parameters: [...logFilters, parameter("after")] });
route("post", "/logs/exports", ref("Task"), { input: "LogFilter", idempotency: true, code: 202 });
route("get", "/logs/exports/{id}/download", null, { download: true });
route("patch", "/settings", ref("Settings"), { input: "SettingsChange" });
const document = { openapi: "3.1.0", info: { title: "zx-panel", version: "1.1.0", description: "Single-server Linux panel. Every JSON write rejects duplicate/unknown/case-alias keys and trailing values (1 MiB maximum). Cookies: HttpOnly, Path=/, SameSite=Strict, Secure in production; preauth 10 min, idle 30 min, absolute 12 h. Bearer tokens are not accepted. Unavailable metrics are null. Full production acceptance requires Linux/systemd evidence." }, servers: [{ url: "/api/v1" }], paths, components: { securitySchemes: { sessionCookie: { type: "apiKey", in: "cookie", name: "__Host-zx-panel-session", description: "Development HTTP uses zx-panel-session; anonymous auth uses an independent preauth cookie and CSRF handshake." } }, schemas: components } };
await writeFile(resolve("docs/openapi.json"), JSON.stringify(document, null, 2) + "\n");
const codes = new Set(["INTERNAL_ERROR", "MALFORMED_JSON", "BODY_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "INVALID_INPUT"]);
for (const dir of ["internal/api", "internal/control", "internal/security"]) for (const entry of await readdir(dir)) { if (!entry.endsWith(".go") || entry.endsWith("_test.go")) continue; const text = await readFile(resolve(dir, entry), "utf8"); for (const match of text.matchAll(/Fail\(\d+,\s*"([A-Z_]+)"/g)) codes.add(match[1]); }
await writeFile(resolve("docs/error-codes.json"), JSON.stringify([...codes].sort(), null, 2) + "\n");
console.log(`Generated ${Object.keys(paths).length} API paths and ${Object.keys(components).length} schemas from production validators.`);
