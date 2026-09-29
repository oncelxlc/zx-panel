import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".agents", ".codex", "dist", "internal/web/ui/dist", "node_modules", "public/mockServiceWorker.js", "playwright-report", "test-results", "test-results-api"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["public/theme-init.js"], languageOptions: { globals: globals.browser } },
  { files: ["scripts/**/*.mjs", "tests/**/*.mjs"], languageOptions: { globals: globals.node } },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {allowConstantExport: true},
      ],
    },
  },
);
