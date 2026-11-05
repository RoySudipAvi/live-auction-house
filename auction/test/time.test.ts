import { describe, it, expect } from "vitest";
import { isValidTime } from "../src/time.js";

describe("isValidTime", () => {
  it("accepts a safe whole number greater than 0", () => {
    expect(isValidTime(1)).toBe(true);
    expect(isValidTime(1_700_000_000_000)).toBe(true);
    expect(isValidTime(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["a negative number", -1],
    ["a decimal", 10.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["one above the safe limit", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects %s", (_name, value) => {
    expect(isValidTime(value)).toBe(false);
  });

  it.each([
    ["a string", "1700000000000"],
    ["null", null],
    ["undefined", undefined],
    ["an object", {}],
  ])("rejects %s", (_name, value) => {
    expect(isValidTime(value)).toBe(false);
  });
});
