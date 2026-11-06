import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ChartContainer } from "@/components/ui/chart";
import { ThemeContext } from "@/theme/themeContext";

it("keeps series colors scoped to each chart in both themes without style injection", () => {
  for (const resolvedMode of ["light", "dark"] as const) {
    const markup = renderToStaticMarkup(
      <ThemeContext.Provider
        value={{
          preference: "system",
          resolvedMode,
          setPreference: vi.fn(),
          toggleTheme: vi.fn(),
        }}
      >
        <ChartContainer
          config={{
            cpu: { theme: { light: "#17191d", dark: "#f3f4f6" } },
            memory: { color: "var(--chart-2)" },
          }}
        >
          <svg aria-label="指标" />
        </ChartContainer>
      </ThemeContext.Provider>,
    );
    const root = document.createElement("div");
    root.innerHTML = markup;
    const chart = root.querySelector<HTMLElement>('[data-slot="chart"]');
    expect(chart?.style.getPropertyValue("--color-cpu")).toBe(
      resolvedMode === "light" ? "#17191d" : "#f3f4f6",
    );
    expect(chart?.style.getPropertyValue("--color-memory")).toBe(
      "var(--chart-2)",
    );
    expect(root.querySelector("style")).toBeNull();
  }
});
