import { describe, expect, it } from "vitest";
import { mergeLogs } from "@/features/panel/logBuffer";
import { operationSchema } from "@/lib/api/operations";
import {
  appSchema,
  installationSchema,
  releaseSchema,
  snapshotSchema,
  systemSchema,
  taskSchema,
} from "@/lib/api/schemas";
import {
  demoApps,
  demoInstallations,
  demoMetrics,
  demoReleases,
  demoSystem,
  demoTasks,
} from "@/mocks/fixtures";
import { formatPercent, freshness } from "@/lib/format";

describe("public API and bounded logs", () => {
  it("validates every fixed demonstration model with the production schema", () => {
    expect(systemSchema.parse(demoSystem)).toBeTruthy();
    expect(snapshotSchema.parse(demoMetrics)).toBeTruthy();
    demoApps.forEach((value) => appSchema.parse(value));
    demoInstallations.forEach((value) => installationSchema.parse(value));
    demoReleases.forEach((value) => releaseSchema.parse(value));
    demoTasks.forEach((value) => taskSchema.parse(value));
  });
  it("deduplicates within batches and caps both records and bytes", () => {
    const line = {
      id: "1",
      sourceId: "panel",
      at: "2026-09-28T14:24:00Z",
      level: "info" as const,
      message: "hello",
      truncated: false,
    };
    expect(mergeLogs([], [line, line]).records).toHaveLength(1);
    const flood = Array.from({ length: 6500 }, (_, index) => ({
      ...line,
      id: String(index),
    }));
    const bounded = mergeLogs([], flood);
    expect(bounded.records).toHaveLength(5000);
    expect(bounded.droppedCount).toBe(1500);
    const large = mergeLogs(
      [],
      flood
        .slice(0, 500)
        .map((item) => ({ ...item, message: "中".repeat(5000) })),
    );
    expect(
      large.records.reduce(
        (sum, item) =>
          sum +
          new TextEncoder().encode(item.message).byteLength +
          128 +
          item.id.length +
          item.sourceId.length,
        0,
      ),
    ).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(large.droppedCount).toBeGreaterThan(0);
  });
  it("rejects cross-action fields and preserves argument and secret whitespace", () => {
    expect(
      operationSchema.safeParse({
        action: "runtime.install",
        releaseId: "node:22.1.0:linux-x64",
        makeDefault: false,
        remoteHost: "localhost",
      }).success,
    ).toBe(false);
    expect(
      operationSchema.safeParse({
        action: "runtime.set-default",
        installationId: "1",
        expectedRevision: "1",
        makeDefault: false,
      }).success,
    ).toBe(false);
    const value = operationSchema.parse({
      action: "app.create",
      app: {
        name: "sample",
        workingDirectory: "/srv/apps/sample",
        runAsUser: "apps",
        restartPolicy: "no",
        execution: {
          kind: "binary",
          executablePath: "/srv/apps/sample/run",
          args: ["  literal ; $()  "],
          buildToolchainLabel: null,
        },
      },
      environmentChanges: [
        { action: "set", key: "SECRET", secret: true, value: "  secret\n " },
      ],
    });
    expect(value.action === "app.create" && value.app.execution.args[0]).toBe(
      "  literal ; $()  ",
    );
  });
  it("distinguishes zero, warming-up and field-specific staleness", () => {
    expect(formatPercent({ value: 0, quality: "ok", reasonCode: null })).toBe(
      "0.0%",
    );
    expect(
      formatPercent({
        value: null,
        quality: "warming-up",
        reasonCode: "FIRST_SAMPLE",
      }),
    ).toBe("—");
    expect(
      freshness("2026-09-28T14:24:00Z", Date.parse("2026-09-28T14:24:20Z")),
    ).toBe("不可用");
    expect(
      freshness(
        "2026-09-28T14:24:00Z",
        Date.parse("2026-09-28T14:24:20Z"),
        true,
      ),
    ).toBe("正常");
  });
});
