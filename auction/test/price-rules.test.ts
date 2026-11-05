import { describe, it, expect } from "vitest";
import { validatePriceRules } from "../src/price-rules.js";

const GOOD = { startingPrice: 50000, minIncrement: 1000 };

const BAD_AMOUNTS: [string, number][] = [
  ["zero", 0],
  ["a negative number", -1],
  ["a decimal", 10.5],
  ["NaN", NaN],
];

describe("validatePriceRules", () => {
  describe("a good input", () => {
    it("gives no problems without a reserve", () => {
      expect(validatePriceRules(GOOD)).toEqual([]);
    });

    it("gives no problems with a reserve above the starting price", () => {
      expect(validatePriceRules({ ...GOOD, reservePrice: 80000 })).toEqual([]);
    });

    it("gives no problems when the reserve equals the starting price", () => {
      expect(validatePriceRules({ ...GOOD, reservePrice: 50000 })).toEqual([]);
    });
  });

  describe("starting price", () => {
    it.each(BAD_AMOUNTS)("rejects %s", (_name, value) => {
      expect(validatePriceRules({ ...GOOD, startingPrice: value })).toEqual([
        "INVALID_STARTING_PRICE",
      ]);
    });
  });

  describe("minimum increment", () => {
    it.each(BAD_AMOUNTS)("rejects %s", (_name, value) => {
      expect(validatePriceRules({ ...GOOD, minIncrement: value })).toEqual([
        "INVALID_MIN_INCREMENT",
      ]);
    });
  });

  describe("reserve price", () => {
    it.each(BAD_AMOUNTS)("rejects %s", (_name, value) => {
      expect(validatePriceRules({ ...GOOD, reservePrice: value })).toEqual([
        "INVALID_RESERVE_PRICE",
      ]);
    });

    it("rejects a reserve below the starting price", () => {
      expect(validatePriceRules({ ...GOOD, reservePrice: 49999 })).toEqual([
        "RESERVE_BELOW_STARTING_PRICE",
      ]);
    });

    it("does not also say 'below start' when the reserve itself is invalid", () => {
      expect(validatePriceRules({ ...GOOD, reservePrice: -5 })).toEqual([
        "INVALID_RESERVE_PRICE",
      ]);
    });

    it("does not say 'below start' when the starting price is invalid", () => {
      expect(
        validatePriceRules({ ...GOOD, startingPrice: 0, reservePrice: 100 }),
      ).toEqual(["INVALID_STARTING_PRICE"]);
    });
  });

  describe("several problems at once", () => {
    it("reports every invalid field, in a fixed order", () => {
      expect(
        validatePriceRules({
          startingPrice: 0,
          minIncrement: -1,
          reservePrice: 10.5,
        }),
      ).toEqual([
        "INVALID_STARTING_PRICE",
        "INVALID_MIN_INCREMENT",
        "INVALID_RESERVE_PRICE",
      ]);
    });
  });
});
