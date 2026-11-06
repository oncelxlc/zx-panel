import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/** 每个测试释放 DOM，避免焦点和 Portal 状态跨用例污染。 */
afterEach(cleanup);
