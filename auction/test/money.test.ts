import { describe, it, expect } from "vitest";
import { isValidAmount } from "../src/money.js";

describe("isValidAmount", () => {
  it("accepts whole numbers greater than 0", () => {
    expect(isValidAmount(1)).toBe(true);
    expect(isValidAmount(1000)).toBe(true);
    expect(isValidAmount(50000)).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["a negative number", -100],
    ["a decimal", 10.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["one above the safe limit", Number.MAX_SAFE_INTEGER + 1],
    ["a huge number", 1e300],
  ])("rejects %s", (_name, value) => {
    expect(isValidAmount(value)).toBe(false);
  });

  it("accepts the largest safe whole number", () => {
    expect(isValidAmount(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});
