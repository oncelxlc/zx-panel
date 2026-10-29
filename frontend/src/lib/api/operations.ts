import { z } from "zod";

/** appDraftSchema 限定应用输入，拒绝另一种执行类型的字段。 */
const appDraftSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    workingDirectory: z.string().min(1).max(4096),
    runAsUser: z.string().min(1).max(64),
    restartPolicy: z.enum(["no", "on-failure"]),
    execution: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("node"),
          runtimeInstallationId: z.string().min(1),
          entryFile: z.string().min(1),
          args: z.array(z.string()).max(128),
        })
        .strict(),
      z
        .object({
          kind: z.literal("binary"),
          executablePath: z.string().min(1),
          args: z.array(z.string()).max(128),
          buildToolchainLabel: z.string().nullable(),
        })
        .strict(),
    ]),
  })
  .strict();
/** environmentSchema 将删除与设置区分，不接受未声明的环境操作。 */
const environmentSchema = z
  .array(
    z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("set"),
          key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/),
          value: z.string().max(65536),
          secret: z.boolean(),
        })
        .strict(),
      z.object({ action: z.literal("remove"), key: z.string() }).strict(),
    ]),
  )
  .max(100);
/** operationSchema 是页面、Mock 和契约正反例共享的写入联合类型。 */
export const operationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("runtime.install"),
      releaseId: z.string().min(1),
      makeDefault: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("runtime.set-default"),
      installationId: z.string().min(1),
      expectedRevision: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("runtime.uninstall"),
      installationId: z.string().min(1),
      expectedRevision: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("app.create"),
      app: appDraftSchema,
      environmentChanges: environmentSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("app.update"),
      appId: z.string().min(1),
      expectedRevision: z.string().min(1),
      app: appDraftSchema,
      environmentChanges: environmentSchema,
    })
    .strict(),
  ...(["app.start", "app.stop", "app.restart", "app.delete"] as const).map(
    (action) =>
      z
        .object({
          action: z.literal(action),
          appId: z.string().min(1),
          expectedRevision: z.string().min(1),
        })
        .strict(),
  ),
]);
