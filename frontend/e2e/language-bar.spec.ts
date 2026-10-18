import { expect, test } from "@playwright/test";
import { foldLanguages } from "../src/components/analytics/language-bar";

const l = (language: string, share: number) => ({ language, bytes: share * 1000, files: 1, share });

test("foldLanguages merges the tail into the server's own Other instead of adding a second one", () => {
  const out = foldLanguages([l("Images", 0.847), l("JavaScript", 0.077), l("Other", 0.04),
                             l("CSS", 0.008), l("Vim Script", 0.004), l("Awk", 0.001)]);

  expect(out.filter((x) => x.language === "Other")).toHaveLength(1);
  expect(out.map((x) => x.language)).toEqual(["Images", "JavaScript", "CSS", "Other"]);
  expect(out.at(-1)?.share).toBeCloseTo(0.045); // 0.04 server Other + 0.004 + 0.001
  expect(out.at(-1)?.files).toBe(3);
});

test("foldLanguages leaves a clean list untouched and adds no Other", () => {
  const out = foldLanguages([l("TypeScript", 0.6), l("Python", 0.4)]);
  expect(out.map((x) => x.language)).toEqual(["TypeScript", "Python"]);
});
