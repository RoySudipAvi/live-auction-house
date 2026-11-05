import { describe, it, expect } from "vitest";
import {
  validateAntiSnipeSettings,
  MAX_ANTI_SNIPE_SECONDS,
} from "../src/anti-snipe.js";

const ONE_HOUR_SEC = 3600;

const GOOD = { windowSec: 120, extendBySec: 120 };

const BAD_SECONDS: [string, number][] = [
  ["zero", 0],
  ["a negative number", -1],
  ["a decimal", 10.5],
  ["NaN", NaN],
  ["Infinity", Infinity],
  ["a huge number", 1e300],
];

describe("MAX_ANTI_SNIPE_SECONDS", () => {
  it("is exactly one hour", () => {
    expect(MAX_ANTI_SNIPE_SECONDS).toBe(ONE_HOUR_SEC);
  });
});

describe("validateAntiSnipeSettings", () => {
  describe("a good input", () => {
    it("gives no problems for two minutes and two minutes", () => {
      expect(validateAntiSnipeSettings(GOOD)).toEqual([]);
    });

    it("gives no problems at the smallest values", () => {
      expect(
        validateAntiSnipeSettings({ windowSec: 1, extendBySec: 1 }),
      ).toEqual([]);
    });

    it("gives no problems at exactly one hour", () => {
      expect(
        validateAntiSnipeSettings({
          windowSec: ONE_HOUR_SEC,
          extendBySec: ONE_HOUR_SEC,
        }),
      ).toEqual([]);
    });
  });

  describe("window", () => {
    it.each(BAD_SECONDS)("rejects %s", (_name, value) => {
      expect(validateAntiSnipeSettings({ ...GOOD, windowSec: value })).toEqual([
        "INVALID_ANTI_SNIPE_WINDOW",
      ]);
    });

    it("rejects a window one second above one hour", () => {
      expect(
        validateAntiSnipeSettings({
          ...GOOD,
          windowSec: ONE_HOUR_SEC + 1,
        }),
      ).toEqual(["ANTI_SNIPE_WINDOW_TOO_LONG"]);
    });
  });

  describe("extension", () => {
    it.each(BAD_SECONDS)("rejects %s", (_name, value) => {
      expect(
        validateAntiSnipeSettings({ ...GOOD, extendBySec: value }),
      ).toEqual(["INVALID_ANTI_SNIPE_EXTENSION"]);
    });

    it("rejects an extension one second above one hour", () => {
      expect(
        validateAntiSnipeSettings({
          ...GOOD,
          extendBySec: ONE_HOUR_SEC + 1,
        }),
      ).toEqual(["ANTI_SNIPE_EXTENSION_TOO_LONG"]);
    });
  });

  describe("several problems at once", () => {
    it("reports both fields when both are invalid, window first", () => {
      expect(
        validateAntiSnipeSettings({ windowSec: 0, extendBySec: -1 }),
      ).toEqual(["INVALID_ANTI_SNIPE_WINDOW", "INVALID_ANTI_SNIPE_EXTENSION"]);
    });

    it("reports both fields when both are too long", () => {
      expect(
        validateAntiSnipeSettings({
          windowSec: ONE_HOUR_SEC + 1,
          extendBySec: ONE_HOUR_SEC + 1,
        }),
      ).toEqual([
        "ANTI_SNIPE_WINDOW_TOO_LONG",
        "ANTI_SNIPE_EXTENSION_TOO_LONG",
      ]);
    });

    it("reports a different problem for each field", () => {
      expect(
        validateAntiSnipeSettings({
          windowSec: ONE_HOUR_SEC + 1,
          extendBySec: 0,
        }),
      ).toEqual(["ANTI_SNIPE_WINDOW_TOO_LONG", "INVALID_ANTI_SNIPE_EXTENSION"]);
    });
  });
});
