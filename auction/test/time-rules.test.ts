import { describe, it, expect } from "vitest";
import {
  validateTimeRules,
  MIN_AUCTION_DURATION_MS,
} from "../src/time-rules.js";

const START = 1_700_000_000_000;
const ONE_MINUTE = 60_000;
const ONE_HOUR = 3_600_000;

const GOOD = { startTime: START, endTime: START + ONE_HOUR };

const BAD_TIMES: [string, number][] = [
  ["zero", 0],
  ["a negative number", -1],
  ["a decimal", 10.5],
  ["NaN", NaN],
];

describe("MIN_AUCTION_DURATION_MS", () => {
  it("is exactly one minute", () => {
    expect(MIN_AUCTION_DURATION_MS).toBe(ONE_MINUTE);
  });
});

describe("validateTimeRules", () => {
  describe("a good input", () => {
    it("gives no problems for a one hour auction", () => {
      expect(validateTimeRules(GOOD)).toEqual([]);
    });

    it("gives no problems for exactly one minute", () => {
      expect(
        validateTimeRules({ startTime: START, endTime: START + ONE_MINUTE }),
      ).toEqual([]);
    });
  });

  describe("start time", () => {
    it.each(BAD_TIMES)("rejects %s", (_name, value) => {
      expect(validateTimeRules({ ...GOOD, startTime: value })).toEqual([
        "INVALID_START_TIME",
      ]);
    });
  });

  describe("end time", () => {
    it.each(BAD_TIMES)("rejects %s", (_name, value) => {
      expect(validateTimeRules({ ...GOOD, endTime: value })).toEqual([
        "INVALID_END_TIME",
      ]);
    });
  });

  describe("end must be after start", () => {
    it("rejects an end equal to the start", () => {
      expect(validateTimeRules({ startTime: START, endTime: START })).toEqual([
        "END_NOT_AFTER_START",
      ]);
    });

    it("rejects an end before the start", () => {
      expect(
        validateTimeRules({ startTime: START, endTime: START - ONE_HOUR }),
      ).toEqual(["END_NOT_AFTER_START"]);
    });
  });

  describe("minimum length", () => {
    it("rejects an auction one millisecond shorter than a minute", () => {
      expect(
        validateTimeRules({
          startTime: START,
          endTime: START + ONE_MINUTE - 1,
        }),
      ).toEqual(["AUCTION_TOO_SHORT"]);
    });

    it("rejects an auction of one millisecond", () => {
      expect(
        validateTimeRules({ startTime: START, endTime: START + 1 }),
      ).toEqual(["AUCTION_TOO_SHORT"]);
    });
  });

  describe("several problems at once", () => {
    it("reports both times when both are invalid, and skips the comparison", () => {
      expect(validateTimeRules({ startTime: 0, endTime: -1 })).toEqual([
        "INVALID_START_TIME",
        "INVALID_END_TIME",
      ]);
    });
  });
});
