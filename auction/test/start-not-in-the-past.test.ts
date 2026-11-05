import { describe, it, expect } from "vitest";
import { validateStartNotInPast } from "../src/time-rules.js";

const NOW = 1_700_000_000_000;

describe("validateStartNotInPast", () => {
  it("gives no problems when the start is well after now", () => {
    expect(validateStartNotInPast(NOW + 3_600_000, NOW)).toEqual([]);
  });

  it("gives no problems when the start is one millisecond after now", () => {
    expect(validateStartNotInPast(NOW + 1, NOW)).toEqual([]);
  });

  it("rejects a start equal to now", () => {
    expect(validateStartNotInPast(NOW, NOW)).toEqual(["START_NOT_AFTER_NOW"]);
  });

  it("rejects a start one millisecond before now", () => {
    expect(validateStartNotInPast(NOW - 1, NOW)).toEqual([
      "START_NOT_AFTER_NOW",
    ]);
  });

  it("rejects a start long before now", () => {
    expect(validateStartNotInPast(NOW - 86_400_000, NOW)).toEqual([
      "START_NOT_AFTER_NOW",
    ]);
  });

  it("stays silent when the start is invalid, because validateTimeRules reports that", () => {
    expect(validateStartNotInPast(NaN, NOW)).toEqual([]);
    expect(validateStartNotInPast(0, NOW)).toEqual([]);
  });
});
