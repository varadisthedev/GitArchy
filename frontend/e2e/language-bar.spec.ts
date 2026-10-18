import { expect, test } from "@playwright/test";
import { byMetric, foldLanguages, topLanguage } from "../src/components/analytics/language-bar";

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

test("topLanguage names a language, never an asset bucket, and keeps the bar's own share", () => {
  // the 84.7%-images repository: the headline must say JavaScript, at the share the bar shows
  const out = topLanguage([l("Images", 0.847), l("JavaScript", 0.077), l("JSON", 0.046), l("CSS", 0.008)]);
  expect(out?.language).toBe("JavaScript");
  expect(out?.share).toBeCloseTo(0.077);
});

test("topLanguage skips Models and Other for an ML repository", () => {
  expect(topLanguage([l("Models", 0.452), l("Other", 0.1), l("Jupyter Notebook", 0.3)])?.language)
    .toBe("Jupyter Notebook");
});

test("topLanguage falls back to the largest bucket when a tree holds no code at all", () => {
  expect(topLanguage([l("Images", 0.9), l("Fonts", 0.1)])?.language).toBe("Images");
  expect(topLanguage([])).toBeNull();
});

test("byMetric re-ranks by file count, rescuing languages that weigh nothing", () => {
  // the ML repository: one huge model, many small Python files
  const rows = [
    { language: "Models", bytes: 9000, files: 2, share: 0.9 },
    { language: "Python", bytes: 900, files: 40, share: 0.09 },
    { language: "CSS", bytes: 100, files: 8, share: 0.01 },
  ];
  const out = byMetric(rows, "files");
  expect(out.map((x) => x.language)).toEqual(["Python", "CSS", "Models"]);
  expect(out[0].share).toBeCloseTo(40 / 50);
  expect(topLanguage(out)?.language).toBe("Python");
  expect(byMetric(rows, "bytes")).toBe(rows); // bytes is the server's own ordering, untouched
});
