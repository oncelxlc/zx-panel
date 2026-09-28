import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import {
  getSystemTheme,
  isSystemThemePath,
  syncDocumentTheme,
} from "../src/theme/systemTheme.ts";

test("登录首屏跟随系统且默认暗色，后台继续读取历史偏好", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);

  for (const pathname of ["/login", "/login/", "/LOGIN//", "/"]) {
    for (const system of ["light", "dark", "unsupported"]) {
      for (const stored of ["light", "dark", "system", "blocked"]) {
        let storageReads = 0;
        const root = {
          dataset: {},
          classList: { toggle: (name, enabled) => { root.dark = enabled; } },
        };
        runInNewContext(script, {
          document: { documentElement: root },
          window: {
            location: { pathname },
            matchMedia: system === "unsupported" ? undefined : () => ({ matches: system === "light" }),
            localStorage: {
              getItem: () => {
                storageReads++;
                if (stored === "blocked") throw new Error("Storage disabled");
                return stored;
              },
            },
          },
        });
        const forcedSystem = isSystemThemePath(pathname);
        const expected = !forcedSystem && ["light", "dark"].includes(stored)
          ? stored
          : system === "light" ? "light" : "dark";
        assert.equal(root.dataset.theme, expected, `${pathname}/${system}/${stored}`);
        assert.equal(root.dark, expected === "dark");
        if (forcedSystem) assert.equal(storageReads, 0);
      }
    }
  }
  assert.equal(isSystemThemePath("/login/settings"), false);
  assert.equal(getSystemTheme(), "dark");
});

test("主题切换支持动画、快速取消、减少动态效果和无 API 回退", async (t) => {
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });
  let systemLight = false;
  let reducedMotion = false;
  let skipped = 0;
  const updates = [];
  const root = {
    dataset: { theme: "dark" },
    classList: { toggle: (name, enabled) => { root.dark = enabled; } },
  };
  globalThis.window = {
    matchMedia: (query) => ({ matches: query.includes("color-scheme") ? systemLight : reducedMotion }),
  };
  globalThis.document = {
    documentElement: root,
    visibilityState: "visible",
    startViewTransition: (update) => {
      updates.push(update);
      return {
        ready: Promise.reject(new Error("Animation skipped")),
        skipTransition: () => { skipped++; },
      };
    },
  };

  assert.equal(getSystemTheme(), "dark");
  systemLight = true;
  assert.equal(getSystemTheme(), "light");
  assert.equal(syncDocumentTheme("dark"), undefined);
  const cancel = syncDocumentTheme("light");
  assert.equal(updates.length, 1);
  assert.equal(root.dataset.theme, "dark");
  cancel();
  updates[0]();
  assert.equal(skipped, 1);
  assert.equal(root.dataset.theme, "dark");

  syncDocumentTheme("light");
  updates[1]();
  assert.equal(root.dataset.theme, "light");
  assert.equal(root.dark, false);
  reducedMotion = true;
  syncDocumentTheme("dark");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(updates.length, 2);

  reducedMotion = false;
  globalThis.document.visibilityState = "hidden";
  syncDocumentTheme("light");
  assert.equal(root.dataset.theme, "light");
  assert.equal(updates.length, 2);
  delete globalThis.document.startViewTransition;
  globalThis.document.visibilityState = "visible";
  syncDocumentTheme("dark");
  assert.equal(root.dark, true);
  delete globalThis.window.matchMedia;
  assert.equal(getSystemTheme(), "dark");
  await Promise.resolve();
});
