import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

it("ships the existing sanitized demo1 unchanged within the upload limit", () => {
  const published = readFileSync("public/samples/demo1.bbr");
  expect(published.equals(readFileSync("demo-replays/demo1.bbr"))).toBe(true);
  expect(published.length).toBeGreaterThan(0);
  expect(published.length).toBeLessThanOrEqual(REPLAY_LIMITS.inputBytes);
});
